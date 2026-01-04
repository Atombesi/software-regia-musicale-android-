import { useState, useCallback, useMemo } from 'react';
import { Song, SfxItem } from '../types';
import { formatPathForSaving } from '../utils/platformUtils';
import { Directory } from '@capacitor/filesystem';

// Helper function to generate content string consistently
const generateContentString = (songs: Song[], sfxItems: SfxItem[]) => {
    let content = "";
    songs.forEach(s => {
        let path = s.path || s.originalFileName || s.url;
        path = formatPathForSaving(path);
        
        // Rounding to 2 decimal places for cleaner files
        const start = (s.trimStart || 0).toFixed(2);
        const end = (s.trimEnd || 0).toFixed(2);
        const gain = (s.customGain !== undefined ? s.customGain : 1.0).toFixed(2);
        const fade = s.hasFadeOut ? '1' : '0';
        
        content += `${s.title};${path};${start};${end};${fade};${gain};${s.note || ''}\n`;
    });
    sfxItems.forEach((sfx, idx) => {
        if (sfx && sfx.url) {
           let path = sfx.path || sfx.originalFileName || sfx.url;
           path = formatPathForSaving(path);
           
           const start = (sfx.trimStart || 0).toFixed(2);
           const end = (sfx.trimEnd || 0).toFixed(2);
           const gain = (sfx.customGain !== undefined ? sfx.customGain : 1.0).toFixed(2);
           const fade = sfx.hasFadeOut ? '1' : '0';
           
           content += `SFX;${idx};${sfx.label};${path};${start};${end};${fade};${gain}\n`;
        }
    });
    return content;
};

export const usePlaylistManager = () => {
    // --- STATE ---
    const [songs, setSongs] = useState<Song[]>([]);
    const [sfxItems, setSfxItems] = useState<SfxItem[]>(new Array(6).fill(undefined));
    const [currentIndex, setCurrentIndex] = useState(0);
    const [playedSongIds, setPlayedSongIds] = useState<Set<string>>(new Set());
    
    // File metadata
    const [sourceFileName, setSourceFileName] = useState<string>("playlist.txt");
    const [sourceFilePath, setSourceFilePath] = useState<string | null>(null);
    const [sourceDirectory, setSourceDirectory] = useState<Directory | undefined>(undefined);
    const [isPlaylistLoaded, setIsPlaylistLoaded] = useState(false);

    // Dirty state tracking (Snapshot of the file on disk)
    const [savedContentSnapshot, setSavedContentSnapshot] = useState<string>("");

    // Calculate current content string on every change
    const currentContent = useMemo(() => {
        return generateContentString(songs, sfxItems);
    }, [songs, sfxItems]);

    // Derived state: True if current state differs from the saved snapshot
    const hasUnsavedChanges = currentContent !== savedContentSnapshot;

    // --- ACTIONS ---

    const loadPlaylist = useCallback((
        newSongs: Song[], 
        newSfx: SfxItem[], 
        fileName?: string, 
        path?: string, 
        directory?: Directory,
        fromDisk: boolean = true // If true, updates the saved snapshot (reset dirty state)
    ) => {
        setSongs(newSongs);
        setSfxItems(newSfx);
        setCurrentIndex(0);
        setPlayedSongIds(new Set());
        
        if (fileName) setSourceFileName(fileName);
        if (path) setSourceFilePath(path);
        if (directory) setSourceDirectory(directory);
        
        if (fromDisk) {
            setSavedContentSnapshot(generateContentString(newSongs, newSfx));
        }

        setIsPlaylistLoaded(true);
    }, []);

    const markAsSaved = useCallback(() => {
        setSavedContentSnapshot(generateContentString(songs, sfxItems));
    }, [songs, sfxItems]);

    const resetShow = useCallback(() => {
        setPlayedSongIds(new Set());
        setCurrentIndex(0);
    }, []);

    const addSong = useCallback((song: Song) => {
        setSongs(prev => [...prev, song]);
    }, []);

    const updateSong = useCallback((index: number, updater: (song: Song) => Song) => {
        setSongs(prev => {
            const copy = [...prev];
            if (copy[index]) {
                copy[index] = updater(copy[index]);
            }
            return copy;
        });
    }, []);

    const deleteSong = useCallback((index: number) => {
        setSongs(prev => {
            const copy = [...prev];
            copy.splice(index, 1);
            return copy;
        });
        // Adjust index if needed
        setCurrentIndex(prev => {
            if (index < prev) return Math.max(0, prev - 1);
            if (index === prev && prev >= songs.length - 1) return Math.max(0, prev - 1);
            return prev;
        });
    }, [songs.length]);

    const reorderSongs = useCallback((fromIndex: number, toIndex: number) => {
        setSongs(prev => {
            const copy = [...prev];
            const [moved] = copy.splice(fromIndex, 1);
            copy.splice(toIndex, 0, moved);
            return copy;
        });
        
        // Adjust current index to follow the song or stay put
        setCurrentIndex(prev => {
            if (prev === fromIndex) return toIndex;
            if (prev > fromIndex && prev <= toIndex) return prev - 1;
            if (prev < fromIndex && prev >= toIndex) return prev + 1;
            return prev;
        });
    }, []);

    const updateSfx = useCallback((index: number, item: SfxItem | undefined) => {
        setSfxItems(prev => {
            const copy = [...prev];
            // @ts-ignore
            copy[index] = item;
            return copy;
        });
    }, []);

    const nextSong = useCallback(() => {
        if (currentIndex < songs.length - 1) {
            setCurrentIndex(prev => prev + 1);
            return true;
        }
        // Allow going to "End of show" (index == length)
        if (currentIndex === songs.length - 1) {
             setCurrentIndex(prev => prev + 1);
             return true;
        }
        return false;
    }, [currentIndex, songs.length]);

    const prevSong = useCallback(() => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            return true;
        }
        return false;
    }, [currentIndex]);

    const markAsPlayed = useCallback((id: string) => {
        setPlayedSongIds(prev => new Set(prev).add(id));
    }, []);

    // --- FILE GENERATION ---
    const generatePlaylistContent = useCallback(() => {
        return generateContentString(songs, sfxItems);
    }, [songs, sfxItems]);

    const clearPlaylist = useCallback(() => {
        setSongs([]);
        setSavedContentSnapshot(""); 
        setIsPlaylistLoaded(false);
    }, []);

    return {
        state: {
            songs,
            sfxItems,
            currentIndex,
            playedSongIds,
            sourceFileName,
            sourceFilePath,
            sourceDirectory,
            isPlaylistLoaded,
            hasUnsavedChanges // Expose dirty state
        },
        actions: {
            loadPlaylist,
            addSong,
            updateSong,
            deleteSong,
            reorderSongs,
            updateSfx,
            setCurrentIndex,
            nextSong,
            prevSong,
            resetShow,
            markAsPlayed,
            generatePlaylistContent,
            clearPlaylist,
            setSourceFileName, 
            setSourceFilePath,
            setSourceDirectory,
            markAsSaved // Expose save action
        }
    };
};