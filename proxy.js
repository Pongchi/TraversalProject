// proxy.js
const http = require('http');

function startProxyServer() {
  const server = http.createServer((clientReq, clientRes) => {
    console.log(clientReq, clientRes)
    // 요청 헤더에서 목적지 호스트를 가져옵니다.
    const targetHost = clientReq.headers.host;
    if (!targetHost) {
      clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
      clientRes.end('Host header is missing.');
      return;
    }
    
    const options = {
      hostname: targetHost,
      port: 80, // HTTP 기본 포트
      path: clientReq.url,
      method: clientReq.method,
      headers: clientReq.headers,
    };
    
    // 실제 서버에 요청을 보냅니다.
    const proxyReq = http.request(options, (proxyRes) => {
      // 서버 응답을 그대로 클라이언트에 전달합니다.
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    });
    
    // 클라이언트의 요청 본문도 전달합니다.
    clientReq.pipe(proxyReq);
    
    // 에러 처리
    proxyReq.on('error', (e) => {
      console.error(`프록시 요청 중 오류 발생: ${e.message}`);
      clientRes.writeHead(500);
      clientRes.end('Proxy Error');
    });
  });

  return server;
}

// 이 함수를 외부에서 사용할 수 있도록 내보냅니다.
module.exports = {
  startProxyServer
};