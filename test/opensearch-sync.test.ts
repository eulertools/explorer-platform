import { handler } from '../src/app-catalog-stream/opensearch-sync'
import coingecko from './dyanmodb-examples/coingecko.json';

describe('Collector token transfer', () => {

  let event:any;
  let context:any;

  beforeAll(() => {

    require('dotenv').config();

    jest.setTimeout(250000);
    event = {
      Records:[
        {
          kinesis: {
            data: Buffer.from(JSON.stringify({
              dynamodb: {
                NewImage: coingecko
              }
            })).toString('base64')
          }
        }
      ]
    }

    context = {}
  });

  it('execute', async (done) => {
    try {
      await handler(event, context);
      done();
    } catch (e) {
      done.fail(e)
    }
  });
});

