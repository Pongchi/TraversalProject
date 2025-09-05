const { app, BrowserWindow } = require('electron/main')
const { startProxyServer } = require('./proxy');
const path = require('path')


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

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  const proxyServer = startProxyServer();
  proxyServer.listen(8080, () => {
    console.log('Proxy ON');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
