import {Context, KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
import * as DynamoDB from './dynamodb';

export const handler = (async (event: KinesisStreamEvent, context: Context) => {
  console.log({message: 'Retrieving records from the Kinesis stream'});

  const records = event.Records.map((record: KinesisStreamRecord) => {
    const payload = Buffer.from(record.kinesis.data, 'base64').toString('utf8');
    return JSON.parse(payload);
  });

  for (const record of records) {

    console.log('Record', record);

    try{

   
      const success:any = await DynamoDB.updateItem(
        process.env.CATALOG_TABLENAME,
        record.key, record.value,undefined)
      .catch((e) => console.log({
          message: 'Error occured while inserting records',
          error: e.message
      }));

      if(success) {
        console.log({
            status: 'success',
            record,
            object: 'entities'
        });
      }
    } catch(e) {
      console.log('Error',e)
    }
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful, Fetches the coins and inserted into dynamodb`,
    }),
    statusCode: 200,
  };
});
