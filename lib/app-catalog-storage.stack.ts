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
import { AnyPrincipal, Effect, ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class CatalogStorageStack extends Stack {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { hostedZone } = props!;

    const table = new DynamoStreamConstruct(this, 'catalog-dynamodb-construct', {
      prefix: 'blockchain',
      partitionKey: { name: 'identifier', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'kind', type: dynamodb.AttributeType.STRING }
    });

    const osdomain = opensearch.Domain.fromDomainEndpoint(this, 'catalog-opensearch', `https://catalogs.${hostedZone}`);

    const syncLambda = new NodejsFunction(this, `CatalogSyncHandler`, {
      description: 'Kinesis streaming from catalog',
      memorySize: 512,
      logRetention: RetentionDays.ONE_DAY,
      timeout: Duration.minutes(1),
      handler: 'handler',
      functionName: `blockchain-sync-stream-events`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-catalog-stream/opensearch-sync/index.ts`),
      allowPublicSubnet: true,
      bundling: {
        minify: true,
        externalModules: ['electron'],
      },
      environment: {
        ES_DOMAIN: osdomain.domainEndpoint,
        ES_INDEX: 'blockchain_catalog',
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
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      bisectBatchOnError: true,
      enabled: true,
    });

    syncLambda.addEventSource(eventSource);
  }
}
