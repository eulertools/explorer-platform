import { handler } from '../../src/app-coinmarketcap-collector/coinmarketcap-entity-get-coins'

describe('Collector token transfer', () => {

  let event:any;
  let context:any;

  beforeAll(() => {

    require('dotenv').config();

    jest.setTimeout(250000);
    event = {
      Records:[
        {
          body: JSON.stringify({
            coins: [ 825 ],
          })
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

