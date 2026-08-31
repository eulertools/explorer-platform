import {Context, KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
import * as coinmarketcap from './mergeCoinmarketcap';
import * as coinmarketcapMarketcap from './mergeCoinmarketcapMarketcap';

require('dotenv').config();

const chunk = process.env.SIZE_CHUNK ? parseInt(process.env.SIZE_CHUNK) : 50;

export const handler = async (event: KinesisStreamEvent, context: Context) => {
  console.log({message: 'Retrieving records from the Kinesis stream'});

  const records = event.Records.map((record: KinesisStreamRecord) => {
    const payload = Buffer.from(record.kinesis.data, 'base64').toString('utf8');
    return JSON.parse(payload);
  }).filter((item: any) => item.dynamodb && item.dynamodb!.NewImage)
  .map((item:any) => {
      const coin = AWS.DynamoDB.Converter.output({ M: item.dynamodb!.NewImage });
      delete coin.raw
      return coin;
  }).filter((coin: any) =>  !coin.canonical && (coin.source === 'coinmarketcap' || coin.source === 'coinmarketcap-marketcap'));

  try {
    for (let i = 0, j = records.length; i < j; i += chunk) {
      const recordChunk = records.slice(i, i + chunk);

      await Promise.all(recordChunk.map(async (coin) => {
        if(coin.source === 'coinmarketcap') {
          await coinmarketcap.handler(coin);
        } else {
          await coinmarketcapMarketcap.handler(coin);
        }
      }))
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
