import {
  App,
  aws_certificatemanager as cert,
  aws_opensearchservice as opensearch,
  aws_route53 as route53,
  CfnResource,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import {
  AnyPrincipal,
  Effect,
  ManagedPolicy,
  PolicyStatement,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { RoleMapping } from 'cdk-aws-opensearch-api';

export interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class OpenSearchCatalogsStack extends Stack {
  constructor(scope: App, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { hostedZone } = props!;

    new CfnResource(this, 'ServiceLinkedRole', {
      type: 'AWS::IAM::ServiceLinkedRole',
      properties: {
        AWSServiceName: 'es.amazonaws.com',
        Description: 'Role for ES to access resources in my VPC',
      },
    });

    const certificate = cert.Certificate.fromCertificateArn(
      this,
      'CertificateImported',
      ssm.StringParameter.valueForStringParameter(
        this,
        '/directory/cognito/public-certificate',
      ),
    );

    const hostedZoneId = route53.HostedZone.fromLookup(this, 'HostedZone', {
      privateZone: false,
      domainName: hostedZone,
    });

    const hostedPrivZoneId = route53.HostedZone.fromLookup(this, 'PrivateHostedZone', {
      privateZone: true,
      domainName: hostedZone,
    });

    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      'UserPoolId',
      ssm.StringParameter.valueForStringParameter(
        this,
        '/directory/cognito/user-pool',
      ),
    );

    const userPoolClient = cognito.UserPoolClient.fromUserPoolClientId(
      this,
      'CognitoClientId',
      ssm.StringParameter.valueForStringParameter(
        this,
        '/directory/cognito/user-pool-client-id',
      ),
    );

    const userPoolClientApi = cognito.UserPoolClient.fromUserPoolClientId(
      this,
      'CognitoClientIdApi',
      ssm.StringParameter.valueForStringParameter(
        this,
        '/directory/cognito/user-pool-api-client-id',
      ),
    );

    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: 'cognito-identity-pool',
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: `cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
        },
        {
          clientId: userPoolClientApi.userPoolClientId,
          providerName: `cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
        },
      ],
    });

    const apiCreds = secretsmanager.Secret.fromSecretNameV2(
      this,
      'opensearchMasterUser',
      'opensearchMasterUser',
    );

    const OSUser = apiCreds.secretValueFromJson('username').toString();
    const OSPassword = apiCreds.secretValueFromJson('password');

    const isAnonymousCognitoGroupRole = new iam.Role(
      this,
      'anonymous-group-role',
      {
        description: 'Default role for anonymous users',
        assumedBy: new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'unauthenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole',
          ),
        ],
      },
    );

    const isUserCognitoGroupRole = new iam.Role(
      this,
      'users-group-role',
      {
        description: 'Default role for authenticated users',
        assumedBy: new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'authenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole',
          ),
        ],
      });

    const isAdministratorGroupRole = new iam.Role(
      this,
      'administrators-group-role',
      {
        description: 'Default role for administrator users',
        assumedBy: new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'authenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole',
          ),
        ],
      });

    const adminGroup = new cognito.CfnUserPoolGroup(this, 'administrators-group', {
      userPoolId: userPool.userPoolId,
      // the properties below are optional
      description: 'Administrators only group',
      precedence: 1,
      roleArn: isAdministratorGroupRole.roleArn,
    });

    new cognito.CfnIdentityPoolRoleAttachment(
      this,
      'identity-pool-role-attachment',
      {
        identityPoolId: identityPool.ref,
        roles: {
          authenticated: isUserCognitoGroupRole.roleArn,
          unauthenticated: isAnonymousCognitoGroupRole.roleArn,
        },
        roleMappings: {
          mapping: {
            type: 'Token',
            ambiguousRoleResolution: 'Deny',
            identityProvider: `cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}:${userPoolClient.userPoolClientId}`,
          },
          userPool: {
            type: 'Token',
            ambiguousRoleResolution: 'Deny',
            identityProvider: `cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}:${userPoolClientApi.userPoolClientId}`,
          },
        },
      },
    );

    const opensearchHttpPolicy = new ManagedPolicy(
      this,
      'opensearchHttpPolicy',
      {
        roles: [isAnonymousCognitoGroupRole, isUserCognitoGroupRole],
      },
    );

    opensearchHttpPolicy.addStatements(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: [
          `arn:aws:es:${this.region}:${this.account}:domain/catalogs.${hostedZone}/*`,
        ],
        actions: ['es:*'],
      }),
    );

    const role = new iam.Role(this, 'cognito-os-role', {
      assumedBy: new ServicePrincipal('opensearchservice.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonOpenSearchServiceCognitoAccess',
        ),
      ],
    });

    const osdomain = new opensearch.Domain(this, 'OSDomain', {
      version: opensearch.EngineVersion.OPENSEARCH_1_3,
      cognitoDashboardsAuth: {
        identityPoolId: identityPool.ref,
        role: role,
        userPoolId: userPool.userPoolId,
      },
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: {
        enabled: true,
      },
      accessPolicies : [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['es:*'],
          principals: [
            new AnyPrincipal()
          ]
        })
      ],
      fineGrainedAccessControl: {
        masterUserPassword: OSPassword,
        masterUserName: OSUser,
      },
      capacity: {
        masterNodeInstanceType: 't3.medium.search',
        dataNodeInstanceType: 't3.medium.search',
        dataNodes: 1,
      },
      ebs: {
        volumeSize: 20,
      },
      logging: {
        slowSearchLogEnabled: true,
        appLogEnabled: true,
        slowIndexLogEnabled: true,
      },
      customEndpoint: {
        domainName: `catalogs.${hostedZone}`,
        certificate: certificate,
        hostedZone: hostedZoneId,
      },
    });

    new RoleMapping(this, 'read-only-mapping', {
      domain: osdomain,
      roleName: 'opensearch_dashboards_read_only',
      masterUserPasswordSecret: apiCreds,

      // this definition is what you'd PUT to the OpenSearch API:
      // https://opensearch.org/docs/latest/security-plugin/access-control/api/#create-role-mapping
      roleMappingDefinition: {
        backend_roles: [isUserCognitoGroupRole.roleArn],
        hosts: ['*'],
        users: [],
      },
    });

    new RoleMapping(this, 'all-access-role-mapping', {
      domain: osdomain,
      roleName: 'all_access',
      masterUserPasswordSecret: apiCreds,

      // this definition is what you'd PUT to the OpenSearch API:
      // https://opensearch.org/docs/latest/security-plugin/access-control/api/#create-role-mapping
      roleMappingDefinition: {
        backend_roles: [isAdministratorGroupRole.roleArn],
        hosts: ['*'],
        users: ['admin'],
      },
    });

    new RoleMapping(this, 'security-manager-role-mapping', {
      domain: osdomain,
      roleName: 'security_manager',
      masterUserPasswordSecret: apiCreds,

      // this definition is what you'd PUT to the OpenSearch API:
      // https://opensearch.org/docs/latest/security-plugin/access-control/api/#create-role-mapping
      roleMappingDefinition: {
        backend_roles: [isAdministratorGroupRole.roleArn],
        hosts: ['*'],
        users: ['admin'],
      },
    });

    new ssm.StringParameter(this, `ssm-explorer-osdomain-output`, {
      stringValue: osdomain.domainEndpoint,
      parameterName: `/explorer/opensearch/domain`,
    });

    const osdomaincname = new route53.CnameRecord(this, 'osdomain-cname', {
      zone: hostedPrivZoneId,
      recordName: `catalogs`,
      domainName: osdomain.domainEndpoint
    });
  }
}
