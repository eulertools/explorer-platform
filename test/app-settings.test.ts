import * as insert_settings from '../src/app-catalog-stream/settings/insert/index';

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

    it('insert settings', async (done) => {
      event = {
        Records:[
          {
            kinesis: {
              data: Buffer.from(JSON.stringify({
                key: "features",
                data: {
                  marketplaceV2Enabled: true,
                  marketsDisabled: false,
                  profilesDisabled: false,
                  nftDisabled: false
              }
              })).toString('base64')
            }
          }
        ]
      } 
        await insert_settings.handler(event, context);

        done();

    });
  });
