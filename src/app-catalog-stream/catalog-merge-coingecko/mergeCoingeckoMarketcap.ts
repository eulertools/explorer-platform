import * as Mapping from './mapping';
import { getItem, updateItem } from "./dynamodb";

const mapping = [
  { "source": "current_price", "destination" : "price_usd.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "market_cap", "destination" : "market_cap.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "market_cap_rank", "destination" : "rank.cg.market_cap", overwrite: true },
  { "source": "total_volume", "destination" : "volumen_24h.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "high_24h", "destination" : "high_24h.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "low_24h", "destination" : "low_24h.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "price_change_24h", "destination" : "price_change_24h.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "market_cap_change_24h", "destination" : "market_cap_change_24h.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "market_cap_change_percentage_24h", "destination" : "market_cap_change_percentage_24h.cg", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "circulating_supply", "destination" : "circulating_supply.cg", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "total_supply", "destination" : "total_supply.cg", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "max_supply", "destination" : "max_supply.cg", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "ath", "destination" : "ath.cg", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "ath_change_percentage", "destination" : "ath_change_percentage.cg", overwrite: true,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "atl", "destination" : "atl.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "atl_change_percentage", "destination" : "atl_change_percentage.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "price_change_percentage_1h_in_currency", "destination" : "price_change_percentage_1h.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "price_change_percentage_24h_in_currency", "destination" : "price_change_percentage_24h.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "price_change_percentage_7d_in_currency", "destination" : "price_change_percentage_7d.cg", overwrite: true ,
   transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "price_change_percentage_30d_in_currency", "destination" : "price_change_percentage_30d.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "price_change_percentage_1y_in_currency", "destination" : "price_change_percentage_1y.cg", overwrite: true ,
    transform: (value:any) => Mapping.roundPrice(value) },
  { "source": "last_updated", "destination" : "update_date_coingecko_marketcap", overwrite: true }
]

export const handler = async (coin:any) => {

  const result = await getItem({
    TableName: process.env.CATALOG_TABLENAME,
    IndexName : 'catalog_coingeckoIndex',
    KeyConditionExpression: '#coingecko_id  = :coingecko_id',
    FilterExpression: '#source = :source',
    ExpressionAttributeNames:{
        '#coingecko_id': 'coingecko_id',
        '#source': 'source',
    },
    ExpressionAttributeValues: {
      ':coingecko_id': { S: `${coin.id}` },
      ':source': { S: 'euler' }
    },
    ScanIndexForward: false,
  });

  if(result && new Date(result.update_date_coingecko_marketcap).getTime() < new Date(coin.last_updated).getTime()) {

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

    console.log(`pre marketcap ${coin.id}`, JSON.stringify(coin))
    Mapping.merge(coin, value, mapping);
    console.log(`after marketcap ${coin.id}`, JSON.stringify(coin))

    const updateCanonicalPromise = updateItem(process.env.CATALOG_TABLENAME,key, value, null);
    const updateCoingeckoPromise = updateItem(process.env.CATALOG_TABLENAME,{
      identifier: coin.identifier,
      update_date: coin.update_date
    }, {
      ...coin,
      canonical: value.identifier
    }, null);

    Promise.all([updateCanonicalPromise , updateCoingeckoPromise]);

    console.log(`Merge ${coin.identifier} with ${key.identifier}`)
  }
}