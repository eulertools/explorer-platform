import * as sqs from 'aws-cdk-lib/aws-sqs';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import {App, Duration, Stack, StackProps} from 'aws-cdk-lib';
import * as ssm from "aws-cdk-lib/aws-ssm";

export interface AppStackProps extends StackProps {}

export class AppAssetsStack extends Stack {
  constructor(scope: App, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, `InsertHistoricalBalanceQueue`, {
      visibilityTimeout: Duration.seconds(300),
    });

    const blockchainConf = {
      "bnb":"https://bsc-rpc.publicnode.com"
    }

    const blockchainDatabase:any[] = [ 
      { keyDatabase: 'bsc', keyConf: 'bnb'} 
    ];

    const dbCreds:any = {};

    blockchainDatabase.map((conf:any) => {
      const dbcred = secretsmanager.Secret.fromSecretNameV2(
        this,
        "DatabaseCredentials",
        `databases/${conf.keyDatabase}`
      );

      dbCreds[conf.keyConf] = dbcred.secretValue.toString();
    });

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(
      this,
      'sentryDSN',
      'sentryDSN',
    );

    const userItemsArn = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm-user-items-table-output",
      "/directory/table/user-items-table-arn"
    );

    const userItemsTable = dynamodb.Table.fromTableArn(this,'user-items-table', userItemsArn.stringValue);

    const handler = new NodejsFunction(this, 'InsertHistoricalBalanceHandler', {
      description: 'Insert in user-items the historical balance of a wallet',
      memorySize: 512,
      timeout: Duration.minutes(5),
      handler: 'handler',
      functionName: `insert-historical-balance`,
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        DB_NAME: 'mainnet',
        TABLE_NAME: userItemsTable.tableName,
        BLOCKCHAIN_RPCS: JSON.stringify(blockchainConf)
      },
      bundling: {
        minify: true,
        externalModules: ['aws-sdk'],
        nodeModules: ['pg']
      },
      entry: path.join(__dirname, `/../src/app-insert-historical-balance/index.ts`),
      reservedConcurrentExecutions: 1
    });

    Object.entries(dbCreds).map((cred:any) => {
      handler.addEnvironment(`DB_CREDS_${cred[0].toUpperCase()}`, cred[1])
    });

    const coinmarketcapSource = new lambdaEventSources.SqsEventSource(
      queue,
      {
        batchSize: 1,
        enabled: true,
      }
    );

    userItemsTable.grantReadWriteData(handler);
    handler.addEventSource(coinmarketcapSource);
    queue.grantConsumeMessages(handler);
  }
}
