import { App, Fn, Stack, StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { ListenerAction } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { MicroServiceConstruct } from './construct/microservice-construct';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
export interface AppStackProps extends StackProps {
  hostedZone: string;
  gtmContainerID: string;
  branch: string;
}

export class AppServiceStack extends Stack {
  constructor(stack: App, id: string, props?: AppStackProps) {
    super(stack, id, props);

    const { hostedZone, gtmContainerID, branch } = props!;

    const vpcId = ssm.StringParameter.valueFromLookup(this, '/vpc/vpc/id/default');

    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId,
    });

    const userPoolId = ssm.StringParameter.valueForStringParameter(this, '/directory/cognito/warden');

    const userPoolClientId = ssm.StringParameter.valueForStringParameter(this, '/directory/cognito/poolClientId');

    //create a security group for the load balancer service to accept all https traffic
    const albSecGroup = new ec2.SecurityGroup(this, 'lbSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Allow all HTTPS traffic',
    });

    //add rules for the security group
    albSecGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow all HTTPS traffic');

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      securityGroup: albSecGroup,
    });

    const privZone = route53.HostedZone.fromLookup(this, 'PrivateZone', {
      privateZone: true,
      domainName: hostedZone,
    });

    const publicZone = route53.HostedZone.fromLookup(this, 'Publiczone', {
      privateZone: false,
      domainName: hostedZone,
    });

    const certificate = new certificatemanager.Certificate(this, 'Certificate', {
      domainName: `app.${hostedZone}`,
      subjectAlternativeNames: [`explorer.${hostedZone}`],
      validation: certificatemanager.CertificateValidation.fromDns(publicZone),
    });

    loadBalancer.addRedirect();

    const listener = loadBalancer.addListener('Listener', {
      port: 443,
      defaultAction: ListenerAction.fixedResponse(200, {
        contentType: 'application/json',
        messageBody: 'OK',
      }),
      certificates: [certificate],
    });

    new route53.ARecord(this, 'PublicRecord', {
      zone: privZone,
      recordName: 'explorer',
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(loadBalancer),
      ),
    });

    new route53.ARecord(this, 'PrivateRecord', {
      zone: publicZone,
      recordName: 'explorer',
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(loadBalancer),
      ),
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(
      this,
      'sentryDSN',
      'sentryDSN',
    );

    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'Platform-Explorer-Status',
    });

    /*
    const tableSettingsArn = ssm.StringParameter.fromStringParameterName(
      this,
      "SSMOutput",
      "/directory/table/settings-table-arn"
    );

    const settingsTable = dynamodb.Table.fromTableArn(this,'SettingsTable', tableSettingsArn.stringValue);
    */

    const osDomain = opensearch.Domain.fromDomainEndpoint(this, 'CatalogDomain', `https://catalog.${hostedZone}`);

    new MicroServiceConstruct(this, 'Service', {
      cluster,
      listener,
      dashboard,
      sentryDSN,
      osDomain,
      serviceRepositoryName: ssm.StringParameter.valueFromLookup(this, '/repositories/explorer-backend'),
      nginxRepositoryName: ssm.StringParameter.valueFromLookup(this, '/repositories/explorer-backend-nginx'),
      serviceName: 'bsc-backend-explorer',
      path: 'bsc',
      vpc,
      containerDefinition: {
        REDIS_ZONE: process.env.CDK_DEFAULT_REGION,
        DOMAIN: hostedZone,
        DSN_URL: sentryDSN.secretValue.toString(),
        REDIS_ENDPOINT: `platform.cache.${hostedZone}`,
        POOLS_NODE: `https://bsc-dataseed.binance.org/`,
        AWS_COGNITO_IDENTITY_POOL_ID: userPoolId,
        AWS_USER_POOLS_WEB_CLIENT_ID: userPoolClientId,
        GTM_CONTAINER_ID: gtmContainerID,
        OHLC_SERVICE: `https://catalog.${hostedZone}/ohlc`,
        DEBUG:
          '*,-express:*,-body-parser:*,-sqs-consumer,-compression,-@feathersjs/express*,-send,-winston:create-logger*,-axm:*,-follow-redirects,-require-in-the-middle,-engine:*,-@feathersjs/transport-commons*,-socket.io*,-@feathersjs/configuration',
        AWS_REGION: this.region,
        CHAIN_ID: 'bsc',
        ES_INDEX: 'catalog_v1',
        NEW_INDEX: "catalog_v1",
        ES_DOMAIN: 'https://vpc-catalog-77fdxa6pyekujx2cbvu6xuob5e.us-east-1.es.amazonaws.com',
        NEW_ELASTICSEARCH: `https://readonly:Euler123$@${osDomain.domainEndpoint}`,
        ES_USER: 'master',
        ES_PASS: 'Pass123#',
        NODE_ENV: 'development',
        POSTGRES_PASSWORD: 'english-fruition-amber-describe',
        //DB_HOST: `binance-smart-chain.cluster-ro-c6b5prkppfuw.${this.region}.rds.amazonaws.com`,
        REDIS_PORT: '6379',
        PORT: '3000',
        DDB_USER_ENTITIES: 'user-entities',
        DDB_USER_PROFILES: 'user-profiles',
        DDB_USER_NOTIFICATIONS: 'user-notifications"',
        DDB_USER_VOTES: 'user-votes',
        DDB_USER_SUBSCRIPTIONS: 'user-subscriptions',
        DDB_SUBSCRIPTION_SETTINGS: 'subscriptions-settings',
      },
      priority: 10,
    });

    new MicroServiceConstruct(this, 'OHLC', {
      cluster,
      listener,
      dashboard,
      sentryDSN,
      osDomain,
      serviceRepositoryName: ssm.StringParameter.valueFromLookup(this, '/repositories/ohlc-backend'),
      nginxRepositoryName: ssm.StringParameter.valueFromLookup(this, '/repositories/ohlc-backend-nginx'),
      serviceName: 'ohcl-backend',
      path: 'ohlc',
      vpc,
      containerDefinition: {
        DOMAIN: hostedZone,
        DSN_URL: sentryDSN.secretValue.toString(),
        REDIS_URL: `redis://platform.cache.${hostedZone}`,
        GTM_CONTAINER_ID: gtmContainerID,
        DEBUG: '*,-express:*,-body-parser:*,-sqs-consumer,-compression,-@feathersjs/express*,-send,-winston:create-logger*,-axm:*,-follow-redirects,-require-in-the-middle,-engine:*,-@feathersjs/transport-commons*,-socket.io*,-@feathersjs/configuration',
        AWS_REGION: this.region,
        NODE_ENV: 'development',
        WORKER_PORT: "5000",
        HTTP_PORT: "3000",
        API_KEY: "1ZLVqCHzFB4VeCed0cj2cUo1O8EodYGhQtL2l9Gp4aKxq7ej8p2UihrePLKmTKBp",
        APISECRET: "EOHrwKlgtmYIz6Wz5ssSwmuydmiQnQXe5QToj5Z5iTUiSkvCSk1Rq8Jy3MURH3u9",
      },
      priority: 30,
    });
  }
}
