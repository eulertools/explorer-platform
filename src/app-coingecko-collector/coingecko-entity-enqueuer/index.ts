import axios from 'axios';
import * as AWS from 'aws-sdk';

const client = new AWS.SQS({region: process.env.AWS_REGION});

export const handler = async () => {

  try {
    let coinsRecord = await axios.get(
      `https://pro-api.coingecko.com/api/v3/coins/list?include_platform=true&x_cg_pro_api_key=${process.env.API_KEY}`
    );
    const coins: any[] = coinsRecord.data
      .map((coin: any) => coin.id);

    console.log('Total coins: ' + coins.length)

    let index = 1;
    for (let coin of coins) {
      index += 1;
      const delay = Math.floor(index / 20);
      const params = {
        MessageBody: JSON.stringify({ coin }),
        QueueUrl: process.env.SQS_QUEUE_URL!,
        DelaySeconds: delay,
      };

      await client.sendMessage(params).promise().catch((err) => {
        console.error({
          message: 'Error on enqueuing the coins list',
          error: JSON.stringify(err)
        });
      });

      console.log({message: `Successfully enqueued coin "${coin}" into SQS`});
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
