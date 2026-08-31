import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { DynamoStreamConstruct } from './construct/dynamodb-stream-construct'
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as ssm from "aws-cdk-lib/aws-ssm";
export class AppSettingsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const tableSettings = new DynamoStreamConstruct(this, 'settings-construct', {
      prefix: 'settings',
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
    });
  }
}
