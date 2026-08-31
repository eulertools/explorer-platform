import { Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { ApplicationTargetGroup, IApplicationListener, TargetType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from "constructs";
import { Dashboard } from "aws-cdk-lib/aws-cloudwatch";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { EcrEcsPipeline } from "./ecr-ecs-pipeline/ecr-ecs-pipeline-construct";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as iam from 'aws-cdk-lib/aws-iam';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ICluster } from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface ConstructProps extends StackProps {
  cluster: ICluster;
  listener: IApplicationListener;
  dashboard: Dashboard;
  sentryDSN: ISecret;
  serviceRepositoryName: string;
  nginxRepositoryName: string;
  serviceName: string;
  path: string;
  vpc: IVpc;
  containerDefinition: any;
  priority: number;
  osDomain: opensearch.IDomain;
  command?: string[];
}

export class MicroServiceConstruct extends Construct {
  constructor(stack: Stack, id: string, props?: ConstructProps) {
    super(stack, id);

    const {
      cluster,
      nginxRepositoryName,
      serviceRepositoryName,
      listener,
      dashboard,
      serviceName,
      path,
      vpc,
      containerDefinition,
      priority,
      osDomain,
      command
    } = props!;

    const ecsSG = new ec2.SecurityGroup(this, `SecurityGroup`, {
      vpc,
      description: "Allows traffic to the node ports of the nginx container",
      allowAllOutbound: true, // Can be set to false
    });

    ecsSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "allow http/https access from the load balancer"
    );

    ecsSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      "Service Port"
    );

    const repository = ecr.Repository.fromRepositoryName(
      this,
      `Service${serviceName}`,
      serviceRepositoryName
    );

    const nginxRepository = ecr.Repository.fromRepositoryName(
      this,
      `Nginx${serviceName}`,
      nginxRepositoryName
    );

    const executionRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `task-role-${serviceName}`,
      description: 'Role that the task definitions for data-gateway backend',
    });

    executionRole.attachInlinePolicy(
      new iam.Policy(this, `TaskPolicy`, {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['logs:*', 'ecr:*', 'iam:*', 'dynamodb:*', 'cloudwatch:*', 'ecs:*'],
            resources: ['*'],
          }),
        ],
      }),
    );

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ExplorerTask', {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: executionRole,
    });

    const container = taskDefinition.addContainer(
      `BackendService${serviceName}`,
      {
        command,
        containerName: `${serviceName}`,
        image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
        logging: ecs.LogDriver.awsLogs({ streamPrefix: 'logsClient' }),
        portMappings: [{ containerPort: 3000, hostPort: 3000, protocol: ecs.Protocol.TCP }],
        environment: containerDefinition,
      }
    );

    const nginxContainer = taskDefinition.addContainer(
      `NginxService${serviceName}`,
      {
        containerName: `nginx-${serviceName}`,
        environment: {CONTAINER_PATH: path},
        image: ecs.ContainerImage.fromEcrRepository(nginxRepository, 'latest'),
        logging: ecs.LogDriver.awsLogs({ streamPrefix: 'logsClient' }),
        portMappings: [{ containerPort: 80, hostPort: 80, protocol: ecs.Protocol.TCP }],
      }
    );

    const service = new ecs.FargateService(this, "NginxService", {
      cluster,
      desiredCount: 1,
      taskDefinition,
      securityGroups: [ecsSG],
      assignPublicIp: true,
    });

    osDomain.grantRead(executionRole)

    const targetGroup = new ApplicationTargetGroup(this, `TargetGroup`, {
      port: 80,
      targets: [
        service.loadBalancerTarget({
          containerName: nginxContainer.containerName,
          containerPort: 80,
        }),
      ],
      vpc,
      targetType: TargetType.IP,
    })

    listener.addTargetGroups(`${serviceName}ListenerTargetGroup`, {
      priority,
      targetGroups: [targetGroup],
      conditions: [elbv2.ListenerCondition.pathPatterns([`/${path}/*`])],
    })

    const targetGroupRequestCount = targetGroup.metricRequestCount({
      period: Duration.minutes(1),
      label: "Request Count",
    })

    const targetGroupRequestsTarget = targetGroup.metricRequestCountPerTarget({
      period: Duration.minutes(1),
      label: "Request Count Per Target",
    })

    const cpuUtilizationMetric = service.metricCpuUtilization({
      period: Duration.minutes(1),
      label: "CPU Utilization",
    });

    const memoryUtilizationMetric = service.metricMemoryUtilization({
      period: Duration.minutes(1),
      label: "Memory Utilization",
    });

    const requestsWidget =  new cloudwatch.GraphWidget({
      left: [targetGroupRequestCount],
      right: [targetGroupRequestsTarget],
      width: 12,
      title: `${serviceName}`,
    })

    const metricsWidget = new cloudwatch.GraphWidget({
      left: [memoryUtilizationMetric],
      right: [cpuUtilizationMetric],
      width: 12,
      title: `${serviceName}`,
    })

    dashboard.addWidgets(metricsWidget, requestsWidget);

    const scaling = service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 20,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60)
    });

    scaling.scaleOnRequestCount('RequestCountScaling', {
      targetGroup: targetGroup,
      requestsPerTarget: 10000
    });

    new EcrEcsPipeline(this, `${serviceName}CodePipeline`, {
      service: service,
      repository: repository,
      nginxRepository: nginxRepository,
      nginxContainer: nginxContainer,
      container: container,
    });
  }
}
