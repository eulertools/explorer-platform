import axios from 'axios';
import * as AWS from 'aws-sdk';

const chunk = process.env.CHUNK_RECORDS ? Number.parseInt(process.env.CHUNK_RECORDS) : 100;

const client = new AWS.SQS({region: process.env.AWS_REGION});

export const handler = async () => {

  try {

    let config:any = {
      headers: {
        ['X-CMC_PRO_API_KEY']: process.env.API_KEY,
      }
    }

    let coinsRecord = (await axios.get(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?listing_status=active&aux=platform`, 
      config
    )).data.data.map((coin:any) => coin.id);

    const sends = [];

    for(let i = 0, j = coinsRecord.length; i < j; i += chunk) {

      sends.push(coinsRecord.slice(i, i + chunk));
    }
    
    let index = 0;
    for(const send of sends) {

      const params = {
        MessageBody: JSON.stringify({ coins: send }),
        QueueUrl: process.env.SQS_QUEUE_URL!,
        DelaySeconds: index,
      };

      await client.sendMessage(params).promise().catch((err) => {
        console.error({
          message: 'Error on enqueuing the coins list',
          error: JSON.stringify(err)
        });
      });
      index++;
    }
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
