import { handler } from '../../src/app-coinmarketcap-collector/coinmarketcap-get-page-marketcap'

describe('Collector token transfer', () => {

  let event:any;
  let context:any;

  beforeAll(() => {

    require('dotenv').config();

    jest.setTimeout(250000);
    event = {
      Records:[
        {
          body: '1'
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
      done.fail(e as any)
    }
  });
});

