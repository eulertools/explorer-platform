import {
  aws_lambda_event_sources,
  CfnOutput,
  Duration,
  RemovalPolicy,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as S3 from "aws-cdk-lib/aws-s3";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudFront from "aws-cdk-lib/aws-cloudfront";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as IAM from "aws-cdk-lib/aws-iam";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
} from "aws-cdk-lib/custom-resources";
import { CnameRecord } from "aws-cdk-lib/aws-route53";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Bucket } from "aws-cdk-lib/aws-s3";

export interface ConstructProps extends StackProps {
  hostedZone: string;
}

export class CommunicationAssetsConstruct extends Construct {
  public readonly cloudFrontDistribution: cloudFront.Distribution;
  public readonly assetsBucket: Bucket;
  constructor(stack: Construct, id: string, props?: ConstructProps) {
    super(stack, id);

    const { hostedZone } = props!;

    const bucket = new S3.Bucket(this, `AssetsBucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.assetsBucket = bucket;

    const privateZone = route53.HostedZone.fromLookup(this, `PrivateZone`, {
      privateZone: true,
      domainName: hostedZone,
    });

    const publicZone = route53.HostedZone.fromLookup(this, `PublicZone`, {
      privateZone: false,
      domainName: hostedZone,
    });

    const publicCertificate = new certificatemanager.Certificate(
      this,
      `PrivateZoneCertificate`,
      {
        domainName: `coms.assets.${publicZone.zoneName}`,
        validation:
          certificatemanager.CertificateValidation.fromDns(publicZone),
      }
    );

    const updateTemplateHandler = new lambda.Function(
      this,
      `SESTemplateUpdateHanlder`,
      {
        handler: "index.handler",
        description: "Create lambda function for updating SES templates.",
        code: lambda.Code.fromAsset(
          path.join(__dirname, `/../../src/update-ses-template-handler`)
        ),
        runtime: lambda.Runtime.NODEJS_14_X,
        timeout: Duration.seconds(30),
      }
    );

    const s3PutEventSource = new aws_lambda_event_sources.S3EventSource(
      bucket,
      {
        events: [S3.EventType.OBJECT_CREATED_PUT],
      }
    );

    updateTemplateHandler.addEventSource(s3PutEventSource);

    const cloudFrontOAI = new cloudFront.OriginAccessIdentity(this, `CFOAI`, {
      comment: `OAI for ${id} website.`,
    });

    const cloudFrontDistProps: cloudFront.DistributionProps = {
      defaultBehavior: { origin: new origins.S3Origin(bucket) },
      domainNames: [`coms.assets.${hostedZone}`],
      certificate: publicCertificate,
    };

    const cloudfrontDist = new cloudFront.Distribution(
      this,
      `CloudFront`,
      cloudFrontDistProps
    );

    this.cloudFrontDistribution = cloudfrontDist;

    const cloudfrontS3Access = new IAM.PolicyStatement();
    cloudfrontS3Access.addActions("s3:GetBucket*");
    cloudfrontS3Access.addActions("s3:GetObject*");
    cloudfrontS3Access.addActions("s3:List*");
    cloudfrontS3Access.addResources(bucket.bucketArn);
    cloudfrontS3Access.addResources(`${bucket.bucketArn}/*`);
    cloudfrontS3Access.addPrincipals(cloudFrontOAI.grantPrincipal);

    bucket.addToResourcePolicy(cloudfrontS3Access);

    new route53.ARecord(this, `CDNARecord`, {
      zone: privateZone,
      recordName: `coms.assets.${hostedZone}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(cloudfrontDist)
      ),
    });

    new route53.AaaaRecord(this, `AliasRecord`, {
      zone: privateZone,
      recordName: `coms.assets.${hostedZone}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(cloudfrontDist)
      ),
    });

    new route53.ARecord(this, `CDNPublicRecord`, {
      zone: publicZone,
      recordName: `coms.assets.${hostedZone}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(cloudfrontDist)
      ),
    });

    new route53.AaaaRecord(this, `PublicAliasRecord`, {
      zone: publicZone,
      recordName: `communication.assets.${hostedZone}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(cloudfrontDist)
      ),
    });

    const sesPolicy = new PolicyStatement({
      actions: [
        "ses:CreateConfigurationSet",
        "ses:DeleteConfigurationSet",
        "ses:CreateConfigurationSetEventDestination",
        "ses:DeleteConfigurationSetEventDestination",
        "ses:CreateEmailIdentity",
        "ses:DeleteEmailIdentity",
      ],
      resources: ["*"], // Global is required to Create. Delete could be restricted if required.
      effect: Effect.ALLOW,
    });

    const domainIdentity = new AwsCustomResource(this, `DomainIdentity`, {
      onUpdate: {
        service: "SESV2",
        action: "createEmailIdentity",
        parameters: {
          EmailIdentity: hostedZone,
        },
        physicalResourceId: {},
      },
      onDelete: {
        service: "SESV2",
        action: "deleteEmailIdentity",
        parameters: {
          EmailIdentity: hostedZone,
        },
      },
      policy: AwsCustomResourcePolicy.fromStatements([sesPolicy]),
      logRetention: 7,
    });
    // Assuming there are always 3 tokens returned as that is what all the docs indicate
    const dkimTokens = [
      domainIdentity.getResponseField("DkimAttributes.Tokens.0"),
      domainIdentity.getResponseField("DkimAttributes.Tokens.1"),
      domainIdentity.getResponseField("DkimAttributes.Tokens.2"),
    ];

    dkimTokens.forEach((token, i) => {
      const recordName = `${token}._domain.${hostedZone}`;
      if (hostedZone) {
        new CnameRecord(this, `token${i + 1}`, {
          domainName: `${token}.dkim.amazonses.com`,
          zone: publicZone,
          recordName,
          comment: "SES DKIM Verification",
        });
      }

      new CfnOutput(this, `outputToken${i + 1}`, {
        description: `DKIM CNAME Record ${i + 1}`,
        value: `${recordName} CNAME ${token}.dkim.amazonses.com`,
      });
    });

    new CfnOutput(this, `PrivateCFUrl`, {
      value: cloudfrontDist.distributionDomainName,
    });

    new CfnOutput(this, `AssetsOutput`, {
      description: "S3 Bucket for platform-communication-assets",
      value: bucket.bucketName,
      exportName: "platform-explorer-communication-assets",
    });
  }
}
