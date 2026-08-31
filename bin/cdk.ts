#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AppServiceStack } from "../lib/app-service-stack";
import { PlatformDataStorageStack } from "../lib/platform-data-storage-stack";
import { ClientsAppStack } from "../lib/amplify-app-stack";
import { OpenSearchCatalogsStack } from "../lib/opensearch-catalogs-stack";
import { DynamoDBStorageStack } from "../lib/app-dynamodb-storage.stack";
import { CoinGeckoStack } from "../lib/coingecko-stack";
import { CoinMarketCapStack } from "../lib/coinmarketcap-stack";
import { CatalogStorageStack } from "../lib/app-catalog-storage.stack";
import { AppAssetsStack } from "../lib/app-assets-stack";
import { AppBridgeStack } from "../lib/app-bridge-stack";
import { AppSettingsStack } from "../lib/app-settings-stack";
import { CommunicationSharedResources } from "../lib/communication-shared-stack";
import { CommunicationsCenter } from "../lib/communication-center-stack";

const app = new cdk.App();

const hostedZone =
  process.env.CDK_DEFAULT_ACCOUNT == process.env.CDK_DEV_ACCOUNT
    ? "dev.euler.tools"
    : "prod.euler.tools";
const gtmContainerID =
  process.env.CDK_DEFAULT_ACCOUNT == process.env.CDK_DEV_ACCOUNT
    ? "GTM-W82TBN9"
    : "GTM-P58NGC3";
const branch =
  process.env.CDK_DEFAULT_ACCOUNT == process.env.CDK_DEV_ACCOUNT ? "development" : "main";

const clientDomain =
  process.env.CDK_DEFAULT_ACCOUNT == process.env.CDK_DEV_ACCOUNT
    ? "app.dev.euler.tools"
    : "app.euler.tools";

const environment =
  process.env.CDK_DEFAULT_ACCOUNT == process.env.CDK_DEV_ACCOUNT ? "dev" : "prod";

new ClientsAppStack(app, "ExplorerClient", {
  githubRepo: "euler-explorer",
  branchName: branch,
  clientDomain,
  hostedZone,
  description: "Setups React Client for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1',
  },
});

new PlatformDataStorageStack(app, "ExplorerDataStorage", {
  hostedZone: hostedZone,
  description: "Setups data storages for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1',
  },
});

new AppServiceStack(app, "ExplorerPlatform", {
  hostedZone: hostedZone,
  gtmContainerID: gtmContainerID,
  branch,
  description: "Setups ECS Stack and pipelines for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1',
  },
});

/*
new OpenSearchCatalogsStack(app, "ExplorerCatalog", {
  hostedZone: hostedZone,
  description: "Setups OpenSearch Catalogs for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new DynamoDBStorageStack(app, "entities-catalog-stack", {
  hostedZone: hostedZone,
  description: "Setups Entities Catalog Stack for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new CatalogStorageStack(app, "blockchain-catalog-stack", {
  hostedZone: hostedZone,
  description: "Setups Blockchain Data Catalog for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new CoinGeckoStack(app, "CoinGeckoStack", {
  environment: environment,
  description: "Data Collectors for the CoinGecko API",
  tags: { network: "coingecko", ussage: "data-collector-worker" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new CoinMarketCapStack(app, "CoinMarketCapStack", {
  environment: environment,
  description: "Data Collectors for the CoinMarketCap API",
  tags: { network: "coinmarketcap", ussage: "data-collector-worker" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new AppAssetsStack(app, "AppAssetsStack", {
  description: "Data collectors for user assets",
  tags: { network: "assets", ussage: "data-collector-worker" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new AppBridgeStack(app, "AppBridgeStack", {
  description: "Setups application Bridge Stack for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new AppSettingsStack(app, "AppSettingsStack", {
  description: "Setups AppSettings Stack for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const { certificateSsm } = new CommunicationSharedResources(
  app,
  "CommunicationEulerPlatformShared",
  {
    hostedZone,
    description: "Setups Shared Certificates for the Euler Explorer Platform",
    tags: { usage: "platform-explorer" },
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  }
);

new CommunicationsCenter(app, "CommunicationsEulerPlatform", {
  branchName: branch,
  hostedZone,
  certificateSsm,
  description: "Setups Communications Center for the Euler Explorer Platform",
  tags: { usage: "platform-explorer" },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

 */
