import * as Mapping from './mapping';
import { getItem, updateItem } from "./dynamodb";

const mapping = [
  { "source": "symbol", "destination" : "symbol", transform: (value:any) => value.toUpperCase() },
  { "source": "name", "destination" : "name" },
  { "source": "description", "destination" : "description" },
  { "source": "platforms.binance-smart-chain", "destination" : "networks.bnb.address", transform: (value:any) => Mapping.secureAddress(value) },
  { "source": "platforms.ethereum", "destination" : "networks.eth.address", transform: (value:any) => Mapping.secureAddress(value) },
  { "source": "platforms.avalanche", "destination" : "networks.ava.address", transform: (value:any) => Mapping.secureAddress(value) },
  { "source": "platforms.polygon-pos", "destination" : "networks.matic.address", transform: (value:any) => Mapping.secureAddress(value) },
  { "source": "country_origin", "destination" : "country_origin" },
  { "source": "genesis_date", "destination" : "genesis_date" },
  { "source": "coingecko_rank", "destination" : "rank.cg.global", overwrite: true },
  { "source": "market_cap_rank", "destination" : "rank.cg.market_cap", overwrite: true },
  { "source": "coingecko_score", "destination" : "score.cg.score", overwrite: true },
  { "source": "developer_score", "destination" : "score.cg.developer", overwrite: true },
  { "source": "community_score", "destination" : "score.cg.community", overwrite: true },
  { "source": "liquidity_score", "destination" : "score.cg.liquidity", overwrite: true},
  { "source": "public_interest_score", "destination" : "score.cg.public_interest", overwrite: true },
  { "source": "categories", "destination" : "tags", transform: (value:any) => value.filter((link:any) => link) },
  { "source": "image.thumb", "destination" : "image.cg.thumb", overwrite: true },
  { "source": "image.small", "destination" : "image.cg.small", overwrite: true },
  { "source": "image.large", "destination" : "image.cg.large", overwrite: true },
  { "source": "links.homepage", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'homepage', url: link } }), overwrite: false, key: 'url' },
  { "source": "links.blockchain_site", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'blockchain_site', url: link } }), overwrite: false, key: 'url' },
  { "source": "links.official_forum_url", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'official_forum', url: link } }), overwrite: false, key: 'url' },
  { "source": "links.chat_url", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'chat', url: link } }), overwrite: false, key: 'url' },
  { "source": "links.announcement_url", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'announcement', url: link } }), overwrite: false, key: 'url' },
  { "source": "links.repos_url.github", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'repo', url: link } }), overwrite: false, key: 'url' },
  { "source": "links.repos_url.bitbucket", "destination" : "links", transform: (value:any) => value.filter((link:any) => link).map((link:any) => {
    return { kind: 'repo', url: link } }), overwrite: false, key: 'url' },
  { "source": "links.twitter_screen_name", "destination" : "socials_media.twitter", overwrite: true },
  { "source": "links.facebook_username", "destination" : "socials_media.facebook", overwrite: true },
  { "source": "links.telegram_channel_identifier", "destination" : "socials_media.telegram", overwrite: true },
  { "source": "links.subreddit_url", "destination" : "socials_media.reddit", overwrite: true },
  { "source": "last_updated", "destination" : "update_date_coingecko", overwrite: true }
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
      ':source': { S: 'euler' },
    },
    ScanIndexForward: false,
  });

  if(result && new Date(result.update_date_coingecko).getTime() < new Date(coin.last_updated).getTime()) {

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

    console.log(`pre ${coin.id}`, JSON.stringify(coin))
    Mapping.merge(coin, value, mapping);
    console.log(`after ${coin.id}`, JSON.stringify(coin))

    const updateCanonicalPromise = await updateItem(process.env.CATALOG_TABLENAME,key, value, null);
    const updateCoingeckoPromise = await updateItem(process.env.CATALOG_TABLENAME,{
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