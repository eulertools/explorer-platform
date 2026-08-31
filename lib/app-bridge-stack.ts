import { CustomResource, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as qldb from 'aws-cdk-lib/aws-qldb';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from "aws-cdk-lib/aws-kms";
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { DynamoStreamConstruct } from './construct/dynamodb-stream-construct';
import { KinesisEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class AppBridgeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ledger = new qldb.CfnLedger(this, 'PlatformLedger', {
      permissionsMode: 'STANDARD',
      deletionProtection: false,
    });

    new ssm.StringParameter(this, `ssm-platform-qldb-output`, {
      stringValue: ledger.ref,
      parameterName: `/platform/qldb/platform-qldb-name`,
    });

    const kdsKmsKey = new kms.Key(this, "KmsKeyForKds", {
      alias: 'alias/qldb-streaming/kds-key',
      description:
        "KMS key used to encrypt Kinesis Data Stream instance used for QLDB streaming.",
      enableKeyRotation: true,
    });

    const stream = new kinesis.Stream(
      this,
      `platform-qldb-stream`,
      {
        streamName: `platform-qldb-stream`,
        shardCount: 1,
        encryption: kinesis.StreamEncryption.KMS,
        encryptionKey: kdsKmsKey,
        retentionPeriod: Duration.hours(24),
      }
    );

    const qldbStreamRole = new iam.Role(this, "PlatformQldbStreamRole", {
      assumedBy: new iam.ServicePrincipal("qldb.amazonaws.com"),
      description:
        "Role used by QLDB to stream data into Kinesis Data Stream instance",
    });
    qldbStreamRole.addToPolicy(new iam.PolicyStatement({
      actions: ['kinesis:DescribeStream'],
      resources: ['*'],
    }));
    stream.grantReadWrite(qldbStreamRole)
    stream.grant(qldbStreamRole, "kinesis:DescribeStream");

    const dateTime = new Date("2022-01-01");
    new qldb.CfnStream(this, "QldbBlogLedgerStream", {
      streamName: "QldbBlogLedgerStream",
      ledgerName: ledger.ref,
      kinesisConfiguration: {
        streamArn: stream.streamArn,
        aggregationEnabled: false,
      },
      inclusiveStartTime: dateTime.toISOString(),
      roleArn: qldbStreamRole.roleArn,
    });

    const initQLDB = new NodejsFunction(this, 'InitPlatformQLDBHandler', {
      description: 'Init platform QLDB',
      memorySize: 1024,
      timeout: Duration.seconds(10),
      handler: 'handler',
      functionName: `init-platform-qldb`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/app-init-qldb/index.ts`),
      environment: {
        LEDGER_NAME: ledger.ref
      },
      bundling: {
        minify: true,
        externalModules: ['electron','aws-sdk'],
      },
      reservedConcurrentExecutions: 1
    });

    initQLDB.addToRolePolicy(new iam.PolicyStatement({
      actions: [ 'qldb:*' ],
      effect: iam.Effect.ALLOW,
      resources: [ '*' ]
    }));

    const myProvider = new cr.Provider(this, 'PlatformQLDBProvider', {
      onEventHandler: initQLDB,
      logRetention: RetentionDays.ONE_DAY,
    });

    const table = new DynamoStreamConstruct(this, 'blockchain-bridge-dynamodb-construct', {
      prefix: 'blockchain-bridge',
      partitionKey: { name: 'account', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'ticket_id', type: dynamodb.AttributeType.STRING }
    });

    const insertEntityHandler = new NodejsFunction(this, 'BridgeEntityHandler', {
      description: 'Retrieves the coins data from SQS, extracts the coin id from the queue',
      memorySize: 1024,
      timeout: Duration.seconds(20),
      handler: 'handler',
      functionName: `bridge-entity-inserter`,
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, `/../src/bridge-entity-inserter/index.ts`),
      environment: {
        BRIDGE_TABLE: table.table.tableName
      },
      bundling: {
        minify: true,
        externalModules: ['electron', 'aws-sdk'],
      },
    });

    insertEntityHandler.addEventSource(
      new KinesisEventSource(stream, {
        batchSize: 25,
        startingPosition: lambda.StartingPosition.LATEST,
        bisectBatchOnError: true,
      })
    );

    stream.grantRead(insertEntityHandler);
    table.table.grantReadWriteData(insertEntityHandler);
    
    new CustomResource(this, 'PlatformQLDBResource', { serviceToken: myProvider.serviceToken });
  }
}