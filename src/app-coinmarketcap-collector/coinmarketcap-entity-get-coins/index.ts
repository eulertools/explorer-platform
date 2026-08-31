import { Context, SQSEvent } from 'aws-lambda';
import axios from 'axios';
import * as AWS from 'aws-sdk';
import snakecaseKeys from 'snakecase-keys';

const client = new AWS.Kinesis({ region: process.env.AWS_REGION });

export const handler = async (event: SQSEvent, context: Context) => {
  console.log({ message: 'Retrieving records from the SQS Queue' });
  console.log({ message: 'Records', data: event.Records });
  try {

    for (const record of event.Records) {

      const { coins } = JSON.parse(record.body);

      if(coins) {

        let config:any = {
          headers: {
            ['X-CMC_PRO_API_KEY']: process.env.API_KEY,
          }
        }
    
        const coinsInfo = (await axios.get(
          `https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?id=${coins.join(',')}`, 
          config
        )).data.data;
  
        const items = Object.values(coinsInfo).map((coinData:any) => {
  
          const key = {
            identifier: `coimarketcap~${coinData.id}`,
            update_date: Math.round(new Date().getTime() / 1000),
          };
  
          if(coinData.contract_address) {
  
            coinData.networks = {};
  
            coinData.contract_address.forEach((network:any) => {
              coinData.networks[network.platform.coin.slug] = network.contract_address.toLowerCase().trim();
            });
  
            delete coinData.contract_address;
          }
  
          const value = {
            ...key,
            source: 'coinmarketcap',
            ...snakecaseKeys(coinData),
          };
  
          return { key, value};
        });
  
        for (const item of items) {
  
          console.log(item);
  
          const params = {
            Data: Buffer.from(JSON.stringify(item), 'utf8'),
            PartitionKey: `COINMARKETCAP-${new Date().getTime()}`,
            StreamName: process.env.INSERT_COIN_STREAM as string,
          };
    
          const result = await client.putRecord(params).promise()
          .catch((e) => {
            console.log({
              message: 'Error streaming blocks to kinesis',
              error: JSON.stringify(e),
              coin_id: item.key.identifier,
              object: 'coinmarketcap-coin',
            });
          }) ;
    
          if(result) {
            console.log({ status: 'success', coin_id: item.key.identifier, object: 'coinmarketcap-coin' });
          }
        }
      }
    }
  } catch (error) {
    console.log(error);
    throw error;
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful, Fetches the coins and inserted into dynamodb`,
    }),
    statusCode: 200,
  };
};
