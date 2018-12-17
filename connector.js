const apiGateway = require('./apiGateway/apiBuilder');

module.exports = (sdkInfo, eventInfo, implementation) => {
  return apiGateway(sdkInfo.region, sdkInfo.sdk, eventInfo, implementation);
}