import {Context, SQSEvent} from 'aws-lambda';
import axios, {AxiosResponse} from 'axios';
import * as AWS from 'aws-sdk';

const client = new AWS.Kinesis({region: process.env.AWS_REGION});

export const handler = async (event: SQSEvent, context: Context) => {
  console.log({message: 'Retrieving records from the SQS Queue'});
  console.log({message: 'Records', data: event.Records});
  try {
    for (const record of event.Records) {
      const start = record.body;
      let items:any[] = [];
      let config:any = {
        headers: {
          ['X-CMC_PRO_API_KEY']: process.env.API_KEY,
        }
      }
      const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?convert=usd&start=${start}&limit=200&sort=market_cap&sort_dir=desc`;
      await axios
        .get(url, config)
        .then((response: AxiosResponse) => {

          const coinData = response.data.data;

          items = coinData.filter((coin:any) => coin.last_updated).map((coin:any) => {

            const key = {
              identifier: `coinmarketcap-marketcap~${coin.id}`,
              update_date: Math.round(Date.parse(coin.last_updated) / 1000)
            };

            const value = {
              ...key,
              source: 'coinmarketcap-marketcap',
              ...coin,
            }

            return { key, value};

          })
        })
        .catch((error) => {
          console.log(error);
          if (error.response && error.response.status != 404) {
            throw error;
          } else {
            console.log(error);
            return true;
          }
        });

        for (const item of items) {
          const params = {
            Data: Buffer.from(JSON.stringify(item),'utf8'),
            PartitionKey: `COINMARKETCAP-MARKETCAP-${new Date().getTime()}`,
            StreamName: process.env.INSERT_COIN_STREAM as string,
          };
  
          const result = await client.putRecord(params).promise()
          .catch((e) => {
              console.log({
                message: 'Error streaming blocks to kinesis',
                error: JSON.stringify(e),
                coin_id: item.key.identifier, 
                object: 'coinmarketcap-market-cap'
              });
            });
            if(result) {
              console.log({status: 'success', coin_id: item.key.identifier, object: 'coinmarketcap-market-cap'});
            }
        };
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
