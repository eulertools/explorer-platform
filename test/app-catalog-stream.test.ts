import * as MergeCoingecko from '../src/app-catalog-stream/catalog-merge-coingecko';
import * as MergeCoinmarketcap from '../src/app-catalog-stream/catalog-merge-coinmarketcap';
import * as MergeGoPlus from '../src/app-catalog-stream/catalog-merge-goplus';
import * as Sync from '../src/app-catalog-stream/opensearch-sync';
import * as NewAddress from '../src/app-catalog-stream/goplussecurity-inserter';

import { DynamoDB } from 'aws-sdk';

import canonical from './dyanmodb-examples/canonical.json';
import canonical_goplus from './dyanmodb-examples/canonical_goplus.json';
import coingecko from './dyanmodb-examples/coingecko.json';
import coingecko_marketcap from './dyanmodb-examples/coingecko_marketcap.json';
import goplussecurity from './dyanmodb-examples/goplussecurity.json';
import coinmarketcap from './dyanmodb-examples/coinmarketcap.json';
import coinmarketcap_marketcap from './dyanmodb-examples/coinmarketcap_marketcap.json';

describe('Stream catalog', () => {

  let event:any;
  let context:any;

  beforeAll(() => {

    require('dotenv').config();

    jest.setTimeout(250000);
    event = {
      Records:[]
    }

    context = {}
  });

  // it('merge coingecko', async (done) => {
  //   try {

  //     const record:any = {
  //       kinesis: {
  //         data: Buffer.from(JSON.stringify({
  //           dynamodb: {
  //             NewImage: coingecko
  //           }
  //         })).toString('base64')
  //       }
  //     }

  //     event.Records.push(record);

  //     await MergeCoingecko.handler(event, context);
      
  //     done();
  //   } catch (e) {
  //     done.fail(e)
  //   }
  // });

  // it('sync euler', async (done) => {
  //   try {

  //     const record:any = {
  //       kinesis: {
  //         data: Buffer.from(JSON.stringify({
  //           dynamodb: {
  //             NewImage: canonical
  //           }
  //         })).toString('base64')
  //       }
  //     }

  //     event.Records.push(record);

  //     await Sync.handler(event, context);
      
  //     done();
  //   } catch (e) {
  //     done.fail(e)
  //   }
  // });

  // it('create goplussecurity', async (done) => {
  //   try {

  //     const record:any = {
  //       kinesis: {
  //         data: Buffer.from(JSON.stringify({
  //           dynamodb: {
  //             NewImage: {
  //               ...canonical_goplus
  //             }
  //           }
  //         })).toString('base64')
  //       }
  //     }

  //     event.Records.push(record);

  //     await NewAddress.handler(event, context);
      
  //     done();
  //   } catch (e) {
  //     done.fail(e)
  //   }
  // });

//  it('merge goplussecurity', async (done) => {
//     try {

//       const record:any = {
//         kinesis: {
//           data: Buffer.from(JSON.stringify({
//             dynamodb: {
//               NewImage: goplussecurity
//             }
//           })).toString('base64')
//         }
//       }

//       event.Records.push(record);

//       await MergeGoPlus.handler(event, context);
      
//       done();
//     } catch (e) {
//       done.fail(e)
//     }
//   });

// it('merge coingecko marketcap', async (done) => {
//     try {

//       const record:any = {
//         kinesis: {
//           data: Buffer.from(JSON.stringify({
//             dynamodb: {
//               NewImage: coingecko_marketcap
//             }
//           })).toString('base64')
//         }
//       }

//       event.Records.push(record);

//       await MergeCoingecko.handler(event, context);
      
//       done();
//     } catch (e) {
//       done.fail(e)
//     }
//   });

  // it('merge coinmarketcap', async (done) => {
  //     try {

  //       const record:any = {
  //         kinesis: {
  //           data: Buffer.from(JSON.stringify({
  //             dynamodb: {
  //               NewImage: coinmarketcap
  //             }
  //           })).toString('base64')
  //         }
  //       }

  //       event.Records.push(record);

  //       await MergeCoinmarketcap.handler(event, context);
        
  //       done();
  //     } catch (e) {
  //       done.fail(e)
  //     }
  // });

  it('merge coinmarketcap marketcap', async (done) => {
    try {

      const record:any = {
        kinesis: {
          data: Buffer.from(JSON.stringify({
            dynamodb: {
              NewImage: coinmarketcap_marketcap
            }
          })).toString('base64')
        }
      }

      event.Records.push(record);

      await MergeCoinmarketcap.handler(event, context);
      
      done();
    } catch (e) {
      done.fail(e as Error)
    }
  });
});

