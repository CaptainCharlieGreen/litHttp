const http = require('http');
const path = require('path');
const port = 3000;

module.exports = function (events, implementation) {
  const proxy = require(path.resolve(implementation, 'lit_generated_host_entry')).handler;
  function listener (request, response) {
    proxy({
      path: request.url.replace(`/${events.service}`, ''),
      httpMethod: request.method
    }, null, function (err, result) {
      format(result, response);
    });
  }

  return new Promise(function(resolve, reject) {
    http.createServer(listener).listen(port, e => {
      if (e) {
        reject(e);
      }
      //never resolve
      console.log(`http source listening on http://localhost:${port}`);
    })
  });
}

function format (result, res) {
  var data = result.data;
  if (data.statusCode === undefined) {
    console.log(result);
    //wierd shit
    data = {
      statusCode: 500,
      headers: {},
      body: data
    }
  }
  res.writeHead(data.statusCode, data.headers);
  if (data.body) {
    res.write((typeof data.body === 'string'
      ? data.body
      : JSON.stringify(data.body)));
  }
  res.end();
}
