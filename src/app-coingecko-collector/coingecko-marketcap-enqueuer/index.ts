import axios from 'axios';
import * as AWS from 'aws-sdk';

const client = new AWS.SQS({region: process.env.AWS_REGION});

export const handler = async () => {

  try {
    let coinsRecord = (await axios.get(
      `https://pro-api.coingecko.com/api/v3/coins/list?include_platform=true&x_cg_pro_api_key=${process.env.API_KEY}`
    )).data;
    
    const count = coinsRecord.length;
    const listIds = [];

    coinsRecord = coinsRecord.map((coin:any) => coin.id)

    const chunk = 250;

    for(let i = 0, j = Math.floor(count / chunk) + 1; i < j; i++) {
      listIds.push(coinsRecord.splice(0, chunk).join());
    }

    let index = 1;
    for (let ids of listIds) {
      index += 1;
      const delay = Math.floor(index / 8);
      const params:any = {
        MessageBody: `${ids}`,
        QueueUrl: process.env.SQS_QUEUE_URL!,
        DelaySeconds: delay,
      };

      await client.sendMessage(params).promise().catch((err) => {
        console.error({
          message: 'Error on enqueuing the coins list',
          error: JSON.stringify(err)
        });
      });
        
      console.log({message: `Successfully enqueued ids "${ids}" into SQS Queue with ${delay} delay`});
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
