import { Result, TransactionExecutor } from "amazon-qldb-driver-nodejs";
import * as QLDB from './qldb';

export const handler = async (event: any) => {

  const driver = QLDB.driver();

  try {

    if(event.RequestType === 'Create') {

      await driver.executeLambda(async (txn: TransactionExecutor) => {
        await txn.execute('CREATE TABLE bridge');
        await txn.execute('CREATE INDEX ON bridge (token_id)');
        await txn.execute('CREATE INDEX ON bridge (account)');
      });
    }
  } catch (error) {
    console.log(error);
    throw error;
  }

  return {
    body: JSON.stringify({
      message: `Executed Lambda Successful and Fetches the coins list`,
    }),
    statusCode: 200,
  };
};
