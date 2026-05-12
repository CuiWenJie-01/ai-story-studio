const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development';

let logFile = null;

function initLog() {
  const logDir = app.isPackaged 
    ? path.join(app.getPath('documents'), 'AI Story Studio', 'logs')
    : path.join(__dirname, '..', 'logs');
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  logFile = path.join(logDir, `app-${timestamp}.log`);
  
  console.log('[INIT] Log file:', logFile);
  fs.writeFileSync(logFile, `=== AI Story Studio Log ===\nStarted at: ${new Date().toISOString()}\n`);
}

function log(message, ...args) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  
  console.log(message, ...args);
  
  if (logFile) {
    try {
      fs.appendFileSync(logFile, logLine);
    } catch (e) {
      console.error('Failed to write log:', e);
    }
  }
}

function getBaseDir() {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..');
}

function startNodeServer() {
  return new Promise(async (resolve, reject) => {
    try {
      log('[START] Starting embedded Node.js server...');
      
      const nodeDir = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node')
        : path.join(__dirname, '..', 'node');
      
      log('[START] Node directory:', nodeDir);
      log('[START] Node directory exists:', fs.existsSync(nodeDir));
      
      if (!fs.existsSync(nodeDir)) {
        const error = new Error('Node directory not found: ' + nodeDir);
        log('[ERROR]', error.message);
        reject(error);
        return;
      }
      
      require.main.paths.unshift(path.join(nodeDir, 'node_modules'));
      
      process.chdir(nodeDir);
      log('[START] Changed CWD to:', process.cwd());
      
      const webDistPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'web', 'dist')
        : path.join(__dirname, '..', 'web', 'dist');
      
      process.env.WEB_DIST_PATH = webDistPath;
      log('[START] WEB_DIST_PATH set to:', webDistPath);
      log('[START] WEB_DIST_PATH exists:', fs.existsSync(webDistPath));
      
      const serverScriptPath = path.join(nodeDir, 'src', 'app.js');
      log('[START] Server script path:', serverScriptPath);
      log('[START] Server script exists:', fs.existsSync(serverScriptPath));
      
      if (!fs.existsSync(serverScriptPath)) {
        const error = new Error('Server script not found: ' + serverScriptPath);
        log('[ERROR]', error.message);
        reject(error);
        return;
      }
      
      log('[START] Loading server module...');
      const { createApp } = require(serverScriptPath);
      log('[START] Server module loaded successfully');
      
      log('[START] Creating app...');
      const { app: serverApp, config } = await createApp();
      log('[START] App created successfully');
      
      const port = 5679;
      const host = '127.0.0.1';
      
      log('[START] Starting server on port:', port);
      const server = serverApp.listen(port, host, () => {
        log('[START] Server started on port', port);
        resolve();
      });
      
      server.on('error', (err) => {
        log('[ERROR] Server listen error:', err.message);
        reject(err);
      });
      
      global.server = server;
      
    } catch (err) {
      log('[ERROR] Failed to start embedded server:', err.message);
      log('[ERROR] Error stack:', err.stack);
      reject(err);
    }
  });
}

function createWindow() {
  log('[WINDOW] Creating browser window...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'AI Story Studio',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log('[WINDOW] Window shown');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log('[WINDOW] Page loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log('[ERROR] Page load failed:', errorCode, errorDescription);
  });

  if (isDev) {
    log('[WINDOW] Loading dev URL: http://localhost:3013');
    mainWindow.loadURL('http://localhost:3013');
    mainWindow.webContents.openDevTools();
  } else {
    log('[WINDOW] Loading production URL: http://127.0.0.1:5679/');
    mainWindow.loadURL('http://127.0.0.1:5679/');
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  
  log('[WINDOW] Browser window created');
}

app.whenReady().then(async () => {
  initLog();
  log('[APP] App ready, starting...');
  log('[APP] isDev:', isDev);
  log('[APP] isPackaged:', app.isPackaged);
  log('[APP] Resources path:', process.resourcesPath);
  log('[APP] App path:', app.getAppPath());
  log('[APP] Exec path:', process.execPath);

  try {
    await startNodeServer();
    log('[APP] Server ready, creating window...');
    createWindow();
  } catch (err) {
    log('[ERROR] Failed to start:', err.message);
    log('[ERROR] Error stack:', err.stack);
    setTimeout(() => {
      app.quit();
    }, 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  log('[APP] Before quit');
  isQuitting = true;
  if (global.server) {
    global.server.close();
  }
});

app.on('window-all-closed', () => {
  log('[APP] All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

process.on('uncaughtException', (err) => {
  log('[FATAL] Uncaught exception:', err.message);
  log('[FATAL] Error stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  log('[ERROR] Unhandled rejection:', reason);
});