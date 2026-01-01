import { useState, useEffect, useRef, useCallback } from 'react';
import { PlayerState, Song, SfxItem } from '../types';
import { shouldReloadAudioSource } from '../utils/platformUtils';

interface UseAudioPlayerProps {
    targetItem: Song | SfxItem | null;
    playbackSource: 'html5' | 'waveform';
    onTrackEnd: () => void;
    isAndroid: boolean; 
}

export const useAudioPlayer = ({ 
    targetItem, 
    playbackSource, 
    onTrackEnd,
    isAndroid 
}: UseAudioPlayerProps) => {
    
    // --- STATE ---
    const [state, setState] = useState<PlayerState>({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1,
    });

    // --- REFS ---
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const volumeRef = useRef<number>(1.0); 
    const fadeIntervalRef = useRef<any>(null);
    
    // Track ID to detect changes even if URL is same
    const currentTrackIdRef = useRef<string | null>(null);

    // NEW: Callback Ref to prevent stale closures
    const onTrackEndRef = useRef(onTrackEnd);
    useEffect(() => { onTrackEndRef.current = onTrackEnd; }, [onTrackEnd]);

    // --- INITIALIZATION ---
    useEffect(() => {
        audioRef.current = new Audio();
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = "";
            }
            if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        };
    }, []);

    // --- INTERNAL HANDLER (Memoized) ---
    const handleTrackEndInternal = useCallback(() => {
        setState(prev => ({ ...prev, isPlaying: false }));
        if (audioRef.current) audioRef.current.pause();
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        
        // Always call the freshest callback from App.tsx
        if (onTrackEndRef.current) onTrackEndRef.current();
    }, []);

    // --- SOURCE LOADING MANAGEMENT ---
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (targetItem && targetItem.url) {
            // 1. Detect if it's logically a new track (ID changed)
            const hasTrackChanged = targetItem.id !== currentTrackIdRef.current;
            
            // 2. Detect if technical source needs reload
            const currentSrc = audio.src;
            const needsReload = shouldReloadAudioSource(currentSrc, targetItem.url);

            if (needsReload) {
                audio.src = targetItem.url;
                // Preload metadata to ensure duration is available
                audio.preload = 'metadata'; 
            }

            // 3. Reset Position/State if track changed OR source reloaded
            if (hasTrackChanged || needsReload) {
                currentTrackIdRef.current = targetItem.id;
                
                // === FORCE SEEK TO MARK IN (TRIMSTART) ===
                const start = targetItem.trimStart || 0;
                audio.currentTime = start;
                
                setState(prev => ({ 
                    ...prev, 
                    currentTime: start,
                    // If reloading, duration might be 0 until metadata loads, but we reset it to avoid stale duration
                    duration: needsReload ? 0 : prev.duration
                }));

                // Reset Volume for new track (unless we want to persist global volume, but usually per-track gain applies)
                if (!state.isPlaying) {
                    const initialVol = targetItem.customGain || 1.0;
                    audio.volume = initialVol;
                    volumeRef.current = initialVol;
                    setState(prev => ({ ...prev, volume: initialVol }));
                }
            } else {
                // If track ID is same and Source is same (e.g. editing parameters live), just ensure volume matches if not playing
                if (!state.isPlaying && targetItem.customGain !== undefined) {
                     audio.volume = targetItem.customGain;
                     volumeRef.current = targetItem.customGain;
                }
            }
        } else {
            // No target
            audio.src = "";
            currentTrackIdRef.current = null;
            setState(prev => ({ ...prev, currentTime: 0, duration: 0 }));
        }
    }, [targetItem, state.isPlaying, playbackSource]); 

    // --- PLAYBACK CONTROL LOOP ---
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (playbackSource === 'html5') {
            if (state.isPlaying && audio.paused) {
                const start = targetItem?.trimStart || 0;
                // Sanity check: if we are way before start, jump to start
                if (audio.currentTime < start - 0.1) {
                    audio.currentTime = start;
                }
                
                audio.play().catch(e => {
                    console.error("Audio Play Error:", e);
                    setState(prev => ({ ...prev, isPlaying: false }));
                });
            } else if (!state.isPlaying && !audio.paused) {
                audio.pause();
            }
        } else {
            // Waveform mode: mute HTML5 audio or pause it
            if (!audio.paused) {
                audio.pause();
            }
        }
    }, [state.isPlaying, playbackSource, targetItem]);

    // --- TIME UPDATE & AUTO FADE ---
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateState = () => {
            if (playbackSource === 'html5') {
                const t = audio.currentTime;
                
                if (targetItem) {
                    const start = targetItem.trimStart || 0;
                    const end = (targetItem.trimEnd && targetItem.trimEnd > 0) ? targetItem.trimEnd : audio.duration;
                    const fadeDuration = 3; 

                    // 1. Check End
                    if (t >= end - 0.05) {
                        handleTrackEndInternal();
                        return;
                    }

                    // 2. Auto Fade Out
                    if (targetItem.hasFadeOut && end > 0) {
                        const remaining = end - t;
                        const baseVol = volumeRef.current; 

                        if (remaining <= fadeDuration && remaining > 0) {
                            const factor = remaining / fadeDuration; 
                            audio.volume = baseVol * factor;
                        }
                    }
                }

                setState(prev => ({
                    ...prev,
                    currentTime: t,
                    duration: audio.duration || 0
                }));
            }
        };

        const handleEnded = () => {
            if (playbackSource === 'html5') {
                handleTrackEndInternal();
            }
        };

        // Standard events
        audio.addEventListener('timeupdate', updateState);
        audio.addEventListener('loadedmetadata', updateState);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', updateState);
            audio.removeEventListener('loadedmetadata', updateState);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [playbackSource, targetItem, handleTrackEndInternal]);

    // --- EXPOSED CONTROLS ---

    const play = useCallback(() => {
        setState(prev => ({ ...prev, isPlaying: true }));
    }, []);

    const pause = useCallback(() => {
        setState(prev => ({ ...prev, isPlaying: false }));
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    }, []);

    const stop = useCallback(() => {
        setState(prev => ({ ...prev, isPlaying: false }));
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

        if(audioRef.current) {
            audioRef.current.pause();
            if(targetItem) {
                const resetVol = targetItem.customGain || 1.0;
                audioRef.current.volume = resetVol;
                volumeRef.current = resetVol;
                
                // === RESET TO MARK IN (TRIMSTART) ===
                const start = targetItem.trimStart || 0;
                audioRef.current.currentTime = start;
                setState(prev => ({...prev, volume: resetVol, currentTime: start}));
            } else {
                audioRef.current.currentTime = 0;
                setState(prev => ({...prev, currentTime: 0}));
            }
        }
        return (targetItem && targetItem.trimStart) ? targetItem.trimStart : 0;
    }, [targetItem]);

    const seek = useCallback((time: number) => {
        if (targetItem) {
            let target = time;
            const start = targetItem.trimStart || 0;
            const end = (targetItem.trimEnd && targetItem.trimEnd > 0) ? targetItem.trimEnd : (state.duration || 100);
            // Clamp
            target = Math.max(start, Math.min(end, time));
            
            setState(prev => ({ ...prev, currentTime: target }));
            if (audioRef.current) audioRef.current.currentTime = target;
        }
    }, [targetItem, state.duration]);

    const setVolume = useCallback((vol: number) => {
        const clamped = Math.max(0, Math.min(1, vol));
        volumeRef.current = clamped;
        setState(prev => ({ ...prev, volume: clamped }));
        if (audioRef.current) {
            audioRef.current.volume = clamped; 
        }
    }, []);

    const manualFade = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || audio.paused) return;
        
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

        const fadeDuration = 2500; // 2.5s
        const stepTime = 50; 
        const steps = fadeDuration / stepTime;
        const volStep = audio.volume / steps;

        fadeIntervalRef.current = setInterval(() => {
            if (audio.volume > 0.02) {
                audio.volume = Math.max(0, audio.volume - volStep);
            } else {
                audio.volume = 0;
                audio.pause();
                clearInterval(fadeIntervalRef.current);
                setState(prev => ({...prev, isPlaying: false, volume: 0}));
                volumeRef.current = 0;
                handleTrackEndInternal();
            }
        }, stepTime);
    }, [handleTrackEndInternal]);

    const updateState = useCallback((updates: Partial<PlayerState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    const hardReset = useCallback(() => {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        if(audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        currentTrackIdRef.current = null; // Force reset ID tracking
        setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }, []);

    return {
        state,
        controls: {
            play,
            pause,
            stop,
            seek,
            setVolume,
            manualFade,
            updateState,
            hardReset
        },
        audioRef
    };
};