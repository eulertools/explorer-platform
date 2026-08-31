import { Stack, StackProps, Duration,
  aws_opensearchservice as opensearch
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DynamoStreamConstruct } from './construct/dynamodb-stream-construct'
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as iam from "aws-cdk-lib/aws-iam";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Effect } from 'aws-cdk-lib/aws-iam';
import { KinesisEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class DynamoDBStorageStack extends Stack {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { hostedZone } = props!;

    const rawTable = new DynamoStreamConstruct(this, 'raw-catalog-dynamodb-construct', {
      prefix: 'raw-catalog',
      partitionKey: { name: 'identifier', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'update_date', type: dynamodb.AttributeType.NUMBER }
    });

    const table = new DynamoStreamConstruct(this, 'catalog-dynamodb-construct', {
      prefix: 'catalog',
      partitionKey: { name: 'identifier', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'update_date', type: dynamodb.AttributeType.NUMBER }
    });

    table.table.addGlobalSecondaryIndex({
      indexName: 'catalog_coingeckoIndex',
      partitionKey: {name: 'coingecko_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'update_date', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    table.table.addGlobalSecondaryIndex({
      indexName: 'catalog_coinmarketcapIndex',
      partitionKey: {name: 'coinmarketcap_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'update_date', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const streamCoin = new kinesis.Stream(
      this,
      `InsertCoinStream`,
      {
        streamName: `insert-coin-stream`,
        shardCount: 1,
        retentionPeriod: Duration.hours(24),
      }
    );

    new ssm.StringParameter(this, `ssm-insert-coin-stream-output`, {
      stringValue: streamCoin.streamArn,
      parameterName: `/explorer/stream/insert-coin-stream-arn`,
    });

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(
      this,
      'sentryDSN',
      'sentryDSN',
    );

    const insertEntityHandler = new NodejsFunction(this, 'CoinEntityHandler', {
      description: 'Retrieves the coins data from SQS, extracts the coin id from the queue',
      memorySize: 1024,
      timeout: Duration.seconds(20),
      handler: 'handler',
      functionName: `coin-entity-inserter`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-catalog-stream/coin-entity-inserter/index.ts`),
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        CATALOG_TABLENAME: rawTable.table.tableName
      },
      bundling: {
        minify: true,
        externalModules: ['electron', 'aws-sdk'],
      },
    });

    insertEntityHandler.addEventSource(
      new KinesisEventSource(streamCoin, {
        batchSize: 25,
        startingPosition: lambda.StartingPosition.LATEST,
        bisectBatchOnError: true,
      })
    );

    streamCoin.grantRead(insertEntityHandler);

    rawTable.table.grantReadWriteData(insertEntityHandler);

    const osdomain = opensearch.Domain.fromDomainEndpoint(this, 'catalog-opensearch', `https://catalogs.${hostedZone}`);

    const syncLambda = new NodejsFunction(this, `CatalogSyncHandler`, {
      description: 'Kinesis streaming from catalog',
      memorySize: 512,
      logRetention: RetentionDays.ONE_DAY,
      timeout: Duration.minutes(1),
      handler: 'handler',
      functionName: `catalog-sync-stream-events`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-catalog-stream/opensearch-sync/index.ts`),
      allowPublicSubnet: true,
      bundling: {
        minify: true,
        externalModules: ['electron'],
      },
      environment: {
        ES_DOMAIN: osdomain.domainEndpoint,
        ES_INDEX: 'catalog_v1',
        CATALOG_TABLENAME: table.table.tableName
      }
    });

    osdomain.grantReadWrite(syncLambda);

    syncLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: Effect.ALLOW,
      resources: [osdomain.domainArn],
      actions: ['es:ESHttp*']
    }));

    table.stream.grantRead(syncLambda);
    table.table.grantReadWriteData(syncLambda);

    const eventSource = new lambdaEventSources.KinesisEventSource(table.stream, {
      batchSize: 100,
      startingPosition: lambda.StartingPosition.LATEST,
      bisectBatchOnError: true,
      enabled: true,
      parallelizationFactor: 4
    });

    syncLambda.addEventSource(eventSource);

    const mergeLambdaCoingecko = new NodejsFunction(this, `CatalogMergeCoingeckoHandler`, {
      description: 'Kinesis streaming from catalog',
      memorySize: 512,
      logRetention: RetentionDays.ONE_DAY,
      timeout: Duration.minutes(2),
      handler: 'handler',
      functionName: `catalog-merge-coingecko-stream-events`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-catalog-stream/catalog-merge-coingecko/index.ts`),
      allowPublicSubnet: true,
      bundling: {
        minify: true,
        externalModules: ['electron'],
      },
      environment: {
        CATALOG_TABLENAME: table.table.tableName
      }
    });

    const mergeCoingeckoEventSource = new lambdaEventSources.KinesisEventSource(rawTable.stream, {
      batchSize: 25,
      startingPosition: lambda.StartingPosition.LATEST,
      bisectBatchOnError: true,
      enabled: true,
      parallelizationFactor: 10
    });

    rawTable.stream.grantRead(mergeLambdaCoingecko);
    table.table.grantReadWriteData(mergeLambdaCoingecko);
    mergeLambdaCoingecko.addEventSource(mergeCoingeckoEventSource);

    const mergeLambdaGoPlus = new NodejsFunction(this, `CatalogMergeGoPlusHandler`, {
      description: 'Kinesis streaming from catalog',
      memorySize: 512,
      logRetention: RetentionDays.ONE_DAY,
      timeout: Duration.minutes(1),
      handler: 'handler',
      functionName: `catalog-merge-goplus-stream-events`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-catalog-stream/catalog-merge-goplus/index.ts`),
      allowPublicSubnet: true,
      bundling: {
        minify: true,
        externalModules: ['electron'],
      },
      environment: {
        CATALOG_TABLENAME: table.table.tableName
      }
    });

    const mergeGoPlusEventSource = new lambdaEventSources.KinesisEventSource(rawTable.stream, {
      batchSize: 100,
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      bisectBatchOnError: true,
      enabled: true,
      parallelizationFactor: 1
    });

    rawTable.stream.grantRead(mergeLambdaGoPlus);
    table.table.grantReadWriteData(mergeLambdaGoPlus);
    mergeLambdaGoPlus.addEventSource(mergeGoPlusEventSource);

    const mergeLambdaCoinmarketcap = new NodejsFunction(this, `CatalogMergeCoinMarketCapHandler`, {
      description: 'Kinesis streaming from catalog',
      memorySize: 512,
      logRetention: RetentionDays.ONE_DAY,
      timeout: Duration.minutes(2),
      handler: 'handler',
      functionName: `catalog-merge-coinmarketcap-stream-events`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-catalog-stream/catalog-merge-coinmarketcap/index.ts`),
      allowPublicSubnet: true,
      bundling: {
        minify: true,
        externalModules: ['electron'],
      },
      environment: {
        CATALOG_TABLENAME: table.table.tableName
      }
    });

    const mergeCoinmarketcapEventSource = new lambdaEventSources.KinesisEventSource(rawTable.stream, {
      batchSize: 100,
      startingPosition: lambda.StartingPosition.LATEST,
      bisectBatchOnError: true,
      enabled: true,
      parallelizationFactor: 1
    });

    rawTable.stream.grantRead(mergeLambdaCoinmarketcap);
    table.table.grantReadWriteData(mergeLambdaCoinmarketcap);
    mergeLambdaCoinmarketcap.addEventSource(mergeCoinmarketcapEventSource);

    const goplusInserterLambda = new NodejsFunction(this, `CatalogGoPlusInserterHandler`, {
      description: 'Kinesis streaming from catalog',
      memorySize: 512,
      logRetention: RetentionDays.ONE_DAY,
      timeout: Duration.minutes(1),
      handler: 'handler',
      functionName: `catalog-goplus-inserter-stream-events`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-catalog-stream/goplussecurity-inserter/index.ts`),
      allowPublicSubnet: true,
      bundling: {
        minify: true,
        externalModules: ['electron'],
      },
      environment: {
        CATALOG_TABLENAME: rawTable.table.tableName
      }
    });

    const goPlusEventSource = new lambdaEventSources.KinesisEventSource(table.stream, {
      batchSize: 100,
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      bisectBatchOnError: true,
      enabled: true,
      parallelizationFactor: 1
    });

    table.stream.grantRead(goplusInserterLambda);
    rawTable.table.grantReadWriteData(goplusInserterLambda);
    goplusInserterLambda.addEventSource(goPlusEventSource);
  }
}
