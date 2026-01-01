import { useCallback } from 'react';
import { Directory } from '@capacitor/filesystem';
import { AppMode } from '../types';
import { writeTextFile, readTextFile } from '../utils/filesystemUtils';
import { AppGlobals } from '../globals';

interface LoggerProps {
    appMode: AppMode;
    playlistFileName: string;
    playlistPath: string | null;
    playlistDirectory?: Directory;
}

export const useShowLogger = ({ appMode, playlistFileName, playlistPath, playlistDirectory }: LoggerProps) => {

    const logEvent = useCallback(async (action: string, details: string = "", forceLog: boolean = false, sourcePrefix: string = "") => {
        // Scrive solo in modalità Presentation, a meno che non sia forzato (es. cambio modalità)
        if (!forceLog && appMode !== 'presentation') return;

        const now = new Date();
        const d = now.getDate().toString().padStart(2, '0');
        const m = (now.getMonth() + 1).toString().padStart(2, '0');
        const y = now.getFullYear();
        const h = now.getHours().toString().padStart(2, '0');
        const min = now.getMinutes().toString().padStart(2, '0');
        const s = now.getSeconds().toString().padStart(2, '0');
        
        // Formato riga richiesto: [12-12-2025 23:44:55] [client] Azione; Dettagli
        const prefixStr = sourcePrefix ? `${sourcePrefix} ` : "";
        const timestamp = `[${d}-${m}-${y} ${h}:${min}:${s}]`;
        const line = `${timestamp} ${prefixStr}${action}${details ? ';' + details : ''}\n`;

        // Recupera Path e Nome dalle globali per sicurezza
        const logPath = AppGlobals.Playlistpath;
        const logFileName = "Log_" + AppGlobals.Playlistfilename;

        if (!logPath || !AppGlobals.Playlistfilename) return;
        
        // Costruzione manuale del Full Path per Windows
        let fullLogPath = logPath;
        if (fullLogPath && !fullLogPath.endsWith('/') && !fullLogPath.endsWith('\\')) {
             fullLogPath += '/';
        }
        fullLogPath += logFileName;

        try {
            let currentContent = "";
            try {
                currentContent = await readTextFile(logPath, logFileName, playlistDirectory);
            } catch (readError) {
                // Se file non esiste, sarà creato vuoto
            }

            const newContent = currentContent + line;

            await writeTextFile(fullLogPath, logFileName, newContent, playlistDirectory);

        } catch (e: any) {
            console.error("Errore scrittura Log:", e);
        }

    }, [appMode, playlistDirectory]); 

    return { logEvent };
};