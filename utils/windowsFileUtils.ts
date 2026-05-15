import { Filesystem, Encoding } from '@capacitor/filesystem';

// --- NUOVE FUNZIONI HELPER PER MANIPOLAZIONE STRINGHE ---

/**
 * Estrae solo il nome del file (con estensione) da un percorso completo.
 * Esempio: "c:\user\docs\file.txt" -> "file.txt"
 */
export const EstraiName = (fullname: string): string => {
    if (!fullname) return "";
    // Normalizza temporaneamente per trovare l'ultimo separatore (supporta sia \ che /)
    const normalized = fullname.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    
    if (lastSlash === -1) return fullname; // Nessun percorso, è solo nome file
    return fullname.substring(lastSlash + 1);
};

/**
 * Estrae solo il percorso della cartella da un percorso completo.
 * Esempio: "c:\user\docs\file.txt" -> "c:\user\docs"
 */
export const EstraiPath = (fullname: string): string => {
    if (!fullname) return "";
    const normalized = fullname.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    
    if (lastSlash === -1) return ""; // Nessun percorso trovato
    return fullname.substring(0, lastSlash);
};

/**
 * Unisce un percorso e un nome file per creare il percorso completo.
 * Gestisce automaticamente l'aggiunta del separatore corretto (\ o /) se mancante.
 */
export const CreaFullname = (path: string, filename: string): string => {
    if (!path) return filename;
    if (!filename) return path;

    // Determina il separatore basandosi su quello che c'è già nel path
    const separator = path.includes('/') ? '/' : '\\';
    
    // Rimuovi separatore finale se presente per evitare duplicati
    let cleanPath = path;
    if (cleanPath.endsWith('\\') || cleanPath.endsWith('/')) {
        cleanPath = cleanPath.substring(0, cleanPath.length - 1);
    }

    return `${cleanPath}${separator}${filename}`;
};

// ---------------------------------------------------------

/**
 * Gestisce la scrittura di file di testo su Windows.
 * Usa electronAPI se disponibile (Accesso disco reale), altrimenti fallback su Capacitor (Virtuale).
 */
export const writeWindowsTextFile = async (basePath: string, fileName: string, content: string): Promise<void> => {
    // 1. Costruzione Full Path
    let fullPath = basePath || "";
    
    // Pulizia Prefissi
    if (fullPath.startsWith('file:///')) fullPath = fullPath.substring(8);
    else if (fullPath.startsWith('file://')) fullPath = fullPath.substring(7);

    fullPath = fullPath.replace(/\\/g, '/');

    const cleanFileName = fileName.replace(/\\/g, '/'); 
    
    if (cleanFileName && !fullPath.toLowerCase().endsWith(cleanFileName.toLowerCase())) {
        if (fullPath.length > 0 && !fullPath.endsWith('/')) {
            fullPath += '/';
        }
        fullPath += cleanFileName;
    }

    try {
        fullPath = decodeURIComponent(fullPath);
    } catch (e) {}

    // === TENTATIVO 1: ELECTRON API (Disco Reale) ===
    // Usiamo il cast as any per essere sicuri che TS non nasconda la proprietà
    const electron = (window as any).electronAPI;

    if (electron) {
        try {
            await electron.writeFile(fullPath, content);
            return;
        } catch (e) {
            console.error("Electron Write Error:", e);
            // SE ELECTRON FALLISCE SU UN PATH REALE, NON PROVARE CAPACITOR!
            // Capacitor fallirebbe comunque con "Directory already exists" cercando di creare "C:"
            throw e;
        }
    }

    // === GUARDIA DI SICUREZZA PER WINDOWS ===
    // Se non abbiamo trovato electronAPI ma il percorso contiene ':', 
    // stiamo provando a scrivere su un disco fisico senza il ponte attivo.
    // Blocchiamo tutto qui per evitare l'errore fuorviante di Capacitor.
    if (fullPath.includes(':')) {
        throw new Error("Impossibile salvare: il percorso sembra essere locale (" + fullPath + ") ma il ponte Electron non risponde.");
    }

    // === TENTATIVO 2: CAPACITOR (Web/Virtual) ===
    try {
        await Filesystem.writeFile({
            path: fullPath,
            data: content,
            encoding: Encoding.UTF8,
            recursive: false
        });
    } catch (e) {
        console.error("Windows/Web Write Error:", e);
        throw e;
    }
};

/**
 * Gestisce la scrittura di file binari su Windows (es. Assets scaricati).
 * Richiede implementazione lato Electron per decodificare base64.
 */
export const writeWindowsBinaryFile = async (fullPath: string, base64Data: string): Promise<void> => {
    // Pulizia path
    let path = fullPath;
    if (path.startsWith('file:///')) path = path.substring(8);
    else if (path.startsWith('file://')) path = path.substring(7);
    path = path.replace(/\\/g, '/'); // Normalize slashes for JS handling, Electron handles OS specific

    try { path = decodeURIComponent(path); } catch (e) {}

    const electron = (window as any).electronAPI;
    if (electron && electron.writeBinary) {
        try {
            await electron.writeBinary(path, base64Data);
        } catch (e) {
            console.error("Electron Binary Write Error:", e);
            throw e;
        }
    } else {
        throw new Error("Salvataggio binario non supportato in questo ambiente (manca Electron bridge).");
    }
};

/**
 * Gestisce la lettura di file di testo su Windows.
 * Usa electronAPI se disponibile (Accesso disco reale).
 */
export const readWindowsTextFile = async (basePath: string, fileName: string): Promise<string> => {
    let fullPath = basePath || "";
    
    // Pulizia Prefissi
    if (fullPath.startsWith('file:///')) fullPath = fullPath.substring(8);
    else if (fullPath.startsWith('file://')) fullPath = fullPath.substring(7);

    fullPath = fullPath.replace(/\\/g, '/');

    if (fileName && !fullPath.endsWith(fileName)) {
        if (fullPath.length > 0 && !fullPath.endsWith('/')) {
            fullPath += '/';
        }
        fullPath += fileName;
    }
    
    try {
        fullPath = decodeURIComponent(fullPath);
    } catch (e) {}

    // === TENTATIVO 1: ELECTRON API (Disco Reale) ===
    const electron = (window as any).electronAPI;
    
    if (electron) {
        // Se il file non esiste, node fs lancerà un errore che verrà catturato dal chiamante
        return await electron.readFile(fullPath);
    }

    // === TENTATIVO 2: CAPACITOR FILESYSTEM ===
    try {
        const res = await Filesystem.readFile({
            path: fullPath,
            encoding: Encoding.UTF8
        });
        return res.data as string;
    } catch (fsErr) {
        // === TENTATIVO 3: FALLBACK FETCH (Per file locali serviti da Vite) ===
        // Questo serve solo in modalità sviluppo web o preview, non in produzione Electron vera
        
        let fetchUrl = fullPath;
        if (!fetchUrl.startsWith('file://') && !fetchUrl.startsWith('http')) {
             // Proviamo a vedere se è un path assoluto windows o relativo
             if (fetchUrl.match(/^[a-zA-Z]:/)) {
                fetchUrl = 'file:///' + fetchUrl;
             } else if (fetchUrl.startsWith('/')) {
                fetchUrl = 'file://' + fetchUrl;
             }
        }
        
        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Fetch error: ${response.status}`);
            return await response.text();
        } catch (fetchErr: any) {
            throw new Error(`Impossibile leggere il file. Electron API non attiva e FS fallito.`);
        }
    }
};