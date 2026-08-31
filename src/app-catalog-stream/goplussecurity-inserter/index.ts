import {Context, KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
import { getItem, updateItem } from './dynamodb';
import axios from 'axios';

require('dotenv').config();

const supportedNetworks:any = {
  'bnb': 56
} 

export const secureAddress:any = (address:any) => {
  const response = address.toLowerCase().trim().match(/0x[a-fA-F0-9]{40}/g);

  if(response) return response[0];
  
  return undefined;
}

export const handler = async (event: KinesisStreamEvent, context: Context) => {
  console.log({message: 'Retrieving records from the Kinesis stream'});
  
  const records = event.Records.map((record: KinesisStreamRecord) => {
    const payload = Buffer.from(record.kinesis.data, 'base64').toString('utf8');
    return JSON.parse(payload);
  });

  try {

    for (const record of records.filter((item: any) => item.dynamodb)) {

      if (record.dynamodb!.NewImage) {

        const coin:any = AWS.DynamoDB.Converter.output({ M: record.dynamodb!.NewImage });
        const oldNetwork:any = [];

        if(record.dynamodb!.OldImage) {
          const oldCoin = AWS.DynamoDB.Converter.output({ M: record.dynamodb!.OldImage });

          if(oldCoin.networks && Object.keys(oldCoin.networks).length > 0) {
            Object.keys(oldCoin.networks).forEach((network) => {
              oldNetwork.push(network);
            });
          }
        }

        if(coin.source === 'euler') {

          console.log('Record', coin);

          const newNetworks:any = [];

          if(coin.networks && Object.keys(coin.networks).length > 0) {

            Object.entries(coin.networks).forEach((network:any) => {
              if(supportedNetworks[network[0]] && !oldNetwork.includes(network[0]) && !coin.networks[network[0]]?.update_date_goplus) {

                const address = secureAddress(network[1].address);

                if(address) {
                  newNetworks.push({
                    chain: network[0],
                    chain_id: supportedNetworks[network[0]],
                    address
                  })
                }
              }
            });
          }

          for(const network of newNetworks) {

            const url = `https://api.gopluslabs.io/api/v1/token_security/${network.chain_id}?contract_addresses=${network.address}`

            const dataGoPlus:any = await axios.get(url);

            if(dataGoPlus.data) {

              const key = {
                identifier: `goplussecurity~${network.chain}~${network.address}`,
                update_date: Math.round(new Date().getTime() / 1000)
              }
              const value = {
                ...key,
                canonical: coin.identifier,
                source: 'goplussecurity',
                chain: network.chain,
                ...dataGoPlus.data.result[network.address as string],
                readable_update_date: new Date().toISOString()
              }

              await updateItem(process.env.CATALOG_TABLENAME,key, value, null);

              console.log(`Create ${key.identifier} in catalog`)
            }
          }
        } 
      }
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
