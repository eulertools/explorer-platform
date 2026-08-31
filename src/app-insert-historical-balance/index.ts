import { updateItem } from './dynamodb';
import axios from "axios";
import * as Utils from "web3-utils";
import { getBlockByDate } from './getBlockByDate';
import { SequelizeChain } from './sequelize';

require('dotenv').config();

const blockhainRpc:any = JSON.parse(process.env.BLOCKCHAIN_RPCS as string);

const METHOD_BALANCE = '0x70a08231000000000000000000000000';

export const handler = async (event: any) => {

  console.log({ message: 'Retrieving records from the SQS Queue' });
  console.log({ message: 'Records', data: event.Records });

  const sequelize = new SequelizeChain();

  try {

    for (const record of event.Records) {

      const body = JSON.parse(record.body);

      const { user_sub, chain_id } = body;

      const address = body.address.toLowerCase().trim();

      const date = new Date(body.date);

      const [qresults] = await sequelize.client(chain_id).query(
        `select token_address from raw.gettokenaddress('${address}')`
      );

      const tokens = qresults.map((result:any) => result.token_address);

      const keys = {
        user_sub,
        identifier: `balance~${chain_id}~${address}~${date.toISOString().split('T')[0]}`
      }

      const block = await getBlockByDate(chain_id, date);

      const balances:any = {};

      await Promise.all(tokens.map(async (token:any) => {
        balances[token] = Utils.fromWei((await axios.post(blockhainRpc[chain_id], {
            method:"eth_call",
            params:[
                {
                    to: token,
                    data: `${METHOD_BALANCE}${address.replace('0x','')}`
                }, `0x${block.number.toString(16)}`],
            id: 1,
            jsonrpc: "2.0"
        })).data.result);
      }))
    
      const value:any = {
        ...keys,
        date: date.toISOString().split('T')[0],
        chain_id,
        address,
        balances
      }
      await updateItem(process.env.TABLE_NAME, keys, value, null);
      console.log(`Update user_sub: ${keys.user_sub} identifier: ${keys.identifier}`);
    } 

  } catch (error) {
    console.log(error);
    throw error;
  } finally {
    if(sequelize) sequelize.close();
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful and Fetches the coins list`,
    }),
    statusCode: 200,
  };
};
