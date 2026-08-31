import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeBuildAction,
  EcrSourceAction,
  EcsDeployAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { IBaseService, ContainerDefinition } from 'aws-cdk-lib/aws-ecs';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import {
  BuildEnvironmentVariableType,
  BuildSpec,
  Cache,
  LinuxBuildImage,
  LocalCacheMode,
  PipelineProject,
} from 'aws-cdk-lib/aws-codebuild';
import { BuildSpecContent } from './buildspec-content';
import { Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface PipelineProps extends StackProps {
  service: IBaseService;
  repository: IRepository;
  nginxRepository: IRepository;
  container: ContainerDefinition;
  nginxContainer: ContainerDefinition;
}

export class EcrEcsPipeline extends Construct {
  constructor(stack: Construct, id: string, props?: PipelineProps) {
    super(stack, id);

    const { nginxContainer, service, repository, container, nginxRepository } = props!;

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    const ecrAction = new EcrSourceAction({
      actionName: 'observe-ecr-images',
      output: sourceOutput,
      repository: repository,
    });

    const codeBuildProject = new PipelineProject(stack, `CodeBuildProject`, {
      projectName: `${id}-build-project`,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      environmentVariables: {
        IMAGE_URI: {
          value: repository.repositoryUri,
          type: BuildEnvironmentVariableType.PLAINTEXT,
        },
        NGINX_URI: {
          value: nginxRepository.repositoryUri,
          type: BuildEnvironmentVariableType.PLAINTEXT,
        },
        NGINX_NAME: {
          value: nginxContainer.containerName,
          type: BuildEnvironmentVariableType.PLAINTEXT,
        },
        CONTAINER_NAME: {
          value: container.containerName,
          type: BuildEnvironmentVariableType.PLAINTEXT,
        },
        TAG: {
          value: 'latest',
          type: BuildEnvironmentVariableType.PLAINTEXT,
        },
      },
      buildSpec: BuildSpec.fromObject(BuildSpecContent),
      cache: Cache.local(LocalCacheMode.DOCKER_LAYER, LocalCacheMode.CUSTOM),
    });

    repository.grantPull(codeBuildProject);
    nginxRepository.grantPull(codeBuildProject);

    const buildAction = new CodeBuildAction({
      actionName: 'Build-Action',
      input: sourceOutput,
      project: codeBuildProject,
      outputs: [buildOutput],
    });

    const deployAction = new EcsDeployAction({
      actionName: `Deploy-Action-${id}`,
      service: service,
      input: buildOutput,
    });

    const bucketName = ssm.StringParameter.fromStringParameterName(this, 'BucketName', `SharedArtifactsBucket`).stringValue
    const artifactBucket = s3.Bucket.fromBucketName(this, 'ArtifactsBucket', bucketName)

    new codepipeline.Pipeline(
      this,
      `${id}`,
      {
        pipelineName: `${id}-pipeline`,
        stages: [
          {
            stageName: 'Source',
            actions: [ecrAction],
          },
          {
            stageName: 'Build',
            actions: [buildAction],
          },
          {
            stageName: 'Deploy',
            actions: [deployAction],
          },
        ],
        artifactBucket
      }
    );
  }
}
