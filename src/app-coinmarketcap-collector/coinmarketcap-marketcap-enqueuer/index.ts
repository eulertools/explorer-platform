import axios from 'axios';
import * as AWS from 'aws-sdk';

const client = new AWS.SQS({region: process.env.AWS_REGION});

export const handler = (async () => {
  try {
    let config:any = {
      headers: {
        ['X-CMC_PRO_API_KEY']: process.env.API_KEY,
      }
    }
    let coinsRecord = (await axios.get(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?listing_status=active&aux=platform`, 
      config
    )).data.data;
    
    const chunk = 200; // tokens per page
    const pages = Math.ceil(coinsRecord.length / chunk);
    for (let i = 0; i < pages; i++) {
      const delay = Math.floor(i / 8);
      const start = (i * chunk) + 1; // offset to start fetching tokens
      const params:any = {
        MessageBody: `${start}`,
        QueueUrl: process.env.SQS_QUEUE_URL!,
        DelaySeconds: delay,
      };

      await client.sendMessage(params).promise().catch((err) => {
        console.error({
          message: 'Error on enqueuing the coins list',
          error: JSON.stringify(err)
        });
      });
        
      console.log({message: `Successfully enqueued page "${i+1}" into SQS Queue with ${delay} delay`});
    }
  } catch (error) {
    console.error({
      message: 'Error on enqueuing the coins list',
      error: JSON.stringify(error)
    });
    throw error;
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful and Fetches the coins list`,
    }),
    statusCode: 200,
  };
});
