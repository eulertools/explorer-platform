import { QldbDriver, Result, RetryConfig, TransactionExecutor } from "amazon-qldb-driver-nodejs";
import { ClientConfiguration } from "aws-sdk/clients/acm";
import { Agent } from "https";

require('dotenv').config();

const ledgerName = process.env.LEDGER_NAME as string;

export const driver = ():QldbDriver => {
  const maxConcurrentTransactions: number = 10;
  const agentForQldb: Agent = new Agent({
      keepAlive: true,
      maxSockets: maxConcurrentTransactions
  });
  const serviceConfigurationOptions: ClientConfiguration = {
      region: process.env.AWS_REGION,
      httpOptions: {
          agent: agentForQldb
      }
  };
  const retryLimit: number = 4;

  const retryConfig: RetryConfig = new RetryConfig(retryLimit);
  return new QldbDriver(ledgerName, serviceConfigurationOptions, maxConcurrentTransactions, retryConfig);
}