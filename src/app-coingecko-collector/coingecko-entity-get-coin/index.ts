import { Context, SQSEvent } from 'aws-lambda';
import axios, { AxiosResponse } from 'axios';
import * as AWS from 'aws-sdk';
import { getItem } from './dynamodb';

const updatePeriod = process.env.UPDATE_PERIOD ? Number.parseInt(process.env.UPDATE_PERIOD) : 30 * 24 * 60 * 60;

const client = new AWS.Kinesis({ region: process.env.AWS_REGION });

export const handler = async (event: SQSEvent, context: Context) => {
  console.log({ message: 'Retrieving records from the SQS Queue' });
  console.log({ message: 'Records', data: event.Records });
  try {

    let items: any[] = [];

    for (const record of event.Records) {

      const { coin, force } = JSON.parse(record.body);

      const result = await getItem({
        TableName: process.env.CATALOG_TABLENAME,
        KeyConditionExpression: '#identifier  = :identifier',
        FilterExpression: '#source = :source',
        ExpressionAttributeNames:{
            '#identifier': 'identifier',
            '#source': 'source',
        },
        ExpressionAttributeValues: {
          ':identifier': { S: `coingecko~${coin}` },
          ':source': { S: 'coingecko' },
        },
        ScanIndexForward: false,
        ProjectionExpression: 'update_date'
      });

      if(!result || result.update_date + updatePeriod < Math.round(new Date().getTime() / 1000) || force) {

        console.log({ message: `Fetching coins by ID: ${coin}` });
        const url = `https://pro-api.coingecko.com/api/v3/coins/${coin}?tickers=false&market_data=false&community_data=true&developer_data=true&sparkline=true&x_cg_pro_api_key=${process.env.API_KEY}`;
        await axios
          .get(url)
          .then((response: AxiosResponse) => {
            const coinData = response.data;

            const key = {
              identifier: `coingecko~${coinData.id}`,
              update_date: Math.round(Date.parse(coinData.last_updated) / 1000),
            };

            coinData.localization = coinData.localization['en'];
            coinData.description = coinData.description['en'];

            const oldPlatforms = coinData.platforms;
            coinData.platforms = Object.keys(oldPlatforms).filter((key) => key !== '').reduce((cur, key) => {
              return Object.assign(cur, { [key]: oldPlatforms[key] });
            }, {});

            const value = {
              ...key,
              source: 'coingecko',
              ...coinData,
            };

            value.readable_update_date = coinData.last_updated;

            items.push({ key, value });
          })
          .catch((error) => {
            console.log(error);
            if (error.response && error.response.status != 404) {
              console.log("request error:", error.response);
              throw error;
            } else {
              console.log(error);
              return true;
            }
          });
      } else {
        console.log({ message: `Discarding coin by ID: ${coin} to update` });
      }
    }

    for (const item of items) {

      const params = {
        Data: Buffer.from(JSON.stringify(item), 'utf8'),
        PartitionKey: `COINGECKO-${new Date().getTime()}`,
        StreamName: process.env.INSERT_COIN_STREAM as string,
      };

      const result = await client.putRecord(params).promise()
      .catch((e) => {
        console.log({
          message: 'Error streaming blocks to kinesis',
          error: JSON.stringify(e),
          coin_id: item.key.identifier,
          object: 'coingecko-coin',
        });
      }) ;

      if(result) {
        console.log({ status: 'success', coin_id: item.key.identifier, object: 'coingecko-coin' });
      }
    }
  } catch (error) {
    console.log(error);
    throw error;
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful, Fetches the coins and inserted into dynamodb`,
    }),
    statusCode: 200,
  };
};
