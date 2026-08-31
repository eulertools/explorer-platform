import * as Mapping from './mapping';
import { getItem, updateItem } from "./dynamodb";

const mapping = [
  { "source": "quote.USD.price", "destination" : "price_usd.cmc", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "quote.USDarket_cap", "destination" : "market_cap.cmc", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "cmc_rank", "destination" : "rank.cmc", overwrite: true },
  { "source": "quote.USD.volume_24h", "destination" : "volumen_24h.cmc", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "circulating_supply", "destination" : "circulating_supply.cmc", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "total_supply", "destination" : "total_supply.cmc", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "max_supply", "destination" : "max_supply.cmc", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "quote.USD.percent_change_1h", "destination" : "price_change_percentage_1h.cmc", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "quote.USD.percent_change_24h", "destination" : "price_change_percentage_24h.cmc", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "quote.USD.percent_change_7d", "destination" : "price_change_percentage_7d.cmc", overwrite: true ,
   transform: (value:any) => Mapping.roundPrice(value) },
  { "source": " quote.USD.percent_change_30d", "destination" : "price_change_percentage_30d.cmc", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": " quote.USD.percent_change_60d", "destination" : "price_change_percentage_60d.cmc", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": " quote.USD.percent_change_90d", "destination" : "price_change_percentage_90d.cmc", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "last_updated", "destination" : "update_date_coinmarketcap_marketcap", overwrite: true }
]

export const handler = async (coin:any) => {

  const result = await getItem({
    TableName: process.env.CATALOG_TABLENAME,
    IndexName : 'catalog_coinmarketcapIndex',
    KeyConditionExpression: '#coinmarketcap_id  = :coinmarketcap_id',
    FilterExpression: '#source = :source',
    ExpressionAttributeNames:{
        '#coinmarketcap_id': 'coinmarketcap_id',
        '#source': 'source',
    },
    ExpressionAttributeValues: {
      ':coinmarketcap_id': { S: `${coin.id}` },
      ':source': { S: 'euler' },
    },
    ScanIndexForward: false,
  });

  if(result && (!result.update_date_coinmarketcap_marketcap || new Date(result.update_date_coinmarketcap_marketcap).getTime() < new Date(coin.last_updated).getTime())) {

    const key = {
      identifier: result.identifier,
      update_date: Math.round(new Date().getTime() / 1000)
    }

    delete result.identifier;
    delete result.update_date;

    const value = {
      ...key,
      ...result
    }
    value.readable_update_date = new Date().toISOString();

    Mapping.merge(coin, value, mapping);

    const updateCanonicalPromise = updateItem(process.env.CATALOG_TABLENAME,key, value, null);
    const updateCoinmarketcapPromise = updateItem(process.env.CATALOG_TABLENAME,{
      identifier: coin.identifier,
      update_date: coin.update_date
    }, {
      ...coin,
      canonical: value.identifier
    }, null);

    Promise.all([updateCanonicalPromise , updateCoinmarketcapPromise]);

    console.log(`Merge ${coin.identifier} with ${key.identifier}`)
  }
}