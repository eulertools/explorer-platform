import { Context, KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
import { updateItem } from './dynamodb
const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'))

const ddbClient = new AWS.DynamoDB();
export const handler = async (event: KinesisStreamEvent, context: Context) => {

  try {
    const records = event.Records.map((record: KinesisStreamRecord) => {
      const payload = Buffer.from(record.kinesis.data, 'base64').toString('utf8');
      return JSON.parse(payload);
    });

    const TABLE_SETTINGS = process.env.SETTINGS_TABLENAME;
    const key = records[0].key;
    const data = records[0].data;
    console.log(TABLE_SETTINGS, key, data);

    //await updateItem(TABLE_SETTINGS, key, data, null);

  }
  catch (error) {
    console.log(error);
    throw error;
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful and Fetches the coins list`,
    }),
    statusCode: 200,
  };
}
