import {Context, SQSEvent} from 'aws-lambda';
import axios, {AxiosResponse} from 'axios';
import * as AWS from 'aws-sdk';

const client = new AWS.Kinesis({region: process.env.AWS_REGION});

export const handler = async (event: SQSEvent, context: Context) => {
  console.log({message: 'Retrieving records from the SQS Queue'});
  console.log({message: 'Records', data: event.Records});
  try {
    for (const record of event.Records) {
      
      const ids = record.body;
      let items:any[] = [];
      const url = `https://pro-api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&ids=${ids}&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y&x_cg_pro_api_key=${process.env.API_KEY}`;
      console.log(url);
      await axios
        .get(url)
        .then((response: AxiosResponse) => {

          const coinData = response.data;

          items = coinData.filter((coin:any) => coin.last_updated).map((coin:any) => {

            const key = {
              identifier: `coingecko-marketcap~${coin.id}`,
              update_date: Math.round(Date.parse(coin.last_updated) / 1000)
            };

            const value = {
              ...key,
              source: 'coingecko-marketcap',
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
            PartitionKey: `COINGECKO-MARKETCAP-${new Date().getTime()}`,
            StreamName: process.env.INSERT_COIN_STREAM as string,
          };
  
          client.putRecord(params, (err) => {
            if (err) {
              console.log({
                message: 'Error streaming blocks to kinesis',
                error: JSON.stringify(err),
                coin_id: item.key.identifier, 
                object: 'coingecko-market-cap'
              });
              throw err;
            } else {
              console.log({status: 'success', coin_id: item.key.identifier, object: 'coingecko-market-cap'});
            }
          });
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
