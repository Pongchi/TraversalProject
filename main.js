const { app, BrowserWindow  } = require('electron/main');
const proxyServer = require('./proxy.js');
const browser = require('./chromedriver.js');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
        devTools: true,
        nodeIntegration: true,
        contextIsolation: false,
    }
  })

  proxyServer.listen({ port: 8080, host: '127.0.0.1' }, () => { // host 추가
    console.log('Proxy Server running on 127.0.0.1:8080');
  });
  win.loadFile('index.html');

  browser();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})