const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const BACKEND_PORT = process.env.BACKEND_PORT || '3000';

let backend = null;
let win = null;

function startBackend() {
  const backendEntry = path.join(__dirname, '..', 'backend', 'src', 'server.js');
  backend = spawn(process.execPath, [backendEntry], {
    env: { ...process.env, PORT: BACKEND_PORT },
    stdio: 'inherit'
  });
  backend.on('error', (err) => console.error('[electron] 启动后端失败:', err));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '课后练习助手',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadURL(DEV_URL);

  win.on('closed', () => {
    win = null;
    if (backend) {
      backend.kill();
      backend = null;
    }
  });
}

app.whenReady().then(() => {
  startBackend();
  setTimeout(createWindow, 500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (backend) {
    backend.kill();
    backend = null;
  }
});
