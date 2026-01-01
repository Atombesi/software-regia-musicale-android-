import { Capacitor } from '@capacitor/core';

// --- PLATFORM CHECK ---
export const isAndroidPlatform = (): boolean => {
    return Capacitor.getPlatform() === 'android';
};

export const isElectron = (): boolean => {
    // Check user agent for Electron identifier
    return navigator.userAgent.toLowerCase().includes(' electron/');
};

// --- STRING & PATH HELPERS ---

export const removeExtension = (name: string): string => {
    if (!name) return "";
    return name.replace(/\.[^/.]+$/, "");
};

export const extractFileName = (path: string): string => {
    if (!path) return "";
    try { path = decodeURIComponent(path); } catch (e) {}
    path = path.replace(/['"]/g, '');
    return path.replace(/^.*[\\\/]/, '').trim();
};

/**
 * Pulisce aggressivamente un percorso Android per renderlo relativo a ExternalStorage.
 * Rimuove file://, /storage/emulated/0/ e slash iniziali.
 */
export const cleanAndroidPath = (path: string): string => {
    if (!path) return "";
    let clean = path;
    
    // 1. Rimuovi protocollo
    clean = clean.replace(/^file:\/\//, '');
    
    // 2. Rimuovi root storage fisico
    const androidRoot = '/storage/emulated/0/';
    if (clean.startsWith(androidRoot)) {
        clean = clean.substring(androidRoot.length);
    }
    
    // 3. Rimuovi slash iniziale
    if (clean.startsWith('/')) {
        clean = clean.substring(1);
    }
    
    // 4. Normalizza slash
    clean = clean.replace(/\\/g, '/');
    
    return clean;
};

/**
 * Normalizza un path per il confronto o il playback.
 * Su Windows rimuove 'file://', normalizza gli slash e rende lowercase per confronto case-insensitive.
 */
export const normalizePath = (path: string): string => {
    if (!path) return "";
    
    // Blob URLs sono sempre case-sensitive e non vanno toccati
    if (path.startsWith('blob:')) return path;

    if (isAndroidPlatform()) {
        // Su Android Capacitor gestisce i path nativi, ritorniamo il path pulito se necessario
        // Ma per il playback, file:// serve a volte. Questa funzione è per confronti.
        return path;
    } else {
        // WINDOWS / ELECTRON Logic
        try {
            return decodeURIComponent(path)
                .replace(/\\/g, '/')          // Tutti slash in avanti
                .replace(/^file:\/\/\/?/, '') // Via protocollo
                .toLowerCase()                // Case insensitive
                .trim();
        } catch {
            return path.toLowerCase();
        }
    }
};

/**
 * Determina se il player audio deve ricaricare la sorgente.
 * Gestisce le differenze subdole tra come il browser riporta audio.src e il path del file.
 */
export const shouldReloadAudioSource = (currentSrc: string, targetUrl: string): boolean => {
    if (!targetUrl) return false;
    if (!currentSrc) return true;

    // Blob: confronto esatto
    if (targetUrl.startsWith('blob:')) {
        return currentSrc !== targetUrl;
    }

    if (isAndroidPlatform()) {
        // Android strict check (spesso basta includes per via dei path assoluti vs relativi)
        return !currentSrc.includes(targetUrl);
    } else {
        // Windows Logic
        const nCur = normalizePath(currentSrc);
        const nTgt = normalizePath(targetUrl);
        
        // Confronto esatto O controllo se finisce con (per path relativi vs assoluti)
        return nCur !== nTgt && !nCur.endsWith(nTgt);
    }
};

/**
 * Formatta il path per il salvataggio nel file .txt della playlist.
 * Su Windows forza i backslash (\).
 */
export const formatPathForSaving = (path: string): string => {
    if (!path) return "";
    if (!isAndroidPlatform()) {
        return path.replace(/\//g, '\\');
    }
    // Su Android salviamo pulito
    return cleanAndroidPath(path);
};

// --- TIME FORMATTERS ---

export const formatTimeDetail = (time: number | undefined): string => {
    const t = time || 0;
    if (isNaN(t) || !isFinite(t)) return "0:00.00";
    const minutes = Math.floor(t / 60);
    const seconds = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const parseManualTime = (str: string): number => {
    const cleanStr = str.replace(',', '.').trim();
    if (!cleanStr) return 0;
    
    const parts = cleanStr.split(':');
    
    if (parts.length === 2) {
        const min = parseFloat(parts[0]) || 0;
        const sec = parseFloat(parts[1]) || 0;
        return (min * 60) + sec;
    } else {
        return parseFloat(cleanStr) || 0;
    }
};