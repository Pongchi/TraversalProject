const MitmProxy = require('http-mitm-proxy');

const proxy = new MitmProxy.Proxy;

proxy.onError((ctx, err) => {
  console.error('Proxy Error:', err);
});

proxy.onRequest((ctx, callback) => {
  // 요청 데이터를 여기서 확인하거나 수정할 수 있습니다.
  console.log('Request:', ctx.clientToProxyRequest.method, ctx.clientToProxyRequest.url);
  return callback();
});

proxy.onResponse((ctx, callback) => {
  // 응답 데이터를 여기서 확인하거나 수정할 수 있습니다.
  console.log('Response:', ctx.serverToProxyResponse.rawHeaders);
  return callback();
});

module.exports = proxy;