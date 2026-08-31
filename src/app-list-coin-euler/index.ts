import * as AWS from 'aws-sdk';
import { getItem, updateItem } from './dynamodb';

require('dotenv').config();


const client = new AWS.SQS({region: process.env.AWS_REGION});

export const handler = async (event: any) => {

  const coin = event;

  const { canonical } = coin;

  try {

    const result = await getItem({
      TableName: process.env.CATALOG_TABLENAME,
      KeyConditionExpression: '#identifier  = :identifier',
      FilterExpression: '#source = :source',
      ExpressionAttributeNames:{
          '#identifier': 'identifier',
          '#source': 'source',
      },
      ExpressionAttributeValues: {
        ':identifier': { S: `${canonical}` },
        ':source': { S: 'euler' },
      },
      ScanIndexForward: false,
    });

    const key = {
      identifier: canonical,
      update_date: Math.round(new Date().getTime() / 1000)
    };

    let value;

    if(!result) {
      
      value = {
        ...key,
        source: 'euler',
      }
    } else {
  
      delete result.identifier;
      delete result.update_date;

      value = {
        ...key,
        ...result,
      }
    }

    value.readable_update_date = new Date().toISOString();

    if(coin.coingecko_id) value.coingecko_id = coin.coingecko_id;

    await updateItem(process.env.CATALOG_TABLENAME,key, value, null);

    if(coin.coingecko_id) {
  
      await client.sendMessage({
        MessageBody: JSON.stringify({ coin: coin.coingecko_id, force: true }),
        QueueUrl: process.env.SQS_COINGECKO_QUEUE_URL!,
      }).promise().catch((err) => {
        console.error({
          message: 'Error on enqueuing the coins list',
          error: JSON.stringify(err)
        });
      });

      await client.sendMessage({
        MessageBody: coin.coingecko_id,
        QueueUrl: process.env.SQS_COINGECKO_MARKETCAP_QUEUE_URL!,
      }).promise().catch((err) => {
        console.error({
          message: 'Error on enqueuing the coins list',
          error: JSON.stringify(err)
        });
      });
    }

    console.log({message: `Successfully listed coin "${canonical}"`});

  } catch (error) {
    console.log(error);
    throw error;
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful and Fetches the coins list`,
    }),
    statusCode: 200,
  };
};
