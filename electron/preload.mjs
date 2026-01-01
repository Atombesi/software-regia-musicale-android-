import { contextBridge, ipcRenderer } from 'electron';

console.log('--- PRELOAD SCRIPT STARTING ---');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // FILESYSTEM
    saveDialog: (defaultName) => ipcRenderer.invoke('dialog:save', defaultName),
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    readFile: (path) => ipcRenderer.invoke('file:read', path),
    writeFile: (path, content) => ipcRenderer.invoke('file:write', path, content),
    copyFile: (src, dest) => ipcRenderer.invoke('file:copy', src, dest),
    createDir: (path) => ipcRenderer.invoke('dir:create', path),
    exists: (path) => ipcRenderer.invoke('file:exists', path),
    
    // SERVER (V2.0)
    server: {
        start: (pin) => ipcRenderer.invoke('server:start', pin),
        stop: () => ipcRenderer.invoke('server:stop'),
        getIP: () => ipcRenderer.invoke('server:get-ip'),
        send: (data) => ipcRenderer.invoke('server:broadcast', data),
        
        // Listeners (from Main to Renderer)
        // FIX: Remove listeners before adding new ones to prevent duplicates (double chat messages)
        onClientMessage: (callback) => {
            ipcRenderer.removeAllListeners('server:command');
            ipcRenderer.on('server:command', (_event, value) => callback(value));
        },
        onClientStatus: (callback) => {
            ipcRenderer.removeAllListeners('server:status');
            ipcRenderer.on('server:status', (_event, value) => callback(value));
        }
    }
  });
  console.log('--- PRELOAD SUCCESS: electronAPI exposed ---');
} catch (error) {
  console.error('--- PRELOAD ERROR ---', error);
}