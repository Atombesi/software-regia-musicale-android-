import { Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { writeWindowsTextFile, readWindowsTextFile } from './windowsFileUtils';
import { writeAndroidTextFile, readAndroidTextFile } from './androidFileUtils';
import { cleanAndroidPath } from './platformUtils';

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