import {Context, KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
import { Client  } from '@opensearch-project/opensearch';

require('dotenv').config();

const { defaultProvider } = require("@aws-sdk/credential-provider-node");
const createAwsOpensearchConnector = require("aws-opensearch-connector");

const chunk = process.env.SIZE_CHUNK ? parseInt(process.env.SIZE_CHUNK) : 10;

const host = 'https://' + (process.env.ES_DOMAIN as string);
const index = process.env.ES_INDEX as string;

const getClient = async () => {
  const awsCredentials = await defaultProvider()();
  const connector = createAwsOpensearchConnector({
      credentials: awsCredentials,
      region: process.env.AWS_REGION ?? 'us-east-1',
      getCredentials: function(cb:any) {
          return cb();
      }
  });
  return new Client({
      ...connector,
      node: host,
  });
}

export const handler = async (event: KinesisStreamEvent, context: Context) => {
  console.log({message: 'Retrieving records from the Kinesis stream'});

  const records = event.Records.map((record: KinesisStreamRecord) => {
    const payload = Buffer.from(record.kinesis.data, 'base64').toString('utf8');
    return JSON.parse(payload);
  }).filter((item: any) => item.dynamodb);

  const client = await getClient();

  try {

    for (let i = 0, j = records.length; i < j; i += chunk) {

      const recordChunk = records.slice(i, i + chunk);

      const bodyBulk = (await Promise.all(recordChunk.map(async (record) => {

        if (record.eventName === 'REMOVE') {
  
          if (record.dynamodb!.OldImage) {
  
            const coin = AWS.DynamoDB.Converter.output({ M: record.dynamodb!.OldImage });
  
            if (coin.source === 'euler' || index.includes('blockchain')) {
  
              console.log(`Deleting document: ${coin.identifier}`);

              return JSON.stringify({ "delete" : { "_index" : index, "_id" : coin.identifier } }) + "\n";
            }
          }
  
        } else {
  
          if (record.dynamodb!.NewImage) {
  
            const coin = AWS.DynamoDB.Converter.output({ M: record.dynamodb!.NewImage });
            delete coin.raw;
  
            if (coin.source === 'euler' || index.includes('blockchain')) {
  
              if (index.includes('blockchain')) {
                try {
                  coin.base_token_supply = coin.base_token_supply / 10 ** coin.base_token_decimals
                } catch (e) {
                  coin.base_token_supply = 0
                }
                try {
                  coin.quote_token_supply = coin.quote_token_supply / 10 ** coin.quote_token_decimals
                } catch (e) {
                  coin.quote_token_supply = 0
                }
              }
  
              console.log(`Indexing document: ${coin.identifier}`);

              return JSON.stringify({ "index" : { "_index" : index, "_id" : coin.identifier } }) + "\n" + 
                JSON.stringify(coin) + "\n";
            }
          }
        }
  
        return undefined;
      }))).filter((element) => element).join('');

      if(bodyBulk) console.log(await client.bulk({body: bodyBulk}));
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
