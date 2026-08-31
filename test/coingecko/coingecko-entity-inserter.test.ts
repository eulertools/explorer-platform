import { handler } from '../../src/app-coingecko-collector/coingecko-entity-inserter'

describe('Collector coingecko inserter', () => {

  let event:any;
  let context:any;

  beforeAll(() => {

    require('dotenv').config();

    jest.setTimeout(250000);
    event = {}

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

