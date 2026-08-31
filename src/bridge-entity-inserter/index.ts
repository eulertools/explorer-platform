import {Context, KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
import * as DynamoDB from './dynamodb';

const ion = require('ion-js');

export const handler = (async (event: KinesisStreamEvent, context: Context) => {
  console.log({message: 'Retrieving records from the Kinesis stream'});

  const records = event.Records.map((record: KinesisStreamRecord) => {
    const payload = Buffer.from(record.kinesis.data, 'base64');

    const ionRecord:any = ion.load(payload);

    if (JSON.parse(ion.dumpText(ionRecord.recordType)) !== 'REVISION_DETAILS') {
      console.log(`Skipping record of type ${ion.dumpPrettyText(ionRecord.recordType)}`);
    } else {
      if(ionRecord.payload.revision.data) {
        return JSON.parse(JSON.stringify(ionRecord.payload.revision.data));
      }
    }
  }).filter((record) => record);

  for (const record of records) {

    console.log('Record', record);

    const key = {
      account: record.account,
      ticket_id: record. ticket_id
    }

    await DynamoDB.updateItem(process.env.BRIDGE_TABLE, key, record, null);

    console.log(`Insert record ${key.account} ${key.ticket_id}`);
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful, Fetches the coins and inserted into dynamodb`,
    }),
    statusCode: 200,
  };
});
