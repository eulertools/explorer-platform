
import * as AWS from 'aws-sdk';
import { handler } from '../src/app-insert-historical-balance';

describe('Stream catalog', () => {

  let event:any;
  let context:any;

  beforeAll(() => {

    require('dotenv').config();

    jest.setTimeout(250000);

    event = {
      Records:[
        {
          body: JSON.stringify({
            user_sub: '3a775d06-3e4d-4db9-95ef-fc1e288b55ba',
            address: '0xdaabecacdd888dcf68ff1f2d9202e74aba0601bd',
            chain_id: 'bnb',
            date: new Date(2022,8,23).toISOString()
          })
        }
      ]
    }

    context = {}
  });

  // it('historical balance', async (done) => {
  //   try {

  //     await handler(event, context);
      
  //     done();
  //   } catch (e) {
  //     done.fail(e)
  //   }
  // });

  it('sqs send message', async (done) => {
    try {

      const client = new AWS.SQS({region: process.env.AWS_REGION});

      const params = {
        MessageBody: JSON.stringify({
          user_sub: '3a775d06-3e4d-4db9-95ef-fc1e288b55ba',
          address: '0xdaabecacdd888dcf68ff1f2d9202e74aba0601bd',
          chain_id: 'bnb',
          date: new Date('2022-08-17T00:00:00.000Z').toISOString()
        }),
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/CDK_PROD_ACCOUNT/AppAssetsStack-InsertHistoricalBalanceQueue8417236D-bWpo7OVyhIBl'
      };

      const response = await client.sendMessage(params).promise().catch((err) => {
        console.error({
          message: 'Error on enqueuing the coins list',
          error: JSON.stringify(err)
        });
      });
      
      console.log(response);
      done();
    } catch (e) {
      done.fail(e)
    }
  });
});

