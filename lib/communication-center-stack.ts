import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { CommunicationAPIConstruct } from "./construct/communication-api-construct";
import { CommunicationAssetsConstruct } from "./construct/communication-assets-construct";
import { CommunicationPipelineConstruct } from "./construct/communication-pipeline-construct";

interface AppStackProps extends StackProps {
  hostedZone: string;
  branchName: string;
  certificateSsm: string;
}

export class CommunicationsCenter extends Stack {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { hostedZone, branchName, certificateSsm } = props!;

    const { assetsBucket, cloudFrontDistribution } =
      new CommunicationAssetsConstruct(this, "CommunicationAssets", {
        hostedZone,
      });

    new CommunicationAPIConstruct(this, "CommunicationApi", {
      assetsBucket,
      certificateSsm,
      hostedZone,
    });
    /*
        new CommunicationPipelineConstruct(this, "CommunicationPipeline", {
          bucket: assetsBucket,
          cloudfrontDist: cloudFrontDistribution,
          branchName,
        });

        new CommunicationAPIConstruct(this, "NotificationApi", {
          assetsBucket: assetsBucket,
          certificateSsm,
          hostedZone,
        });
     */
  }
}
