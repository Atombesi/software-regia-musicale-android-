import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { cleanAndroidPath } from './platformUtils';

export const ASSETS_FOLDER = 'RegiaMusiche_Assets';

/**
 * Gestisce la scrittura su Android.
 * FIX: Usa cleanAndroidPath per garantire percorsi relativi e previene duplicazione nome file.
 */
export const writeAndroidTextFile = async (basePath: string, fileName: string, content: string, directory: Directory = Directory.ExternalStorage): Promise<void> => {
    
    // 1. Pulisce il percorso base (toglie file://, /storage/..., ecc.)
    let cleanBase = cleanAndroidPath(basePath);
    
    // 2. Prepara nome file pulito
    const cleanName = fileName.replace(/\\/g, '/');

    // 3. Logica di Unione Intelligente
    let finalPath = cleanBase;
    
    // Rimuovi slash finali da cleanBase per uniformità
    if (finalPath.endsWith('/')) {
        finalPath = finalPath.substring(0, finalPath.length - 1);
    }

    // Se cleanBase NON finisce già con il nome del file, lo aggiungiamo.
    // Esempio: "Download/MyFolder" + "file.txt" -> "Download/MyFolder/file.txt"
    if (!finalPath.toLowerCase().endsWith('/' + cleanName.toLowerCase()) && 
        !finalPath.toLowerCase().endsWith(cleanName.toLowerCase())) {
        
        finalPath += '/' + cleanName;
    }

    // 4. Directory Strategy
    let targetDirectory: Directory | undefined = directory;
    if (finalPath.startsWith('/')) targetDirectory = undefined;

    // Rimuovi eventuali doppi slash causati da concatenazioni errate
    finalPath = finalPath.replace(/\/\//g, '/');

    try {
        // TENTATIVO 1: Scrittura Diretta (Recursive False)
        await Filesystem.writeFile({
            path: finalPath,
            data: content,
            directory: targetDirectory,
            encoding: Encoding.UTF8,
            recursive: false 
        });
    } catch (e: any) {
        // TENTATIVO 2: Recursive True
        try {
            await Filesystem.writeFile({
                path: finalPath,
                data: content,
                directory: targetDirectory,
                encoding: Encoding.UTF8,
                recursive: true
            });
        } catch (recErr) {
            console.error("Write failed:", e);
            throw e;
        }
    }
};

export const readAndroidTextFile = async (basePath: string, fileName: string, directory: Directory = Directory.ExternalStorage): Promise<string> => {
    let cleanBase = cleanAndroidPath(basePath);
    const cleanName = fileName.replace(/\\/g, '/');
    
    let finalPath = cleanBase;
    if (!cleanBase.toLowerCase().endsWith(cleanName.toLowerCase())) {
        if (finalPath.length > 0 && !finalPath.endsWith('/')) finalPath += '/';
        finalPath += cleanName;
    }

    let targetDirectory: Directory | undefined = directory;
    if (finalPath.startsWith('/')) targetDirectory = undefined;

    const res = await Filesystem.readFile({
        path: finalPath,
        directory: targetDirectory,
        encoding: Encoding.UTF8
    });
    
    return res.data as string;
};

// --- ASSET MANAGEMENT FOR DOWNLOAD ---

export const ensureAssetsFolder = async (): Promise<void> => {
    try {
        await Filesystem.mkdir({
            path: ASSETS_FOLDER,
            directory: Directory.External, 
            recursive: true
        });
    } catch (e) {
        // Folder might exist
    }
};

export const checkLocalAsset = async (fileName: string): Promise<string | null> => {
    if (!fileName) return null;
    try {
        const path = `${ASSETS_FOLDER}/${fileName}`;
        const uri = await Filesystem.getUri({
            path: path,
            directory: Directory.External
        });
        return Capacitor.convertFileSrc(uri.uri);
    } catch (e) {
        return null;
    }
};

export const saveDownloadedAsset = async (fileName: string, base64Data: string): Promise<void> => {
    await ensureAssetsFolder();
    await Filesystem.writeFile({
        path: `${ASSETS_FOLDER}/${fileName}`,
        data: base64Data,
        directory: Directory.External,
        recursive: true
    });
};