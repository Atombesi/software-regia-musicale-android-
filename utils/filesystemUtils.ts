import { Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { writeWindowsTextFile, readWindowsTextFile, writeWindowsBinaryFile } from './windowsFileUtils';
import { writeAndroidTextFile, readAndroidTextFile, saveDownloadedAsset } from './androidFileUtils';
import { cleanAndroidPath } from './platformUtils';
import { AppGlobals } from '../globals';

const isAndroidPlatform = () => Capacitor.getPlatform() === 'android';

// --- HISTORY CONSTANTS & TYPES ---
export const HISTORY_FILENAME = 'regia_history.json'; 
export const LOCAL_STORAGE_KEY = 'regia_playlist_history_FINAL'; 

export interface HistoryItem {
    name: string;
    path: string;
    date: number;
}

/**
 * Funzione unificata per SCRIVERE un file di testo.
 * Smista automaticamente tra logica Windows e Android.
 */
export const writeTextFile = async (path: string, fileName: string, content: string, directory?: Directory): Promise<void> => {
    if (isAndroidPlatform()) {
        await writeAndroidTextFile(path, fileName, content, directory);
    } else {
        await writeWindowsTextFile(path, fileName, content);
    }
};

/**
 * Funzione unificata per LEGGERE un file di testo.
 * Smista automaticamente tra logica Windows e Android.
 */
export const readTextFile = async (path: string, fileName: string, directory?: Directory): Promise<string> => {
    if (isAndroidPlatform()) {
        return await readAndroidTextFile(path, fileName, directory);
    } else {
        return await readWindowsTextFile(path, fileName);
    }
};

/**
 * Funzione unificata per salvare un asset (binario/media) scaricato.
 * Su Android usa Directory.External/RegiaMusiche_Assets.
 * Su Windows usa la cartella della playlist corrente + /Assets.
 */
export const saveDownloadedAssetUniversal = async (fileName: string, base64Data: string): Promise<void> => {
    if (isAndroidPlatform()) {
        await saveDownloadedAsset(fileName, base64Data);
    } else {
        // Windows Logic: Use playlist folder
        const basePath = AppGlobals.Playlistpath;
        if (!basePath) throw new Error("Percorso base non definito. Carica o salva prima una playlist.");
        
        // Ensure folder creation via Electron
        const electron = (window as any).electronAPI;
        if (!electron) throw new Error("Electron API non disponibile.");

        // Construct absolute paths without file://
        // Assuming basePath is like "C:/Users/Docs/..."
        const assetsDir = basePath + (basePath.endsWith('/') || basePath.endsWith('\\') ? '' : '/') + "Assets";
        
        // Create directory
        await electron.createDir(assetsDir);
        
        // Save file
        const fullPath = assetsDir + "/" + fileName;
        await writeWindowsBinaryFile(fullPath, base64Data);
    }
};

/**
 * Aggiunge una playlist allo storico (Recenti).
 * Salva sia su LocalStorage (per accesso rapido) che su file JSON persistente.
 */
export const addPlaylistToHistory = async (name: string, path: string): Promise<void> => {
    try {
        const now = Date.now();
        
        let safePath = (path || name).replace(/\\/g, '/');
        
        // FIX: Su Android, puliamo aggressivamente il path prima di salvarlo nello storico
        if (isAndroidPlatform()) {
            safePath = cleanAndroidPath(safePath);
        }
        
        let currentList: HistoryItem[] = [];
        try {
            const ls = localStorage.getItem(LOCAL_STORAGE_KEY);
            if(ls) currentList = JSON.parse(ls);
        } catch(e){}

        // Filtra duplicati esistenti
        const filtered = currentList.filter(item => item.path.replace(/\\/g, '/') !== safePath);
        const newItem: HistoryItem = { name, path: safePath, date: now };
        
        // Mantieni solo gli ultimi 10
        const updated = [newItem, ...filtered].slice(0, 10);

        // 1. Salva LocalStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

        // 2. Salva su File JSON (Backup/Persistenza tra sessioni)
        const content = JSON.stringify(updated, null, 2);
        
        const dir = isAndroidPlatform() ? Directory.External : Directory.Documents;
        
        await writeTextFile(HISTORY_FILENAME, HISTORY_FILENAME, content, dir);

    } catch (e) {
        console.error("Error adding playlist to history:", e);
    }
};