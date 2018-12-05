const fs = require('fs');
const path = require('path');
const promisify = require('util').promisify;
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const exec = promisify(require('child_process').exec);
const rimraf = (dirName) => exec(`rm -rf ${dirName}`);

function getWorkDir (serviceName) {
  return path.resolve(__dirname, 'work/', serviceName);
}
function getTargetFile (work) {
  return path.resolve(work, 'httpProxy.js');
}
const baseRouter = path.resolve(__dirname, 'baseHttpRouter.js');
const traverser = path.resolve(__dirname, 'traverser.js');

module.exports = function (tree, serviceName) {
  return createhttpRouter(tree, serviceName)
}

function createhttpRouter (tree, serviceName) {
  const work = getWorkDir(serviceName)
  const target = getTargetFile(work);
  return tree === undefined
    ? Promise.resolve()
    : rimraf(work)
      .then(() => mkdir(work))
      .then(() => Promise.all([
          Promise.resolve(Buffer.from(`const tree = ${JSON.stringify(tree)}
`)),
          readFile(traverser),
          readFile(baseRouter)
        ])
        .then(threeBuffers => Promise.resolve(Buffer.concat(threeBuffers))))
      .then(combinedBuffers => writeFile(target, combinedBuffers))
      .then(() => Promise.resolve(target));
}
