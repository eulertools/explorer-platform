import { SecretValue, Stack, StackProps, Fn } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as amplify from "@aws-cdk/aws-amplify-alpha";
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { BuildSpec } from "aws-cdk-lib/aws-codebuild";
import { RedirectStatus } from "@aws-cdk/aws-amplify-alpha";

require("dotenv").config();

interface AppStackProps extends StackProps {
  githubRepo: string;
  branchName: string;
  hostedZone: string;
  clientDomain: string;
}

export class ClientsAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { branchName, githubRepo, hostedZone, clientDomain } = props!;

    const userPoolId = ssm.StringParameter.valueForStringParameter(this, '/directory/cognito/warden');

    const userPoolClientId = ssm.StringParameter.valueForStringParameter(this, '/directory/cognito/poolClientId');

    const amplifyApp = new amplify.App(this, "Explorer", {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: "eulertools",
        repository: githubRepo,
        oauthToken: SecretValue.secretsManager("githubToken"),
      }),
      environmentVariables: {
        NODE_OPTIONS: process.env.NODE_OPTIONS || "--max_old_space_size=7168",
        HTTPS: "true",
        REACT_APP_API_URL: `https://explorer.${hostedZone}`,
        REACT_APP_SENTRY_ENV: "development",
        REACT_APP_ASSETS_URL: `https://assets.${hostedZone}`,
        REACT_APP_TABLES_API: `https://explorer.${hostedZone}/charts`,
        REACT_APP_AWS_USER_POOLS_ID: userPoolId,
        REACT_APP_AWS_USER_POOLS_WEB_CLIENT_ID: userPoolClientId,
        REACT_APP_ENABLE_REDUX_DEV_TOOLS: "true",
      },
      customRules: [
        {
          source: "/static/charting_library/en-tv-chart.132c7060.html",
          target: "/static/charting_library/en-tv-chart.132c7060.html",
          status: RedirectStatus.REWRITE,
        },
        {
          source: "/<*>",
          target: "/index.html",
          status: RedirectStatus.NOT_FOUND_REWRITE,
        },
        { //use \` to prevent character escaping in the backslash
          source: `</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|ttf|map|json)$)([^.]+$)/>`,
          target: "/index.html",
          status: RedirectStatus.REWRITE,
        },
      ],
      buildSpec: BuildSpec.fromObject({
        version: "1.0",
        frontend: {
          phases: {
            build: {
              commands: [
                "nvm use $VERSION_NODE_16",
                "echo \"//registry.npmjs.org/:_authToken=$NPM_TOKEN\" > .npmrc",
                "npm i --legacy-peer-deps",
                "npm run build"
              ],
            },
          },
          artifacts: {
            baseDirectory: "build",
            files: ["**/*"],
          },
          cache: {
            paths: "node_modules/**/*",
          },
        },
      }),
    });

    const branch = amplifyApp.addBranch(branchName, {autoBuild: true});

    const domain = amplifyApp.addDomain("Domain", {
      domainName: clientDomain,
    });

    domain.mapRoot(branch);
  }
}
