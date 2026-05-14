const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const isDev = !app.isPackaged;
const DEV_SERVER = 'http://localhost:5173';

let apiProcess = null;
let win = null;

ipcMain.on('minimize-window', () => win?.minimize());
ipcMain.on('close-window',   () => win?.close());

function startApi() {
  let apiPath;
  let apiArgs;
  let apiCwd;

  if (isDev) {
    apiPath = 'python';
    apiArgs = [path.join(__dirname, '../../api.py')];
    apiCwd  = path.join(__dirname, '../../');
  } else {
    apiPath = path.join(process.resourcesPath, 'api', 'api.exe');
    apiArgs = [];
    apiCwd  = path.join(process.resourcesPath, 'api');
  }

  console.log(`[WSM] Starting API: ${apiPath}`);

  apiProcess = spawn(apiPath, apiArgs, {
    cwd: apiCwd,
    stdio: 'ignore',
    detached: false,
  });

  apiProcess.on('error', (err) => {
    console.error('[WSM] API process error:', err);
  });

  apiProcess.on('exit', (code) => {
    console.log(`[WSM] API process exited with code ${code}`);
  });
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
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }
}

function killApi() {
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
}

app.whenReady().then(() => {
  startApi();
  setTimeout(createWindow, app.isPackaged ? 3000 : 0);
});

app.on('window-all-closed', () => {
  killApi();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', killApi);
