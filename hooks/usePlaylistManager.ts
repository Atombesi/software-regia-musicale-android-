import { useState, useCallback } from 'react';
import { Song, SfxItem } from '../types';
import { formatPathForSaving } from '../utils/platformUtils';
import { Directory } from '@capacitor/filesystem';

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

    // --- ACTIONS ---

    const loadPlaylist = useCallback((
        newSongs: Song[], 
        newSfx: SfxItem[], 
        fileName?: string, 
        path?: string, 
        directory?: Directory
    ) => {
        setSongs(newSongs);
        setSfxItems(newSfx);
        setCurrentIndex(0);
        setPlayedSongIds(new Set());
        
        if (fileName) setSourceFileName(fileName);
        if (path) setSourceFilePath(path);
        if (directory) setSourceDirectory(directory);
        
        setIsPlaylistLoaded(true);
    }, []);

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
        let content = "";
        songs.forEach(s => {
            let path = s.path || s.originalFileName || s.url;
            path = formatPathForSaving(path);
            content += `${s.title};${path};${s.trimStart || 0};${s.trimEnd || 0};${s.hasFadeOut ? '1' : '0'};${s.customGain || 1.0};${s.note || ''}\n`;
        });
        sfxItems.forEach((sfx, idx) => {
            if (sfx && sfx.url) {
               let path = sfx.path || sfx.originalFileName || sfx.url;
               path = formatPathForSaving(path);
               content += `SFX;${idx};${sfx.label};${path};${sfx.trimStart || 0};${sfx.trimEnd || 0};${sfx.hasFadeOut ? '1' : '0'};${sfx.customGain || 1.0}\n`;
            }
        });
        return content;
    }, [songs, sfxItems]);

    const clearPlaylist = useCallback(() => {
        setSongs([]);
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
            isPlaylistLoaded
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
            setSourceFileName, // Exposed for Rename/Save As
            setSourceFilePath,
            setSourceDirectory
        }
    };
};