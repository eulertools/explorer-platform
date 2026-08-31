

import { handler } from '../src/app-list-coin-euler';


describe('Stream catalog', () => {

  let event:any;
  let context:any;

  beforeAll(() => {

    require('dotenv').config();

    jest.setTimeout(250000);
    
    event = {
        canonical: 'avalanche',
        coingecko_id: 'avalanche-2'
    }

    context = {}
  });

  it('list coin', async (done) => {
    try {


      await handler(event, context);
      
      done();
    } catch (e) {
      done.fail(e)
    }
  });
});

