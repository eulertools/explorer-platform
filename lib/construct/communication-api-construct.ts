import { aws_route53_targets, Duration, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cert from "aws-cdk-lib/aws-certificatemanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Effect } from "aws-cdk-lib/aws-iam";
import {
  Cors,
  LambdaIntegration,
  LambdaRestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Bucket } from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";

export interface ConstructProps extends StackProps {
  assetsBucket: Bucket;
  certificateSsm: string;
  hostedZone: string;
}

export class CommunicationAPIConstruct extends Construct {
  constructor(stack: Construct, id: string, props?: ConstructProps) {
    super(stack, id);
    const { assetsBucket, certificateSsm, hostedZone } = props!;

    const certificateArn = ssm.StringParameter.fromStringParameterName(
      this,
      `CertificateArn`,
      certificateSsm
    ).stringValue;

    const certificate = cert.Certificate.fromCertificateArn(
      this,
      "ApiGatewayCertificate",
      certificateArn
    );

    const templateHandler = new lambda.Function(this, `SESTemplateHandler`, {
      handler: "index.handler",
      description: "Create lambda function for creating SES templates.",
      code: lambda.Code.fromAsset(
        path.join(__dirname, `/../../src/create-ses-template-handler`)
      ),
      runtime: lambda.Runtime.NODEJS_14_X,
      timeout: Duration.seconds(30),
      environment: {
        BUCKET_NAME: assetsBucket.bucketName,
      },
    });

    templateHandler.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    templateHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: ["ses:*", "s3:*"],
      })
    );

    const privateZone = route53.HostedZone.fromLookup(this, "PrivateZone", {
      privateZone: true,
      domainName: hostedZone,
    });

    const apiResourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["execute-api:Invoke"],
          principals: [new iam.AnyPrincipal()],
          resources: ["execute-api:/*"],
        }),
      ],
    });

    const restApi = new LambdaRestApi(this, `SESTemplateApi`, {
      handler: templateHandler,
      description:
        "Communications Hub API handles all messages sent to users, with their templates, methods and rules",
      restApiName: "communications-hub-api",
      deployOptions: {
        stageName: process.env.ENV,
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: Cors.ALL_ORIGINS,
      },
      proxy: false,
      policy: apiResourcePolicy,
    });

    restApi.addDomainName(`SESTemplateApiDomain`, {
      domainName: `coms.api.${hostedZone}`,
      certificate: certificate,
    });

    new route53.ARecord(this, `SESDomainRecord`, {
      recordName: "coms.api",
      zone: privateZone,
      target: route53.RecordTarget.fromAlias(
        new aws_route53_targets.ApiGateway(restApi)
      ),
    });

    const template = restApi.root;

    template.addMethod("PUT", new LambdaIntegration(templateHandler));
  }
}
