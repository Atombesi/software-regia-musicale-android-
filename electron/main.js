import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { constants } from 'fs'; 
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import http from 'http';
import os from 'os';
import { randomUUID } from 'crypto';

// Ricostruzione di __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

// --- SERVER VARIABLES ---
let wss = null;       // WebSocket Server instance
let httpServer = null; // HTTP Server for files
let connectedClients = new Map(); // CHANGED: Set -> Map<WebSocket, ClientInfo>
const WS_PORT = 8080;
const HTTP_PORT = 8081;

// --- SECURITY VARIABLES ---
let serverPin = ""; // Stores the current session PIN

// --- UTILS ---
function getLocalIPs() {
    const ips = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Salta indirizzi interni e non IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({ name: name, address: iface.address });
            }
        }
    }
    return ips.length > 0 ? ips : [{ name: 'Loopback', address: '127.0.0.1' }];
}

function broadcastClientList() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        // Convert Map values to Array
        const clients = Array.from(connectedClients.values());
        mainWindow.webContents.send('server:status', clients);
    }
}

function startServer(pin = "") {
    if (wss) return { ips: getLocalIPs(), port: WS_PORT };

    serverPin = pin; // Set the PIN for this session
    console.log(`Starting server with PIN: ${serverPin ? serverPin : "None (Public)"}`);

    try {
        // 1. WebSocket Server (Comandi)
        wss = new WebSocketServer({ port: WS_PORT });
        
        wss.on('connection', (ws, req) => {
            console.log('Client attempting connection...');
            
            // Assign a unique ID to this socket connection
            ws.clientId = randomUUID();
            ws.clientIp = req.socket.remoteAddress?.replace('::ffff:', '') || 'Unknown';
            ws.isAuth = false;

            ws.on('message', (message) => {
                try {
                    const parsed = JSON.parse(message);
                    
                    // --- HANDSHAKE LOGIC ---
                    if (parsed.type === 'HANDSHAKE') {
                        const clientPin = parsed.pin || "";
                        if (!serverPin || serverPin === clientPin) {
                            // AUTH SUCCESS
                            ws.isAuth = true;
                            ws.deviceName = parsed.device || "Unknown Client";
                            
                            // DEFAULT STATE: LOCKED (Solo Chat) = TRUE
                            const initialLockState = true; 
                            
                            // Store client info
                            connectedClients.set(ws, {
                                id: ws.clientId,
                                name: ws.deviceName,
                                ip: ws.clientIp,
                                locked: initialLockState // Persist in Server RAM
                            });

                            console.log(`Client Authenticated: ${ws.deviceName} (${ws.clientId})`);
                            
                            // Send OK with assigned ID AND Initial Permission State
                            ws.send(JSON.stringify({ 
                                type: 'HANDSHAKE_OK', 
                                clientId: ws.clientId,
                                locked: initialLockState 
                            }));
                            
                            // Notify Frontend of new list
                            broadcastClientList();

                        } else {
                            // AUTH FAIL
                            console.log('Client PIN Fail');
                            ws.send(JSON.stringify({ type: 'HANDSHAKE_FAIL' }));
                            ws.close(); 
                        }
                        return;
                    }

                    // --- NORMAL COMMANDS (Only if Auth) ---
                    if (ws.isAuth) {
                        // Forward to React
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            // Inject sender info if missing (for Chat)
                            if (parsed.type && parsed.type.startsWith('CHAT_')) {
                                parsed.senderName = ws.deviceName;
                            }
                            mainWindow.webContents.send('server:command', parsed);
                        }
                    }
                } catch (e) {
                    console.error('WS Parse Error', e);
                }
            });

            ws.on('close', () => {
                if (ws.isAuth) {
                    console.log(`Client disconnected: ${ws.deviceName}`);
                    connectedClients.delete(ws);
                    broadcastClientList();
                }
            });
        });

        // 2. HTTP Server (Streaming Audio per Slave)
        httpServer = http.createServer((req, res) => {
            // URL atteso: /stream?path=C%3A%5CUsers%5C...
            const url = new URL(req.url, `http://${req.headers.host}`);
            
            if (url.pathname === '/stream') {
                const filePath = url.searchParams.get('path');
                if (filePath && existsSync(filePath)) {
                    // Semplice streaming audio
                    const stat = fs.stat(filePath); // Sync stat per header veloce (qui usiamo modulo 'fs' non promises per createReadStream)
                    
                    res.writeHead(200, {
                        'Content-Type': 'audio/mpeg', // Generic fallback, browser gestisce bene wav/mp3
                        'Access-Control-Allow-Origin': '*' // Importante per CORS verso Android
                    });
                    
                    const readStream = createReadStream(filePath);
                    readStream.pipe(res);
                } else {
                    res.writeHead(404);
                    res.end('File not found');
                }
            } else {
                res.writeHead(200);
                res.end('Regia Musiche Server Active');
            }
        });

        httpServer.listen(HTTP_PORT);

        // console.log(`Server started on ${getLocalIPs()[0].address}:${WS_PORT}`);
        return { ips: getLocalIPs(), port: WS_PORT };

    } catch (e) {
        console.error("Server Start Error", e);
        return null;
    }
}

function stopServer() {
    if (wss) {
        wss.close();
        wss = null;
    }
    if (httpServer) {
        httpServer.close();
        httpServer = null;
    }
    connectedClients.clear();
    serverPin = "";
    
    // Notify empty list
    broadcastClientList();
    return true;
}

function kickClient(clientId) {
    if (!wss) return false;
    let found = false;
    for (const ws of wss.clients) {
        if (ws.clientId === clientId) {
            ws.close();
            connectedClients.delete(ws);
            found = true;
            console.log(`Kicked client: ${clientId}`);
            break;
        }
    }
    if (found) broadcastClientList();
    return found;
}


function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.mjs');
  
  console.log('--- ELECTRON STARTUP ---');
  console.log('Preload Path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, 
      webSecurity: false 
    },
    icon: path.join(__dirname, '../icon.png'),
    autoHideMenuBar: true,
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
        console.log('Localhost not found, loading file...');
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  }
}

app.whenReady().then(() => {
  // 1. Dialog Salvataggio
  ipcMain.handle('dialog:save', async (event, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Salva Playlist',
      defaultPath: defaultName || 'playlist.txt',
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return canceled ? null : filePath;
  });

  // 1b. Dialog Selezione Cartella (NEW)
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleziona Cartella di Esportazione',
      properties: ['openDirectory', 'createDirectory']
    });
    return canceled ? null : filePaths[0];
  });

  // 1c. Get Path (NEW - For default download location)
  ipcMain.handle('app:getPath', async (event, name) => {
      return app.getPath(name);
  });

  // 2. Lettura File (Node FS reale)
  ipcMain.handle('file:read', async (event, filePath) => {
    // console.log('Reading file:', filePath);
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
    } catch (e) {
        // console.error('Read Error:', e);
        throw new Error(`Failed to read file: ${filePath} - ${e.message}`);
    }
  });

  // 3. Scrittura File (Node FS reale)
  ipcMain.handle('file:write', async (event, filePath, content) => {
    // console.log('Writing file:', filePath);
    try {
        await fs.writeFile(filePath, content, 'utf-8');
        return true;
    } catch (e) {
        console.error('Write Error:', e);
        throw new Error(`Failed to write file: ${filePath} - ${e.message}`);
    }
  });

  // 3b. Scrittura Binaria (NEW - PER ASSET DOWNLOAD)
  // Riceve base64 e scrive binario.
  ipcMain.handle('file:writeBinary', async (event, filePath, base64Data) => {
      try {
          await fs.writeFile(filePath, base64Data, 'base64');
          return true;
      } catch (e) {
          console.error('Write Binary Error:', e);
          throw new Error(`Failed to write binary file: ${filePath} - ${e.message}`);
      }
  });

  // 3c. Copia File (NEW)
  ipcMain.handle('file:copy', async (event, src, dest) => {
      try {
          await fs.copyFile(src, dest);
          return true;
      } catch (e) {
          console.error('Copy Error:', e);
          throw new Error(`Failed to copy file: ${src} -> ${dest} - ${e.message}`);
      }
  });

  // 3d. Crea Directory (NEW)
  ipcMain.handle('dir:create', async (event, dirPath) => {
      try {
          await fs.mkdir(dirPath, { recursive: true });
          return true;
      } catch (e) {
          console.error('Mkdir Error:', e);
          throw new Error(`Failed to create dir: ${dirPath} - ${e.message}`);
      }
  });

  // 4. Verifica Esistenza File
  ipcMain.handle('file:exists', async (event, filePath) => {
    try {
      await fs.access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  });

  // --- V2.0 SERVER HANDLERS ---
  
  // Start Server
  ipcMain.handle('server:start', async (event, pin) => {
      return startServer(pin);
  });

  // Stop Server
  ipcMain.handle('server:stop', async () => {
      return stopServer();
  });

  // Kick Client
  ipcMain.handle('server:kick', async (event, clientId) => {
      return kickClient(clientId);
  });

  // Get IP
  ipcMain.handle('server:get-ip', async () => {
      return getLocalIPs();
  });

  // Broadcast to Clients (from React -> WS Clients)
  ipcMain.handle('server:broadcast', async (event, data) => {
      
      // INTERCEPT PERMISSION CHANGES to update Server RAM State
      if (data.type === 'SET_PERMISSION' && data.targetId) {
          for (const [ws, info] of connectedClients.entries()) {
              if (info.id === data.targetId) {
                  // Update RAM
                  const newInfo = { ...info, locked: data.locked };
                  connectedClients.set(ws, newInfo);
                  break;
              }
          }
          // We don't need to broadcast list here because React usually updates local state optimistically, 
          // but syncing it keeps it robust.
          broadcastClientList();
      }

      const msg = JSON.stringify(data);
      if (wss) {
          wss.clients.forEach(client => {
            if (client.readyState === 1 && client.isAuth) {
                client.send(msg);
            }
          });
      }
  });

  ipcMain.handle('window:maximize', () => {
      if (mainWindow && !mainWindow.isMaximized()) {
          mainWindow.maximize();
      }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
    stopServer(); 
    if (process.platform !== 'darwin') app.quit();
});