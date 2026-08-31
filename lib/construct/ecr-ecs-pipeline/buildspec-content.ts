export const BuildSpecContent = {
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': {
        nodejs: '14',
      },
      commands: [],
    },
    pre_build: {
      commands: ['echo Pre Build Running'],
    },
    build: {
      commands: ['echo Build started'],
    },
    post_build: {
      commands: [
        'echo Build completed',
        'printf \'{"ImageURI": "%s"}\' $IMAGE_URI:$TAG > taskdef.json',
        'cat taskdef.json',
        `printf \'[{"name":"%s","imageUri": "%s"}, {"name":"%s","imageUri": "%s"}]\' $CONTAINER_NAME $IMAGE_URI:$TAG $NGINX_NAME $NGINX_URI:$TAG > $CODEBUILD_SRC_DIR/imagedefinitions.json`,
        'cat $CODEBUILD_SRC_DIR/imagedefinitions.json',
      ],
    },
  },
  artifacts: {
    files: [
      'imageDetail.json',
      'imagedefinitions.json',
      'appspec.yaml',
      'taskdef.json',
    ],
  },
};
