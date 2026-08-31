import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as crossparam from "@henrist/cdk-cross-region-params";

interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class CommunicationSharedResources extends Stack {
  public readonly certificateSsm: string;

  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { hostedZone } = props!;

    const privateZone = route53.HostedZone.fromLookup(this, "PrivateZone", {
      privateZone: true,
      domainName: hostedZone,
    });

    const certificate = new certificatemanager.Certificate(
      this,
      "CommunicationCertificate",
      {
        domainName: hostedZone,
        subjectAlternativeNames: [`*.${hostedZone}`, `*.api.${hostedZone}`],
        validation:
          certificatemanager.CertificateValidation.fromDns(privateZone),
      }
    );

    new crossparam.CrossRegionParameter(this, "UsCert", {
      region: "us-east-1",
      name: "/certificates/communication",
      value: certificate.certificateArn,
    });

    new crossparam.CrossRegionParameter(this, "EuCert", {
      region: "eu-west-1",
      name: "/certificates/communication",
      value: certificate.certificateArn,
    });

    this.certificateSsm = "/certificates/communication";
  }
}
