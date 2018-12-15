
//todo: this should be injected to the library somehow...
const stageName = 'x';
const region = 'us-west-2';

const AWS = require('aws-sdk');
AWS.config.update({region: region});

const apiGateway = new AWS.APIGateway();
const p = require('util').promisify;
function promisify (methodName) {
  return p(apiGateway[methodName].bind(apiGateway));
}
const getResourcesSDK = promisify('getResources');
const createSDK = promisify('createRestApi');
const addMethodSDK = promisify('putMethod');
const getMethodSDK = promisify('getMethod');
const addIntegrationSDK = promisify('putIntegration');
const getIntegrationSDK = promisify('getIntegration');
const getApisSDK = promisify('getRestApis');
const createResourceSDK = promisify('createResource');
const createDeploymentSDK = promisify('createDeployment');
const createStageSDK = promisify('createStage');
const getStagesSDK = promisify('getStages');
const updateStageSDK = promisify('updateStage');

// puke
function getApiLambdaArn (functionArn) {
  return `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${functionArn}/invocations`;
}

function createApiIdempotent (name) {
  return getApisSDK()
    .then(apis => {
      const foundApi = apis.items
        .filter(api => api.name === name)[0];

      if (foundApi !== undefined) {
        return Promise.resolve(foundApi);
      }
      return createSDK({
        name: name
      });
    });
}

function getRootResourceId (apiId) {
  return getResourcesSDK({
    restApiId: apiId
  })
  .then(response => {
    const resources = response.items;
    return Promise.resolve(resources
      .filter(resource => resource.path === '/')
      .map(root => root.id)
      [0]);
  })
}

function createAnyMethodIdempotent (apiId, resourceId) {
  return getMethodSDK({
    httpMethod: 'ANY',
    resourceId: resourceId,
    restApiId: apiId
  })
  .catch(e => addMethodSDK({
      restApiId: apiId,
      resourceId: resourceId,
      httpMethod: "ANY",
      authorizationType: 'NONE'
  }));
}

// This seems to do a totally different thing than all the other APIs
// and actually overwrites whatever is already there so its idempotent
// out of the box!  Wow!  They lucked into good API design for once...
function addIntegrationIdempotent (apiId, resourceId, role, targetLambda) {
  return addIntegrationSDK({
    restApiId: apiId,
    resourceId: resourceId,
    httpMethod: "ANY",
    integrationHttpMethod: 'POST',
    credentials: role,
    type: 'AWS_PROXY',
    uri: getApiLambdaArn(targetLambda)
  });
}

function addResourceIdempotent (apiId, parentId, path) {
  return getResourcesSDK({
    restApiId: apiId
  })
  .then(response => {
    const resources = response.items;
    const existing = resources
      .filter(resource => resource.parentId === parentId
        && resource.pathPart === path)
      [0];

    if (existing !== undefined) {
      return Promise.resolve(existing.id);
    }
    return createResourceSDK({
        parentId: parentId,
        pathPart: path,
        restApiId: apiId
      })
      .then(resource => Promise.resolve(resource.id));
  });
}

function deploy (apiId) {
  return createDeploymentSDK({
    restApiId: apiId
  })
  .then(deployment => {
    const deploymentId = deployment.id;
    return getStagesSDK({
      restApiId: apiId
    }).then(stages => {
                //yes, its actually "item", even if its an array
      const existingStage = stages.item
        .filter(stage => stage.stageName === stageName)
        [0];
      return existingStage !== undefined
        ? updateStageSDK({
            restApiId: apiId,
            stageName: stageName,
            //what the fuck
            patchOperations: [
              {
                op: 'replace',
                value: deploymentId,
                path: '/deploymentId'
              }
            ]
          })
        : createStageSDK({
            restApiId: apiId,
            deploymentId: deploymentId,
            stageName: stageName
          });
    });
  });
}

function getDeploymentLocation (apiId) {
  return `https://${apiId}.execute-api.${region}.amazonaws.com/${stageName}`;
}

module.exports = function (name, role, targetLambda) {
  return createApiIdempotent(name)
    .then(api => {
      const apiId = api.id;
      return getRootResourceId(apiId)
        .then(rootId => {
          return createAnyMethodIdempotent(apiId, rootId)
            .then(() => addIntegrationIdempotent(apiId, rootId, role, targetLambda))
            .then(() => addResourceIdempotent(apiId, rootId, '{proxy+}'))
            .then(proxyResourceId => createAnyMethodIdempotent(apiId, proxyResourceId)
              .then(() => addIntegrationIdempotent(apiId, proxyResourceId, role, targetLambda)))
        })
        .then(() => deploy(apiId))
        .then(() => Promise.resolve(getDeploymentLocation(apiId)));
    });
}
