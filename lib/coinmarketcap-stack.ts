import * as sqs from 'aws-cdk-lib/aws-sqs';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import {App, Duration, Stack, StackProps} from 'aws-cdk-lib';
import {LambdaFunction} from "aws-cdk-lib/aws-events-targets";
import {Rule, Schedule} from "aws-cdk-lib/aws-events";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { KinesisEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

export interface AppStackProps extends StackProps {
  environment: string;
}

export class CoinMarketCapStack extends Stack {
  constructor(scope: App, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { environment } = props!;

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(
      this,
      'sentryDSN',
      'sentryDSN',
    );

    const queue = new sqs.Queue(this, `CoinmarketcapQueue`, {
      visibilityTimeout: Duration.seconds(300),
    });

    const marketcapQueue = new sqs.Queue(this, `CoinmarketcapMarketcapQueue`, {
      visibilityTimeout: Duration.seconds(300),
    });

    const apiCreds = secretsmanager.Secret.fromSecretNameV2(
      this,
      "apis/coinmarketcap",
      "apis/coinmarketcap"
    );

    const catalogArn = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm-raw-catalog-table-output",
      "/directory/table/raw-catalog-table-arn"
    );

    const rawCatalogTable = dynamodb.Table.fromTableArn(this,'raw-catalog-table', catalogArn.stringValue);

    const streamCoinArn = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm-insert-coin-stream-output",
      "/explorer/stream/insert-coin-stream-arn"
    ).stringValue;

    const streamCoin = kinesis.Stream.fromStreamArn(this, 'InsertCoinStream', streamCoinArn);

    const enqueuerHandler = new NodejsFunction(this, 'CoinmarketcapEnqueuerHandler', {
      description: 'Get the coins data from CoinMarketCap API, enqueue the coins to the SQS Queue',
      memorySize: 1024,
      timeout: Duration.minutes(15),
      handler: 'handler',
      functionName: `coinmarketcap-entity-enqueuer`,
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        SQS_QUEUE_URL: queue.queueUrl,
        API_KEY: apiCreds.secretValueFromJson("api_key").toString()
      },
      bundling: {
        minify: true,
        externalModules: ['aws-sdk']
      },
      entry: path.join(__dirname, `/../src/app-coinmarketcap-collector/coinmarketcap-entity-enqueuer/index.ts`),
      reservedConcurrentExecutions: 1
    });

    queue.grantSendMessages(enqueuerHandler);

    const lambdaTaskTarget = new LambdaFunction(enqueuerHandler);

    if(environment !== 'dev' ) {
      new Rule(this, 'ScheduleCoinmarketcapRule', {
        description: 'Triggers the coinmarketcap entity updater',
        schedule: Schedule.cron({minute: '0', hour: '0'}),
        targets: [lambdaTaskTarget],
      });
    }

    const getCoinsEntityHandler = new NodejsFunction(this, 'CoinmarketcapGetCoinEntityHandler', {
      description: 'Retrieves the coins data from SQS, extracts the coin id from the queue',
      memorySize: 1024,
      timeout: Duration.seconds(10),
      handler: 'handler',
      functionName: `coinmarketcap-entity-get-coins`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-coinmarketcap-collector/coinmarketcap-entity-get-coins/index.ts`),
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        API_KEY: apiCreds.secretValueFromJson("api_key").toString(),
        CATALOG_TABLENAME: rawCatalogTable.tableName,
        INSERT_COIN_STREAM: streamCoin.streamName
      },
      bundling: {
        minify: true,
        externalModules: ['electron','aws-sdk'],
      },
      reservedConcurrentExecutions: 1
    });

    const enqueuerMarketCapHandler = new NodejsFunction(this, 'CoinmarketcapMarketcapEnqueuerHandler', {
      description: 'Get the coins market cap from CoinMarketCap API, enqueue the coins to the SQS Queue',
      memorySize: 4096,
      timeout: Duration.minutes(15),
      handler: 'handler',
      functionName: `coinmarketcap-marketcap-enqueuer`,
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        SQS_QUEUE_URL: marketcapQueue.queueUrl,
        API_KEY: apiCreds.secretValueFromJson("api_key").toString()
      },
      bundling: {
        minify: true,
        externalModules: ['aws-sdk']
      },
      entry: path.join(__dirname, `/../src/app-coinmarketcap-collector/coinmarketcap-marketcap-enqueuer/index.ts`),
      reservedConcurrentExecutions: 1
    });

    const getPageMarketcapHandler = new NodejsFunction(this, 'CoinmarketcapGetPageMarketcapHandler', {
      description: 'Retrieves the coins data from SQS, extracts the coin id from the queue',
      memorySize: 1024,
      timeout: Duration.seconds(10),
      handler: 'handler',
      functionName: `coinmarketcap-get-page-marketcap`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-coinmarketcap-collector/coinmarketcap-get-page-marketcap/index.ts`),
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        INSERT_COIN_STREAM: streamCoin.streamName,
        API_KEY: apiCreds.secretValueFromJson("api_key").toString()
      },
      bundling: {
        minify: true,
        externalModules: ['electron','aws-sdk'],
      },
      reservedConcurrentExecutions: 1
    });

    const coinmarketcapSource = new lambdaEventSources.SqsEventSource(
      queue,
      {
        batchSize: 1,
        enabled: true,
      }
    );

    rawCatalogTable.grantReadData(getCoinsEntityHandler);
    getCoinsEntityHandler.addEventSource(coinmarketcapSource);
    queue.grantConsumeMessages(getCoinsEntityHandler);
    streamCoin.grantReadWrite(getCoinsEntityHandler);

    const lambdaMarketcapTaskTarget = new LambdaFunction(enqueuerMarketCapHandler);

    if(environment === 'prod' ) {
      new Rule(this, 'ScheduleCoinmarketcapMarketcapRule', {
        description: 'Triggers the coinmarketcap marketcap updater',
        schedule: Schedule.cron({minute: '0', hour: '0'}),
        targets: [lambdaMarketcapTaskTarget],
      });
    }

    marketcapQueue.grantSendMessages(enqueuerMarketCapHandler);

    const coinmarketMarketcapSource = new lambdaEventSources.SqsEventSource(
      marketcapQueue,
      {
        batchSize: 1,
        enabled: true
      }
    );

    getPageMarketcapHandler.addEventSource(coinmarketMarketcapSource);
    marketcapQueue.grantConsumeMessages(getPageMarketcapHandler);
    streamCoin.grantReadWrite(getPageMarketcapHandler);
  }
}
