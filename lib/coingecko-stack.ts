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
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
export interface AppStackProps extends StackProps {
  environment: string;
}

export class CoinGeckoStack extends Stack {
  constructor(scope: App, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { environment } = props!;

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(
      this,
      'sentryDSN',
      'sentryDSN',
    );

    const queue = new sqs.Queue(this, `CoingeckoQueue`, {
      visibilityTimeout: Duration.seconds(300),
    });

    const marketcapQueue = new sqs.Queue(this, `CoingeckoMarketcapQueue`, {
      visibilityTimeout: Duration.seconds(300),
    });

    const apiCreds = secretsmanager.Secret.fromSecretNameV2(
      this,
      "coingeckoApiKey",
      "coingeckoApiKey"
    );

    const catalogArn = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm-catalog-table-output",
      "/directory/table/raw-catalog-table-arn"
    );

    const rawCatalogTable = dynamodb.Table.fromTableArn(this,'raw-catalog-table', catalogArn.stringValue);

    const enqueuerHandler = new NodejsFunction(this, 'CoingeckoEnqueuerHandler', {
      tracing: lambda.Tracing.ACTIVE,
      description: 'Get the coins data from CoinGecko API, enqueue the coins to the SQS Queue',
      memorySize: 1024,
      timeout: Duration.minutes(15),
      handler: 'handler',
      functionName: `coingecko-entity-enqueuer`,
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
      entry: path.join(__dirname, `/../src/app-coingecko-collector/coingecko-entity-enqueuer/index.ts`),
      reservedConcurrentExecutions: 1
    });

    const streamCoinArn = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm-insert-coin-stream-output",
      "/explorer/stream/insert-coin-stream-arn"
    ).stringValue;

    const streamCoin = kinesis.Stream.fromStreamArn(this, 'InsertCoinStream', streamCoinArn);

    const getCoinEntityHandler = new NodejsFunction(this, 'CoingeckoGetCoinEntityHandler', {
      tracing: lambda.Tracing.ACTIVE,
      description: 'Retrieves the coins data from SQS, extracts the coin id from the queue',
      memorySize: 1024,
      timeout: Duration.seconds(10),
      handler: 'handler',
      functionName: `coingecko-entity-get-coin`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-coingecko-collector/coingecko-entity-get-coin/index.ts`),
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        INSERT_COIN_STREAM: streamCoin.streamName,
        API_KEY: apiCreds.secretValueFromJson("api_key").toString(),
        CATALOG_TABLENAME: rawCatalogTable.tableName
      },
      bundling: {
        minify: true,
        externalModules: ['electron','aws-sdk'],
      },
      reservedConcurrentExecutions: 1
    });

    const enqueuerMarketCapHandler = new NodejsFunction(this, 'CoingeckoMarketcapEnqueuerHandler', {
      tracing: lambda.Tracing.ACTIVE,
      description: 'Get the coins market cap from CoinGecko API, enqueue the coins to the SQS Queue',
      memorySize: 4096,
      timeout: Duration.minutes(15),
      handler: 'handler',
      functionName: `coingecko-marketcap-enqueuer`,
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
      entry: path.join(__dirname, `/../src/app-coingecko-collector/coingecko-marketcap-enqueuer/index.ts`),
      reservedConcurrentExecutions: 1
    });

    const getPageMarketcapHandler = new NodejsFunction(this, 'CoingeckoGetPageMarketcapHandler', {
      tracing: lambda.Tracing.ACTIVE,
      description: 'Retrieves the coins data from SQS, extracts the coin id from the queue',
      memorySize: 1024,
      timeout: Duration.seconds(10),
      handler: 'handler',
      functionName: `coingecko-get-page-marketcap`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-coingecko-collector/coingecko-get-page-marketcap/index.ts`),
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

    const coingeckoSource = new lambdaEventSources.SqsEventSource(
      queue,
      {
        batchSize: 1,
        enabled: true,
      }
    );

    rawCatalogTable.grantReadData(getCoinEntityHandler);
    getCoinEntityHandler.addEventSource(coingeckoSource);
    queue.grantConsumeMessages(getCoinEntityHandler);
    streamCoin.grantReadWrite(getCoinEntityHandler);

    const lambdaTaskTarget = new LambdaFunction(enqueuerHandler);

    if (environment !== 'dev' ) {
      new Rule(this, 'ScheduleRule', {
        description: 'Triggers the coingecko entity updater',
        schedule: Schedule.cron({minute: '0', hour: '0'}),
        targets: [lambdaTaskTarget],
      });
    }

    queue.grantSendMessages(enqueuerHandler);

    const lambdaMarketcapTaskTarget = new LambdaFunction(enqueuerMarketCapHandler);

    let cronExpresion = 'cron(0/7 * ? * * *)';

    if(environment === 'dev' ) cronExpresion = 'cron(0 0 ? * MON-FRI *)'

    new Rule(this, 'ScheduleMarketcapRule', {
      description: 'Triggers the coingecko marketcap updater',
      schedule: Schedule.expression(cronExpresion),
      targets: [lambdaMarketcapTaskTarget],
    });

    marketcapQueue.grantSendMessages(enqueuerMarketCapHandler);

    const coingeckoMarketcapSource = new lambdaEventSources.SqsEventSource(
      marketcapQueue,
      {
        batchSize: 1,
        enabled: true
      }
    );

    getPageMarketcapHandler.addEventSource(coingeckoMarketcapSource);
    marketcapQueue.grantConsumeMessages(getPageMarketcapHandler);
    streamCoin.grantReadWrite(getPageMarketcapHandler);

    const listCoinEulerLambda = new NodejsFunction(this, `ListCoinEulerHandler`, {
      tracing: lambda.Tracing.ACTIVE,
      description: 'Kinesis streaming from catalog',
      memorySize: 512,
      logRetention: RetentionDays.ONE_DAY,
      timeout: Duration.minutes(1),
      handler: 'handler',
      functionName: `catalog-list-coin-euler`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-list-coin-euler/index.ts`),
      allowPublicSubnet: true,
      bundling: {
        minify: true,
        externalModules: ['electron'],
      },
      environment: {
        CATALOG_TABLENAME: rawCatalogTable.tableName,
        SQS_COINGECKO_QUEUE_URL: queue.queueUrl,
        SQS_COINGECKO_MARKETCAP_QUEUE_URL: marketcapQueue.queueUrl,
      }
    });

    rawCatalogTable.grantReadWriteData(listCoinEulerLambda);
    marketcapQueue.grantSendMessages(listCoinEulerLambda);
    queue.grantSendMessages(listCoinEulerLambda);
  }
}
