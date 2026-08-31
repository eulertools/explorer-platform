import * as Mapping from './mapping';
import { getItem, updateItem } from "./dynamodb";

const mapping = [
  { "source": "symbol", "destination" : "symbol", transform: (value:any) => value.toUpperCase() },
  { "source": "name", "destination" : "name" },
  { "source": "description", "destination" : "description" },
  { "source": "date_launched", "destination" : "genesis_date" },
  { "source": "logo", "destination" : "image.cmc.logo", overwrite: true },
  { "source": "tag_names", "destination" : "tags", transform: (value:any) => value.filter((tag:any) => tag), overwrite: false },
  { "source": "twitter_username", "destination" : "socials_media.twitter", overwrite: true },
  { "source": "urls.website", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
      return { kind: 'homepage', url: link } }), overwrite: false, key: 'url' },
  { "source": "urls.announcement", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'announcement', url: link } }), overwrite: false, key: 'url' },
  { "source": "urls.message_board", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
      return { kind: 'announcement', url: link } }), overwrite: false, key: 'url' },
  { "source": "urls.chat", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'chat', url: link } }), overwrite: false, key: 'url' },
  { "source": "urls.explorer", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'blockchain_site', url: link } }), overwrite: false, key: 'url' },
  { "source": "urls.source_code", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'repo', url: link } }), overwrite: false, key: 'url' },
  { "source": "urls.technical_doc", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
      return { kind: 'technical_doc', url: link } }), overwrite: false, key: 'url' },
  { "source": "update_date", "destination" : "update_date_coinmarketcap", overwrite: true,
      transform: (value:number) => new Date(value * 1000).toISOString() }
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

  if(result && (!result.update_date_coinmarketcap || new Date(result.update_date_coinmarketcap).getTime() < coin.update_date)) {

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
    
    const updateCanonicalPromise = await updateItem(process.env.CATALOG_TABLENAME,key, value, null);
    const updateCoinMarketcapPromise = await updateItem(process.env.CATALOG_TABLENAME,{
      identifier: coin.identifier,
      update_date: coin.update_date
    }, {
      ...coin,
      canonical: value.identifier
    }, null);

    Promise.all([updateCanonicalPromise , updateCoinMarketcapPromise]);

    console.log(`Merge ${coin.identifier} with ${key.identifier}`)
  }
}