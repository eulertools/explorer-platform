import moment from "moment";
import Web3 from "web3";

require('dotenv').config();

const blockhainRpc:any = JSON.parse(process.env.BLOCKCHAIN_RPCS as string);

const getBlock = async(web3:Web3, block:any) => {

  const result = await web3.eth.getBlock(block);

  return {
    number: result.number,
    timestamp: (Number.parseInt(result.timestamp.toString(), 10))
  }
}
  
const getBlockByDateRecursive = async (web3:Web3,config:any, date:any):Promise<any> => {
  
  let predictedBlock = config.latestBlock.number - Math.ceil(moment.unix(config.latestBlock.timestamp).diff(date, 'seconds') / config.blockTime);

  // const factor = (config.latestBlock.number - predictedBlock) / config.latestBlock.number;
  // if(factor > 0.005) predictedBlock -= Math.ceil((config.latestBlock.number - predictedBlock) * 0.20);
  // if(factor > 0.0001) predictedBlock -= Math.ceil((config.latestBlock.number - predictedBlock) * 0.15);
  // else if(factor > 0.000001) predictedBlock -= Math.ceil((config.latestBlock.number - predictedBlock) * 0.1);

  if(config.latestBlock.number === predictedBlock) predictedBlock -= 1;

  const block = await getBlock(web3, predictedBlock);

  if(moment.unix(block.timestamp).isAfter(date)) {
    config.latestBlock = block;
    config.firstTime = false;
    config.jump++;
    return getBlockByDateRecursive(web3, config, date);
  }

  return block;
}
  
export const getBlockByDate = async (chain_id:string, date:any) => {

  const web3 = new Web3(blockhainRpc[chain_id]);

  if (!moment.isMoment(date)) date = moment(date).utc();

  let latestBlock = await getBlock(web3, 'latest')
  const firstBlock = await getBlock(web3, '0');

  if (date.isBefore(moment.unix(firstBlock.timestamp))) return firstBlock;
  if (date.isSameOrAfter(moment.unix(latestBlock.timestamp))) return latestBlock;

  let blockTime = (latestBlock.timestamp - firstBlock.timestamp) / (latestBlock.number - 1);

  latestBlock = await getBlock(web3, latestBlock.number - Math.ceil(moment.unix(latestBlock.timestamp).diff(date, 'seconds') / blockTime));

  blockTime = (latestBlock.timestamp - firstBlock.timestamp) / (latestBlock.number - 1);

  const config = {
    firstBlock,
    latestBlock,
    blockTime,
    jump: 1
  }

  return getBlockByDateRecursive(web3, config, date);
}