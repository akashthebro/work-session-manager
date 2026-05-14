const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = process.env.NODE_ENV !== 'production';
const PYTHON_ROOT = path.join(__dirname, '..', '..');
const DEV_SERVER = 'http://localhost:5173';

let apiProcess = null;
let win = null;

ipcMain.on('minimize-window', () => win?.minimize());
ipcMain.on('close-window',   () => win?.close());

function startApi() {
  apiProcess = spawn('python', [path.join(PYTHON_ROOT, 'api.py')], {
    cwd: PYTHON_ROOT,
  });
  apiProcess.stdout.on('data', (d) => console.log('[api]', d.toString().trim()));
  apiProcess.stderr.on('data', (d) => console.error('[api]', d.toString().trim()));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 750,
    frame: false,
    transparent: false,
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(DEV_SERVER);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  startApi();
  createWindow();
});

function killApi() {
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
}

app.on('window-all-closed', () => {
  killApi();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', killApi);
