import {Context, KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
import { getItem, updateItem } from "./dynamodb";
import * as Mapping from './mapping';

const mapping:any[] = [
  { "source": "token_name", "destination" : "name"},
  { "source": "token_symbol", "destination" : "symbol"},
  { "source": "total_supply", "destination" : "total_supply", overwrite: true,
    transform: (value:any) => value === 'NaN' ? null : Mapping.roundPrice(value) },
  { "source": "holder_count", "destination" : "holder_count", overwrite: true,
    transform: (value:any) => Number.parseInt(value) },
  { "source": "buy_tax", "destination" : "security.buy_tax", overwrite: true,
  transform: (value:any) => value === 'NaN' ? null : Mapping.roundPrice(value) },
  { "source": "sell_tax", "destination" : "security.sell_tax", overwrite: true,
  transform: (value:any) => value === 'NaN' ? null : Mapping.roundPrice(value) },
  { "source": "can_take_back_ownership", "destination" : "security.can_take_back_ownership", overwrite: true, 
    transform: (value:any) => value === '1' },
  { "source": "cannot_buy", "destination" : "security.cannot_buy", overwrite: true,
    transform: (value:any) => value === '1' },
  { "source": "cannot_sell_all", "destination" : "security.cannot_sell_all", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "creator_address", "destination" : "security.creator.address", overwrite: true },
  { "source": "creator_balance", "destination" : "security.creator.balance", overwrite: true ,
  transform: (value:any) => value === 'NaN' ? null : Mapping.roundPrice(value) },
  { "source": "creator_percent", "destination" : "security.creator.percent", overwrite: true ,
  transform: (value:any) => value === 'NaN' ? null :  Mapping.roundPrice(value) },
  { "source": "external_call", "destination" : "security.external_call", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "hidden_owner", "destination" : "security.hidden_owner", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "is_anti_whale", "destination" : "security.is_anti_whale", overwrite: true ,
   transform: (value:any) => value === '1' },
  { "source": "is_blacklisted", "destination" : "security.is_blacklisted", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "is_honeypot", "destination" : "security.is_honeypot", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "is_in_dex", "destination" : "security.is_in_dex", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "is_mintable", "destination" : "security.is_mintable", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "is_open_source", "destination" : "security.is_open_source", overwrite: true,
    transform: (value:any) => value === '1' },
  { "source": "is_proxy", "destination" : "security.is_proxy", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "is_whitelisted", "destination" : "security.is_whitelisted", overwrite: true,
    transform: (value:any) => value === '1' },
  { "source": "lp_holder_count", "destination" : "security.lp_holder_count", overwrite: true,
    transform: (value:any) => Number.parseInt(value) },
  { "source": "owner_address", "destination" : "security.owner.address", overwrite: true },
  { "source": "owner_balance", "destination" : "security.owner.balance", overwrite: true ,
    transform: (value:any) => value === 'NaN' ? null : Mapping.roundPrice(value) },
  { "source": "owner_change_balance", "destination" : "security.owner.change_balance", overwrite: true ,
    transform: (value:any) => value === 'NaN' ? null : Mapping.roundPrice(value) },
  { "source": "owner_percent", "destination" : "security.owner.percent", overwrite: true ,
    transform: (value:any) => value === 'NaN' ? null : Mapping.roundPrice(value) },
  { "source": "personal_slippage_modifiable", "destination" : "security.personal_slippage_modifiable", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "slippage_modifiable", "destination" : "security.slippage_modifiable", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "selfdestruct", "destination" : "security.selfdestruct", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "trading_cooldown", "destination" : "security.trading_cooldown", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "transfer_pausable", "destination" : "security.transfer_pausable", overwrite: true ,
    transform: (value:any) => value === '1' },
  { "source": "update_date", "destination" : "update_date_goplus", overwrite: true,
    transform: (value:number) => new Date(value * 1000).toISOString() }
]

require('dotenv').config();

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
  }).filter((coin: any) =>  coin.source === 'goplussecurity' && coin.canonical && coin.token_name);

  try {

    const chunk = 100;

    for (let i = 0, j = records.length; i < j; i += chunk) {

      const recordChunk = records.slice(i, i + chunk);

      await Promise.all(recordChunk.map(async (coin) => {

        console.log('Record', coin);
        
        const result = await getItem({
          TableName: process.env.CATALOG_TABLENAME,
          KeyConditionExpression: '#identifier  = :identifier',
          FilterExpression: '#source = :source',
          ExpressionAttributeNames:{
              '#identifier': 'identifier',
              '#source': 'source',
          },
          ExpressionAttributeValues: {
            ':identifier': { S: `${coin.canonical}` },
            ':source': { S: 'euler' },
          },
          ScanIndexForward: false,
        });
        
        if(result) {
      
          const key = {
            identifier: result.identifier,
            update_date: Math.round(new Date().getTime() / 1000)
          }
      
          delete result.identifier;
          delete result.update_date;
      
          const value = {
            ...key,
            ...result,
          }
      
          value.readable_update_date = new Date().toISOString();
      
          Mapping.merge(coin, value.networks[coin.chain], mapping);
      
          await updateItem(process.env.CATALOG_TABLENAME,key, value, null);
      
          console.log(`Merge ${coin.identifier} with ${key.identifier}`);
        }
      }))
    }

  } catch (error) {
    console.log(error);
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful and Fetches the coins list`,
    }),
    statusCode: 200,
  };
};
