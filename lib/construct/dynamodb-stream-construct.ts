import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";

export interface Key {
  name: string;
  type: dynamodb.AttributeType
}

export interface ConstructProps extends StackProps {
  prefix: string;
  partitionKey: Key;
  sortKey?: Key;
}

export class DynamoStreamConstruct extends Construct {

  public readonly table: dynamodb.Table;
  public readonly stream: kinesis.Stream;

  constructor(stack: Stack, id: string, props?: ConstructProps) {
    super(stack, id);

    const {prefix, partitionKey, sortKey} = props!

    const stream = new kinesis.Stream(
      this,
      `${prefix}-dynamodb-stream`,
      {
        streamName: `${prefix}-dynamodb-stream`,
        shardCount: 1,
        retentionPeriod: Duration.hours(24),
      }
    );

    let config:any =  {
      partitionKey: {
        name: partitionKey.name,
        type: partitionKey.type,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      kinesisStream: stream,
    }
    if(sortKey){
      config = { 
        ...config, 
        sortKey: {
          name: sortKey.name,
          type: sortKey.type,
        }}
    }
    
    const table = new dynamodb.Table(this, `${prefix}-table`, config);
    
    this.table = table;
    this.stream = stream;

    new ssm.StringParameter(this, `ssm-${prefix}-table-output`, {
      stringValue: table.tableArn,
      parameterName: `/directory/table/${prefix}-table-arn`,
    });

    new ssm.StringParameter(this, `ssm-${prefix}-stream-output`, {
      stringValue: stream.streamArn,
      parameterName: `/directory/stream/${prefix}-events-stream-arn`,
    });
  }
}
