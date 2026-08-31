import { App, aws_elasticache as elasticache, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { InstanceClass, InstanceSize, InstanceType, SubnetType } from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import {
  AuroraPostgresEngineVersion,
  Credentials,
  DatabaseCluster,
  DatabaseClusterEngine,
  ParameterGroup,
  PerformanceInsightRetention,
} from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class PlatformDataStorageStack extends Stack {
  constructor(stack: App, id: string, props?: AppStackProps) {
    super(stack, id, props);

    const { hostedZone } = props!;

    const vpcId = ssm.StringParameter.valueFromLookup(this, '/vpc/vpc/id/default');

    const vpc = ec2.Vpc.fromLookup(this, 'vpc', {
      vpcId,
    });

    const redisSecurityGroup = new ec2.SecurityGroup(
      this,
      `RedisSecGroup`,
      {
        vpc,
        description: 'Allows traffic to the cluster',
        allowAllOutbound: true, // Can be set to false
      },
    );

    redisSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(6379),
      'allows redis port access',
    );

    const subnetGroup = new elasticache.CfnSubnetGroup(
      this,
      `ExplorerSubnetGroup`,
      {
        description: `List of subnets used for redis cache`,
        subnetIds: vpc.privateSubnets.map(function(subnet) {
          return subnet.subnetId;
        }),
      },
    );

    const redis = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      cacheNodeType: 'cache.t2.micro',
      engine: 'redis',
      numCacheNodes: 1,
      autoMinorVersionUpgrade: true,
      cacheSubnetGroupName: subnetGroup.ref,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
    });

    redis.addDependsOn(subnetGroup);

    const privZone = route53.HostedZone.fromLookup(this, 'PrivateZone', {
      privateZone: true,
      domainName: hostedZone,
    });

    const cacheCname = new route53.CnameRecord(this, 'CacheCname', {
      zone: privZone,
      recordName: 'platform.cache',
      domainName: redis.attrRedisEndpointAddress
    });
  }
}
