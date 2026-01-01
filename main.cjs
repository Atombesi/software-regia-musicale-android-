const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true, // Necessario per esporre window.electronAPI direttamente
      preload: path.join(__dirname, 'preload.cjs') // <--- PUNTA AL FILE .CJS
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../dist/icon.png')
  });

  // Carica l'applicazione compilata
  win.loadFile(path.join(__dirname, '../dist/index.html'));
  
  // Opzionale: apri strumenti di sviluppo
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  // GESTORE DEL SALVATAGGIO
  ipcMain.handle('dialog:save', async (event, defaultName) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Salva Playlist',
      defaultPath: defaultName,
      filters: [
        { name: 'File di Testo', extensions: ['txt'] }
      ]
    });
    return filePath;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});