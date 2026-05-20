
import { useState, useCallback, useMemo } from 'react';
import { Song, SfxItem } from '../types';
import { formatPathForSaving } from '../utils/platformUtils';
import { Directory } from '@capacitor/filesystem';

// Helper function to generate content string consistently
const generateContentString = (songs: Song[], sfxItems: SfxItem[], scriptFilePath?: string | null) => {
    let content = "";
    let notesSection = "";

    if (scriptFilePath) {
        content += `SCRIPT_PATH;${scriptFilePath}\n`;
    }

    songs.forEach((s, index) => {
        if (s.type === 'separator') {
            // New Format for Separator: SEPARATOR;Title
            content += `SEPARATOR;${s.title}\n`;
        } else {
            let path = s.path || s.originalFileName || s.url;
            path = formatPathForSaving(path);
            
            // Rounding to 2 decimal places for cleaner files
            const start = (s.trimStart || 0).toFixed(2);
            const end = (s.trimEnd || 0).toFixed(2);
            const gain = (s.customGain !== undefined ? s.customGain : 1.0).toFixed(2);
            
            // FADE LOGIC: If hasFadeOut is true, store the Duration (e.g. "5.0"). If false, store "0".
            // Legacy compat: "1" used to mean ON. Now we use float.
            const fade = s.hasFadeOut ? (s.fadeOutDuration || 5).toFixed(1) : '0';
            
            // Handle Notes: If note exists, put a pointer [NOTE_N] in the CSV and append text at bottom
            let noteField = "";
            if (s.note && s.note.trim().length > 0) {
                const notePointer = `[NOTE_${index}]`;
                noteField = notePointer;
                
                // Append to notes section
                notesSection += `\n${notePointer}\n${s.note}\n`;
            }

            content += `${s.title};${path};${start};${end};${fade};${gain};${noteField}\n`;
        }
    });

    sfxItems.forEach((sfx, idx) => {
        if (sfx && sfx.url) {
           let path = sfx.path || sfx.originalFileName || sfx.url;
           path = formatPathForSaving(path);
           
           const start = (sfx.trimStart || 0).toFixed(2);
           const end = (sfx.trimEnd || 0).toFixed(2);
           const gain = (sfx.customGain !== undefined ? sfx.customGain : 1.0).toFixed(2);
           
           // Same Fade Logic for SFX
           const fade = sfx.hasFadeOut ? (sfx.fadeOutDuration || 5).toFixed(1) : '0';
           
           content += `SFX;${idx};${sfx.label};${path};${start};${end};${fade};${gain}\n`;
        }
    });

    // Append Notes Section at the end of file
    if (notesSection) {
        content += notesSection;
    }

    return content;
};

export const usePlaylistManager = () => {
    // --- STATE ---
    const [songs, setSongs] = useState<Song[]>([]);
    const [sfxItems, setSfxItems] = useState<SfxItem[]>(new Array(9).fill(undefined));
    const [currentIndex, setCurrentIndex] = useState(0);
    const [playedSongIds, setPlayedSongIds] = useState<Set<string>>(new Set());
    
    // File metadata
    const [sourceFileName, setSourceFileName] = useState<string>("playlist.txt");
    const [sourceFilePath, setSourceFilePath] = useState<string | null>(null);
    const [sourceDirectory, setSourceDirectory] = useState<Directory | undefined>(undefined);
    const [isPlaylistLoaded, setIsPlaylistLoaded] = useState(false);
    const [scriptFilePath, setScriptFilePath] = useState<string | null>(null);

    // Dirty state tracking (Snapshot of the file on disk)
    const [savedContentSnapshot, setSavedContentSnapshot] = useState<string>("");

    // Calculate current content string on every change
    const currentContent = useMemo(() => {
        return generateContentString(songs, sfxItems, scriptFilePath);
    }, [songs, sfxItems, scriptFilePath]);

    // Derived state: True if current state differs from the saved snapshot
    const hasUnsavedChanges = currentContent !== savedContentSnapshot;

    // --- ACTIONS ---

    const loadPlaylist = useCallback((
        newSongs: Song[], 
        newSfx: SfxItem[], 
        fileName?: string, 
        path?: string, 
        directory?: Directory,
        fromDisk: boolean = true, // If true, updates the saved snapshot (reset dirty state)
        scriptPath?: string | null
    ) => {
        setSongs(newSongs);
        setSfxItems(newSfx);
        
        // Find first actual song (skip separators at start if any)
        let firstIndex = 0;
        while(firstIndex < newSongs.length && newSongs[firstIndex].type === 'separator') {
            firstIndex++;
        }
        setCurrentIndex(firstIndex < newSongs.length ? firstIndex : 0);
        
        setPlayedSongIds(new Set());
        
        if (fileName) setSourceFileName(fileName);
        if (path) setSourceFilePath(path);
        if (directory) setSourceDirectory(directory);
        if (scriptPath !== undefined) setScriptFilePath(scriptPath);
        
        if (fromDisk) {
            setSavedContentSnapshot(generateContentString(newSongs, newSfx, scriptPath !== undefined ? scriptPath : scriptFilePath));
        }


        setIsPlaylistLoaded(true);
    }, [scriptFilePath]);

    const markAsSaved = useCallback(() => {
        setSavedContentSnapshot(generateContentString(songs, sfxItems, scriptFilePath));
    }, [songs, sfxItems, scriptFilePath]);

    const resetShow = useCallback(() => {
        setPlayedSongIds(new Set());
        // Find first actual song
        let firstIndex = 0;
        while(firstIndex < songs.length && songs[firstIndex].type === 'separator') {
            firstIndex++;
        }
        setCurrentIndex(firstIndex < songs.length ? firstIndex : 0);
    }, [songs]);

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
        let nextIndex = currentIndex + 1;
        
        // Skip Separators
        while (nextIndex < songs.length && songs[nextIndex].type === 'separator') {
            nextIndex++;
        }

        if (nextIndex < songs.length) {
            setCurrentIndex(nextIndex);
            return true;
        }
        
        // End of show logic
        // If we are at the last audio song, we can technically go to "End"
        if (currentIndex < songs.length && nextIndex >= songs.length) {
             setCurrentIndex(songs.length); // End state
             return true;
        }
        
        return false;
    }, [currentIndex, songs]);

    const prevSong = useCallback(() => {
        let prevIndex = currentIndex - 1;

        // Skip Separators going backwards
        while (prevIndex >= 0 && songs[prevIndex].type === 'separator') {
            prevIndex--;
        }

        if (prevIndex >= 0) {
            setCurrentIndex(prevIndex);
            return true;
        }
        return false;
    }, [currentIndex, songs]);

    const markAsPlayed = useCallback((id: string) => {
        setPlayedSongIds(prev => new Set(prev).add(id));
    }, []);

    // NEW: Clears played status for all songs starting from `startIndex` onwards
    const rewindPlayedStatus = useCallback((startIndex: number) => {
        setPlayedSongIds(prev => {
            const next = new Set(prev);
            for(let i = startIndex; i < songs.length; i++) {
                if (songs[i].id) next.delete(songs[i].id);
            }
            return next;
        });
    }, [songs]);

    // --- FILE GENERATION ---
    const generatePlaylistContent = useCallback(() => {
        return generateContentString(songs, sfxItems, scriptFilePath);
    }, [songs, sfxItems, scriptFilePath]);

    const clearPlaylist = useCallback(() => {
        setSongs([]);
        setSavedContentSnapshot(""); 
        setIsPlaylistLoaded(false);
        setScriptFilePath(null);
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
            hasUnsavedChanges, // Expose dirty state
            scriptFilePath
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
            rewindPlayedStatus, // NEW EXPORT
            generatePlaylistContent,
            clearPlaylist,
            setSourceFileName, 
            setSourceFilePath,
            setSourceDirectory,
            setScriptFilePath,
            markAsSaved // Expose save action
        }
    };
};
