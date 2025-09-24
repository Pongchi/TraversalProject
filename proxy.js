// test site : http://222.84.61.57:8080/NTRdrBookRetr.do
const http = require('http');
const httpProxy = require('http-proxy');
const tls = require('tls');
const fs = require('fs');
const forge = require('node-forge');
const { URL } = require('url');

const PROXY_PORT = 8080;
const caCertPem = fs.readFileSync('trvsl.crt', 'utf8');
const caKeyPem = fs.readFileSync('trvsl.key', 'utf8');
const caCert = forge.pki.certificateFromPem(caCertPem);
const caKey = forge.pki.privateKeyFromPem(caKeyPem);

const proxy = httpProxy.createProxyServer({});
const server = http.createServer((req, res) => {
  console.log('========== 새 HTTP 요청 ==========');
  console.log(`[요청 라인] ${req.method} ${req.url}`);
  console.log('[요청 헤더]');
  console.log(JSON.stringify(req.headers, null, 2));
  const bodyChunks = [];
  req.on('data', (chunk) => {
    bodyChunks.push(chunk);
  }).on('end', () => {
    const body = Buffer.concat(bodyChunks).toString();
    if (body) {
      console.log('[요청 본문 (Body)]');
      console.log(body);
    }
    console.log('==============================\n');
  });

  const target = `${req.headers.host}`;
  proxy.web(req, res, { target: `http://${target}` }, (err) => {
    console.error('프록시 에러:', err);
    res.writeHead(502);
    res.end('Bad Gateway');
  });
});

// HTTPS Handler
// --- HTTPS CONNECT 요청을 가로채 처리하는 메인 로직 ---
server.on('connect', (req, clientSocket, head) => {
    // 에러 핸들러는 항상 중요합니다.
    clientSocket.on('error', (err) => {
        console.error('Client Socket Error:', err);
    });

    const { port, hostname } = new URL(`http://${req.url}`);

    // 1. 요청된 호스트 이름(hostname)으로 동적 인증서 실시간 생성
    const serverCertData = createServerCertificate(hostname);

    // 2. 클라이언트와 통신할 가짜 TLS 서버(Interceptor) 생성
    const tlsServer = new tls.Server({
        key: forge.pki.privateKeyToPem(serverCertData.privateKey),
        cert: forge.pki.certificateToPem(serverCertData.cert),
        // SNICallback을 사용하면 여러 도메인에 대한 인증서를 동적으로 제공할 수 있습니다.
    });

    // 3. 클라이언트와 TLS 핸드셰이크가 성공하여 통신이 복호화되었을 때의 처리
    tlsServer.on('secureConnection', (decryptedSocket) => {
        decryptedSocket.on('error', (err) => {
            console.error('Decrypted Socket Error:', err);
        });
        
        // 4. 복호화된 소켓을 표준 http 서버 로직으로 처리
        const mitmServer = http.createServer((mitmReq, mitmRes) => {
            // --- 📢 여기서 복호화된 요청의 모든 정보를 볼 수 있습니다 ---
            console.log(`\n[${hostname}] ---> ${mitmReq.method} ${mitmReq.url}`);
            
            const bodyChunks = [];
            mitmReq.on('data', chunk => bodyChunks.push(chunk));
            mitmReq.on('end', () => {
                const body = Buffer.concat(bodyChunks).toString();
                if (body) {
                    console.log('[Request Body]:', body);
                }
            });
            // --------------------------------------------------------

            // 5. 실제 목적지 서버로 요청을 다시 보냄
            const options = {
                hostname: hostname,
                port: port || 443,
                path: mitmReq.url,
                method: mitmReq.method,
                headers: mitmReq.headers,
            };

            const proxyReq = http.request(options, (proxyRes) => {
                mitmRes.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(mitmRes);
            });
            
            proxyReq.on('error', (err) => {
                console.error(`Request to ${hostname} failed:`, err);
                mitmRes.writeHead(502); // Bad Gateway
                mitmRes.end();
            });

            mitmReq.pipe(proxyReq);
        });

        mitmServer.emit('connection', decryptedSocket);
    });

    tlsServer.on('error', (err) => console.error('TLS Server Error:', err));

    // 6. 최초 클라이언트 소켓을 우리 가짜 TLS 서버로 파이핑하여 핸드셰이크 시작
    clientSocket.pipe(tlsServer);
});

// --- 동적으로 가짜 인증서를 생성하는 함수 ---
function createServerCertificate(hostname) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    
    cert.publicKey = keys.publicKey;
    cert.serialNumber = new Date().getTime().toString();
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    const attrs = [{ name: 'commonName', value: hostname }];
    cert.setSubject(attrs);
    cert.setIssuer(caCert.subject.attributes); // 우리 Root CA가 발급했다고 설정
    cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] }]);
    
    cert.sign(caKey, forge.md.sha256.create()); // 우리 Root CA 개인키로 서명
    
    return { privateKey: keys.privateKey, cert: cert };
}


server.listen(PROXY_PORT, () => {
  console.log(`http-proxy 라이브러리를 사용한 프록시 서버가 ${PROXY_PORT}번 포트에서 실행 중입니다.`);
});