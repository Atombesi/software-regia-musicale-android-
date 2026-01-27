
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Song, SfxItem, AppMode, Language } from './types';
import FileLoader from './components/FileLoader';
import PlaylistView from './components/PlaylistView';
import PlayerControls from './components/PlayerControls';
import Waveform from './components/Waveform';
import NotesPanel from './components/NotesPanel';
import { Scissors, Zap, Wind, MapPin, Save, RefreshCcw, Plus, Minus, PlayCircle, PauseCircle, StickyNote, Edit2, X, Pause, SignalHigh, GripVertical, Wifi, Phone, PhoneCall, PhoneIncoming, Send } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding, FileInfo } from '@capacitor/filesystem';
import { translations } from './translations';
import { 
    formatTimeDetail, 
    parseManualTime, 
    removeExtension,
    isElectron,
    extractFileName,
    formatPathForSaving,
    normalizePath
} from './utils/platformUtils';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { usePlaylistManager } from './hooks/usePlaylistManager';
import { useShowLogger } from './hooks/useShowLogger'; 
import { useRemoteSync } from './hooks/useRemoteSync'; 
import { writeTextFile, readTextFile, addPlaylistToHistory } from './utils/filesystemUtils'; 
import { EstraiName, EstraiPath } from './utils/windowsFileUtils'; 
import { checkLocalAsset } from './utils/androidFileUtils';
import { AppGlobals } from './globals'; 

// --- IMPORT MODALS ---
import ConfirmModal from './components/modals/ConfirmModal';
import SaveSuccessModal from './components/modals/SaveSuccessModal';
import InfoModal from './components/modals/InfoModal';
import SettingsModal from './components/modals/SettingsModal'; 
import RawEditorModal from './components/modals/RawEditorModal';
import NoteModal from './components/modals/NoteModal';
import TimeEditModal from './components/modals/TimeEditModal';
import NetworkModal from './components/modals/NetworkModal';
import ChatModal from './components/modals/ChatModal'; 
import RenameModal from './components/modals/RenameModal';

export const APP_VERSION = "Ver 2.7.1";

const App: React.FC = () => {
  // LANGUAGE STATE
  const [language, setLanguage] = useState<Language>('it');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false); 
  const t = translations[language];

  // --- SETTINGS STATE ---
  const [enableNetwork, setEnableNetwork] = useState(true);
  const [enableBeep, setEnableBeep] = useState(false); 
  const [callTimeout, setCallTimeout] = useState(20);
  
  // NEW V2.4 SECURITY SETTINGS
  const [serverPin, setServerPin] = useState(""); 
  const [clientName, setClientName] = useState("Tablet Remoto"); 
  const [clientPin, setClientPin] = useState(""); 

  // --- GLOBAL FADE SETTINGS ---
  const [globalFadeDuration, setGlobalFadeDuration] = useState<number>(2.5); // Default manual fade

  // Load Settings from LocalStorage
  useEffect(() => {
      try {
          const s = localStorage.getItem('regia_settings');
          if (s) {
              const parsed = JSON.parse(s);
              if (parsed.enableNetwork !== undefined) setEnableNetwork(parsed.enableNetwork);
              if (parsed.enableBeep !== undefined) setEnableBeep(parsed.enableBeep);
              if (parsed.callTimeout !== undefined) setCallTimeout(parsed.callTimeout);
              if (parsed.language) setLanguage(parsed.language);
              
              if (parsed.serverPin !== undefined) setServerPin(parsed.serverPin);
              if (parsed.clientName !== undefined) setClientName(parsed.clientName);
              if (parsed.clientPin !== undefined) setClientPin(parsed.clientPin);
              if (parsed.globalFadeDuration !== undefined) setGlobalFadeDuration(parsed.globalFadeDuration);
          }
      } catch (e) {}
  }, []);

  // Save Settings
  const saveSettings = (updates: any) => {
      const newState = { 
          enableNetwork, enableBeep, callTimeout, language,
          serverPin, clientName, clientPin, globalFadeDuration,
          ...updates 
      };
      localStorage.setItem('regia_settings', JSON.stringify(newState));
  };

  // PLATFORM CHECK FOR RESIZE / HEIGHT
  const [isAndroid, setIsAndroid] = useState(false);
  useEffect(() => {
    setIsAndroid(Capacitor.getPlatform() === 'android');
  }, []);

  // --- RESIZABLE COLUMNS STATE ---
  const [leftPanelWidth, setLeftPanelWidth] = useState(40); // Initial 40%
  const isDragging = useRef(false);

  // --- DRAG HANDLERS ---
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
      isDragging.current = true;
      document.body.style.userSelect = 'none';
  }, []);

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      let clientX;
      if (window.TouchEvent && e instanceof TouchEvent) {
          clientX = e.touches[0].clientX;
      } else if (e instanceof MouseEvent) {
          clientX = e.clientX;
      } else { return; }

      const windowWidth = window.innerWidth;
      const effectiveWidth = isAndroid ? windowWidth : Math.min(windowWidth, windowWidth * 0.8);

      let newWidthPct = (clientX / effectiveWidth) * 100;
      if (newWidthPct < 25) newWidthPct = 25;
      if (newWidthPct > 50) newWidthPct = 50; 
      setLeftPanelWidth(newWidthPct);
  }, [isAndroid]);

  const handleDragEnd = useCallback(() => {
      isDragging.current = false;
      document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
      return () => {
          window.removeEventListener('mousemove', handleDragMove);
          window.removeEventListener('mouseup', handleDragEnd);
          window.removeEventListener('touchmove', handleDragMove);
          window.removeEventListener('touchend', handleDragEnd);
      };
  }, [handleDragMove, handleDragEnd]);

  // --- HOOK: DATA MANAGEMENT ---
  const { state: playlistState, actions: playlistActions } = usePlaylistManager();

  // EDITING STATE
  const [editingSfxIndex, setEditingSfxIndex] = useState<number | null>(null);
  const [playbackSource, setPlaybackSource] = useState<'html5' | 'waveform'>('html5');
  const [appMode, setAppMode] = useState<AppMode>('editing');
  const [showWaveform, setShowWaveform] = useState(true); 
  const [isCompactView, setIsCompactView] = useState(false);
  const [activeSfxIndices, setActiveSfxIndices] = useState<Set<number>>(new Set());
  const activeSfxAudioRefs = useRef<{[index: number]: HTMLAudioElement}>({});
  const [lastExplorerPath, setLastExplorerPath] = useState<string>('');

  // --- LOGGER HOOK ---
  const { logEvent } = useShowLogger({
      appMode,
      playlistFileName: playlistState.sourceFileName,
      playlistPath: playlistState.sourceFilePath,
      playlistDirectory: playlistState.sourceDirectory
  });

  // --- LOG FILE EXISTENCE STATE ---
  const [logFileExists, setLogFileExists] = useState(false);
  
  // --- TIMER STATE ---
  const showStartTimeRef = useRef<number | null>(null);
  const [showStartTime, setShowStartTime] = useState<number | null>(null); // State synced with ref for UI
  const [showEndTime, setShowEndTime] = useState<number | null>(null);
  
  const trackStartTimeRef = useRef<number | null>(null);

  const checkLogFileExistence = async () => {
      const logPath = AppGlobals.Playlistpath;
      const logFileName = "Log_" + AppGlobals.Playlistfilename;
      
      if (!logPath || !AppGlobals.Playlistfilename) {
          setLogFileExists(false);
          return;
      }
      
      let fullLogPath = logPath;
      if (fullLogPath && !fullLogPath.endsWith('/') && !fullLogPath.endsWith('\\')) {
           fullLogPath += '/';
      }
      fullLogPath += logFileName;

      if (isAndroid) {
          try {
             await Filesystem.stat({
                 path: logFileName, 
                 directory: playlistState.sourceDirectory 
             });
             setLogFileExists(true);
          } catch {
             setLogFileExists(false);
          }
      } else {
          if (window.electronAPI && window.electronAPI.exists) {
              const exists = await window.electronAPI.exists(fullLogPath);
              setLogFileExists(exists);
          } else {
              setLogFileExists(false);
          }
      }
  };

  // --- HELPER: FORMAT TRACK DETAILS ---
  const getTrackDetails = (item: Song | SfxItem) => {
      const vol = Math.round((item.customGain || 1.0) * 100);
      const markIn = item.trimStart ? formatTimeDetail(item.trimStart) : "0";
      const markOut = item.trimEnd ? formatTimeDetail(item.trimEnd) : "End";
      const fade = item.hasFadeOut ? `SI (${item.fadeOutDuration || 5}s)` : "NO";
      return `(mark-in: ${markIn}; mark-out: ${markOut}; fade: ${fade}; volume: ${vol}%)`;
  };

  // PICKER MODAL STATE
  const [pickerState, setPickerState] = useState<{isOpen: boolean; target: 'track' | 'sfx' | 'relink' | 'save' | 'save_config'; index?: number}>({isOpen: false, target: 'track'});

  // Modals
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; action: () => void; confirmText?: string; cancelText?: string}>({isOpen: false, title: '', message: '', action: () => {}});
  const [saveSuccessModal, setSaveSuccessModal] = useState({ isOpen: false, location: '', fileName: '' });
  const [timeEditModal, setTimeEditModal] = useState<{isOpen: boolean; type: 'start'|'end'|'duration'|'fade_auto'|'fade_manual'|null; value: number}>({isOpen: false, type: null, value: 0});
  const [noteModalOpen, setNoteModalOpen] = useState(false); 
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [rawEditorOpen, setRawEditorOpen] = useState(false);
  const [logViewerOpen, setLogViewerOpen] = useState(false); 
  const [networkModalOpen, setNetworkModalOpen] = useState(false);
  
  // NEW: Rename Modal State
  const [renameModal, setRenameModal] = useState<{isOpen: boolean, index: number, name: string}>({isOpen: false, index: -1, name: ''});

  const [logContent, setLogContent] = useState(""); 
  const [pendingSaveContent, setPendingSaveContent] = useState<string | null>(null);
  
  // STATE: Store remote master path for download
  const [remoteMasterPath, setRemoteMasterPath] = useState<string | undefined>(undefined);

  const waveSeekRequestRef = useRef<number | null>(null);
  const localSaveBtnRef = useRef<HTMLButtonElement>(null);
  const windowsFileInputRef = useRef<HTMLInputElement>(null); 
  
  const editingTarget = editingSfxIndex !== null 
      ? playlistState.sfxItems[editingSfxIndex] 
      : playlistState.songs[playlistState.currentIndex];
      
  const hasTarget = !!editingTarget && (!!editingTarget.url || (editingTarget as Song).type === 'separator');

  // ===========================================================================
  //  CHAT & CALL LOGIC
  // ===========================================================================
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected'>('idle');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPinned, setChatPinned] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ text: string, sender?: string, isMe: boolean, time: number }[]>([]);
  const callTimerRef = useRef<any>(null);
  const ringIntervalRef = useRef<any>(null);

  // ===========================================================================
  //  NOTES PINNING LOGIC
  // ===========================================================================
  const [notesPinned, setNotesPinned] = useState(false);

  const playPhoneRing = () => {
     if (!enableBeep) return;
     try {
         const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
         const t = ctx.currentTime;
         const osc = ctx.createOscillator();
         const gain = ctx.createGain();
         osc.connect(gain);
         gain.connect(ctx.destination);
         osc.type = 'sine';
         osc.frequency.setValueAtTime(600, t);
         osc.frequency.exponentialRampToValueAtTime(800, t + 0.1); 
         osc.frequency.setValueAtTime(600, t + 0.2);
         osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);
         gain.gain.setValueAtTime(0, t);
         gain.gain.linearRampToValueAtTime(0.5, t + 0.05);
         gain.gain.setValueAtTime(0.5, t + 0.35);
         gain.gain.linearRampToValueAtTime(0, t + 0.4);
         osc.start(t);
         osc.stop(t + 0.5);
     } catch (e) { console.error("Ring Error", e); }
  };

  const startRinging = useCallback(() => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      playPhoneRing();
      ringIntervalRef.current = setInterval(playPhoneRing, 3000);
  }, [enableBeep]);

  const stopRinging = useCallback(() => {
      if (ringIntervalRef.current) {
          clearInterval(ringIntervalRef.current);
          ringIntervalRef.current = null;
      }
  }, []);

  useEffect(() => {
      if (callStatus === 'ringing') {
          startRinging();
      } else {
          stopRinging();
      }
      return () => stopRinging();
  }, [callStatus, startRinging, stopRinging]);

  const handleChatAction = useCallback((action: 'CALL' | 'ANSWER' | 'END' | 'SEND', payload?: string) => {}, []);

  const clearCallTimer = () => {
      if (callTimerRef.current) {
          clearTimeout(callTimerRef.current);
          callTimerRef.current = null;
      }
  };

  const handleTrackEnd = useCallback(() => {
      if (appMode === 'presentation' && trackStartTimeRef.current) {
          const durationMs = Date.now() - trackStartTimeRef.current;
          const min = Math.floor(durationMs / 60000);
          const sec = Math.floor((durationMs % 60000) / 1000);
          logEvent(`termine traccia ${playlistState.currentIndex + 1}`, `[${min}' ${sec}"]`);
          trackStartTimeRef.current = null;

          if (playlistState.currentIndex >= playlistState.songs.length - 1) {
              if (showStartTimeRef.current) {
                   const totalMs = Date.now() - showStartTimeRef.current;
                   const h = Math.floor(totalMs / 3600000);
                   const m = Math.floor((totalMs % 3600000) / 60000);
                   const s = Math.floor((totalMs % 60000) / 1000);
                   logEvent("termine Scaletta-Fine spettacolo", `Durata totale: [${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}]`);
                   
                   // FREEZE TIMER
                   setShowEndTime(Date.now());
              } else {
                   logEvent("termine Scaletta-Fine spettacolo", "");
              }
          }
      }

      if (editingSfxIndex === null) {
          const currentId = playlistState.songs[playlistState.currentIndex]?.id;
          if (currentId) playlistActions.markAsPlayed(currentId);
          if (appMode === 'presentation') {
               playlistActions.nextSong();
          }
      } 
  }, [appMode, playlistState.currentIndex, playlistState.songs, editingSfxIndex, playlistActions, logEvent]);

  // --- USE AUDIO PLAYER HOOK ---
  const { state: playerState, controls: audioControls, audioRef } = useAudioPlayer({
      targetItem: editingTarget,
      playbackSource: playbackSource,
      onTrackEnd: handleTrackEnd,
      isAndroid
  });

  const performPlay = useCallback((source: 'local' | 'remote' = 'local') => {
      if (hasTarget && (editingTarget as Song).type !== 'separator') {
          if (appMode === 'presentation' && editingSfxIndex === null) {
               if (playlistState.currentIndex === 0 && !showStartTimeRef.current) {
                   const now = Date.now();
                   showStartTimeRef.current = now;
                   // START TIMER
                   setShowStartTime(now);
                   setShowEndTime(null);
                   
                   logEvent("Inizio Spettacolo", "(Ho premuto play sulla prima traccia)", false, source === 'remote' ? "[client]" : "");
               }
               trackStartTimeRef.current = Date.now();
               const song = playlistState.songs[playlistState.currentIndex];
               if (song) {
                   logEvent(`avvio traccia ${playlistState.currentIndex + 1}`, `${song.title}; ${getTrackDetails(song)}`, false, source === 'remote' ? "[client]" : "");
               }
          }
          setPlaybackSource('html5');
          audioControls.play();
      }
  }, [hasTarget, editingTarget, appMode, editingSfxIndex, playlistState.currentIndex, playlistState.songs, logEvent, audioControls]);

  const performPause = useCallback((source: 'local' | 'remote' = 'local') => {
      if (appMode === 'presentation' && editingSfxIndex === null) {
          logEvent(`Traccia ${playlistState.currentIndex + 1}`, "Messa in Pausa", false, source === 'remote' ? "[client]" : "");
      }
      audioControls.pause();
  }, [appMode, editingSfxIndex, playlistState.currentIndex, logEvent, audioControls]);

  const performStop = useCallback((source: 'local' | 'remote' = 'local') => {
      if (appMode === 'presentation' && playerState.isPlaying && editingSfxIndex === null) {
          logEvent(`Traccia ${playlistState.currentIndex + 1}`, "Interrotta (STOP)", false, source === 'remote' ? "[client]" : "");
      }
      const startTime = audioControls.stop();
      if (appMode === 'presentation') {
           if (editingSfxIndex === null && playlistState.currentIndex < playlistState.songs.length) {
               playlistActions.nextSong();
           }
      } else {
           waveSeekRequestRef.current = startTime;
           setTimeout(() => { waveSeekRequestRef.current = null; }, 50);
      }
  }, [appMode, playerState.isPlaying, editingSfxIndex, playlistState.currentIndex, playlistState.songs.length, logEvent, audioControls, playlistActions]);

  const performManualFade = useCallback((source: 'local' | 'remote' = 'local') => {
      if (appMode === 'presentation' && editingSfxIndex === null) {
          logEvent(`Traccia ${playlistState.currentIndex + 1}`, `Fade manuale (${globalFadeDuration}s)`, false, source === 'remote' ? "[client]" : "");
      }
      // Pass stored global fade duration (in ms) to player
      audioControls.manualFade(globalFadeDuration * 1000);
  }, [appMode, editingSfxIndex, playlistState.currentIndex, logEvent, audioControls, globalFadeDuration]);

  const performNext = useCallback(() => {
      if (editingSfxIndex !== null) return;
      if (playlistActions.nextSong()) {
          audioControls.pause();
      }
  }, [editingSfxIndex, playlistActions, audioControls]);

  const performPrev = useCallback(() => {
      if (editingSfxIndex !== null) return;
      if (playlistActions.prevSong()) {
          audioControls.pause();
      }
  }, [editingSfxIndex, playlistActions, audioControls]);

  const performVolumeChange = useCallback((vol: number) => {
      audioControls.setVolume(vol);
  }, [audioControls]);

  const performReset = useCallback((source: 'local' | 'remote' = 'local') => {
      playlistActions.resetShow();
      setEditingSfxIndex(null);
      audioControls.hardReset();
      
      // FIX: Ensure reset handles separators correctly
      // Find first non-separator song
      const firstAudioIndex = playlistState.songs.findIndex(s => s.type !== 'separator');
      const firstSong = firstAudioIndex >= 0 ? playlistState.songs[firstAudioIndex] : null;

      if(firstSong) {
          const resetVol = firstSong.customGain || 1.0;
          if (audioRef.current) {
              audioRef.current.volume = resetVol;
              const start = firstSong.trimStart || 0;
              audioRef.current.currentTime = start;
              audioControls.updateState({ currentTime: start });
          }
          audioControls.setVolume(resetVol);
      }
      // RESET TIMER
      showStartTimeRef.current = null;
      setShowStartTime(null);
      setShowEndTime(null);
      
      logEvent("Reset", "(Show Reset)", true, source === 'remote' ? "[client]" : "");
  }, [playlistActions, audioControls, playlistState.songs, logEvent]);

  const sfxItemsRef = useRef(playlistState.sfxItems);
  useEffect(() => { sfxItemsRef.current = playlistState.sfxItems; }, [playlistState.sfxItems]);

  const performSfxPlay = useCallback((index: number, source: 'local' | 'remote' = 'local') => {
      if (editingSfxIndex === index) {
          if (playerState.isPlaying) performPause(source);
          else performPlay(source);
          return;
      }
      if (activeSfxAudioRefs.current[index]) {
          const audio = activeSfxAudioRefs.current[index];
          audio.pause();
          audio.currentTime = 0;
          delete activeSfxAudioRefs.current[index];
          setActiveSfxIndices(prev => {
              const next = new Set(prev);
              next.delete(index);
              return next;
          });
          return;
      }
      const item = sfxItemsRef.current[index];
      if (item && item.url) {
          if (appMode === 'presentation') {
               logEvent(`Esecuzione effetto ${index + 1}`, `${item.label}; ${getTrackDetails(item)}`, false, source === 'remote' ? "[client]" : "");
          }
          const audio = new Audio(item.url);
          audio.volume = item.customGain || 1;
          if (item.trimStart) audio.currentTime = item.trimStart;
          audio.onended = () => {
              delete activeSfxAudioRefs.current[index];
              setActiveSfxIndices(prev => {
                  const next = new Set(prev);
                  next.delete(index);
                  return next;
              });
          };
          audio.play().then(() => {
              activeSfxAudioRefs.current[index] = audio;
              setActiveSfxIndices(prev => new Set(prev).add(index));
          }).catch(e => console.error("SFX Error", e));
      }
  }, [editingSfxIndex, playerState.isPlaying, performPause, performPlay, appMode, logEvent]);

  const handleRemoteCommand = useCallback((cmd: any) => {
      if (cmd.type === 'PLAY') performPlay('remote');
      else if (cmd.type === 'PAUSE') performPause('remote');
      else if (cmd.type === 'STOP') performStop('remote');
      else if (cmd.type === 'NEXT') performNext();
      else if (cmd.type === 'PREV') performPrev();
      else if (cmd.type === 'FADE') performManualFade('remote');
      else if (cmd.type === 'SFX') performSfxPlay(cmd.index, 'remote');
      else if (cmd.type === 'SET_VOLUME') performVolumeChange(cmd.value);
      else if (cmd.type === 'SET_MODE') {
          const newMode = cmd.value === 'presentation' ? 'presentation' : 'editing';
          setAppMode(newMode);
          if (newMode === 'presentation') {
               setEditingSfxIndex(null);
               setPlaybackSource('html5');
               logEvent("LIVE_MODE_START", "Switch to Live (from Client)", true, "[client]");
               performStop('remote'); 
          } else {
               performStop('remote');
          }
      } else if (cmd.type === 'SELECT_SONG') {
          playlistActions.setCurrentIndex(cmd.index);
          setEditingSfxIndex(null);
          performPause('remote');
      } else if (cmd.type === 'RESET') performReset('remote');
      else if (cmd.type === 'UPDATE_SONG') {
          // FIX BUG: Prevent Client URLs from corrupting Server Paths
          if (cmd.isSfx) {
              const oldItem = playlistState.sfxItems[cmd.index];
              playlistActions.updateSfx(cmd.index, {
                  ...cmd.data,
                  // Keep server-side paths
                  url: oldItem?.url || cmd.data.url,
                  path: oldItem?.path || cmd.data.path,
                  originalFileName: oldItem?.originalFileName || cmd.data.originalFileName
              });
          } else {
              playlistActions.updateSong(cmd.index, (s) => ({ 
                  ...s, 
                  ...cmd.data,
                  // Force keep server-side paths
                  url: s.url,
                  path: s.path,
                  originalFileName: s.originalFileName
              }));
          }
      } else if (cmd.type === 'SAVE_PLAYLIST') {
          const content = playlistActions.generatePlaylistContent();
          const path = playlistState.sourceFilePath;
          const name = playlistState.sourceFileName;
          const dir = playlistState.sourceDirectory;
          if (path && name) {
               writeTextFile(path, name, content, dir)
                   .then(async () => {
                       await addPlaylistToHistory(name, path);
                       playlistActions.markAsSaved(); // Reset dirty state on remote save
                   })
                   .catch(e => console.error("Silent save failed", e));
          }
      }
  }, [performPlay, performPause, performStop, performNext, performPrev, performManualFade, performSfxPlay, performVolumeChange, playlistActions, logEvent, performReset, playlistState.sourceFilePath, playlistState.sourceFileName, playlistState.sourceDirectory, playlistState.sfxItems]);

  const checkAssetsForPlaylist = async (items: any[]) => {
      if (!isAndroid) return items;
      const processed = await Promise.all(items.map(async (item) => {
          if (!item) return item;
          // Skip separators for asset checking
          if (item.type === 'separator') return item;
          
          if (item.originalFileName) {
              const localUri = await checkLocalAsset(item.originalFileName);
              if (localUri) return { ...item, url: localUri };
          }
          return item;
      }));
      return processed;
  };

  const handleRemotePlaylist = useCallback(async (songs: Song[], sfx: SfxItem[], masterPath?: string) => {
      const processedSongs = await checkAssetsForPlaylist(songs);
      const processedSfx = await checkAssetsForPlaylist(sfx);
      playlistActions.loadPlaylist(processedSongs, processedSfx, "Remote Playlist", "/remote", undefined, true); // Treated as new load -> saved state
      setAppMode('presentation'); 
      if (masterPath) setRemoteMasterPath(masterPath);
  }, [playlistActions]);

  const handleRemoteState = useCallback((state: any) => {
      audioControls.updateState({
          currentTime: state.currentTime,
          isPlaying: state.isPlaying,
          volume: state.volume 
      });
      if (state.currentIndex !== undefined && state.currentIndex !== playlistState.currentIndex) {
          playlistActions.setCurrentIndex(state.currentIndex);
          setEditingSfxIndex(null);
      }
      if (state.appMode && state.appMode !== appMode) {
          setAppMode(state.appMode);
      }

      // --- SYNC SHOW TIMER (SLAVE LOGIC) ---
      if (state.showDuration !== undefined) {
          if (state.showDuration !== null) {
              // Show is running (or paused/ended). We receive "ElapsedTime".
              // Calculate local start time to drive the local Timer interval
              const derivedStart = Date.now() - state.showDuration;
              
              // Only update if unset or significantly drifted (>1s) to avoid jitter
              if (!showStartTimeRef.current || Math.abs(showStartTimeRef.current - derivedStart) > 1000) {
                  showStartTimeRef.current = derivedStart;
                  setShowStartTime(derivedStart);
              }

              // Check if show ended (Freeze Timer)
              if (state.isShowEnded) {
                  setShowEndTime(Date.now()); // Sets local end time to freeze display
              } else {
                  setShowEndTime(null);
              }
          } else {
              // Server sent reset (null)
              showStartTimeRef.current = null;
              setShowStartTime(null);
              setShowEndTime(null);
          }
      }
  }, [audioControls, playlistActions, playlistState.currentIndex, appMode]);

  const handleRemoteChat = useCallback((type: string, payload?: any, sender?: string) => {
      if (type === 'CHAT_CALL_REQ') {
          if (callStatus === 'idle') {
              setCallStatus('ringing');
              setIsChatOpen(true);
              // --- AUTO PIN LOGIC FOR DESKTOP ---
              if (!isAndroid && notesPinned) setChatPinned(true);
              
              clearCallTimer();
              callTimerRef.current = setTimeout(() => {
                  setCallStatus('idle');
                  if (!chatPinned) setIsChatOpen(false); 
              }, callTimeout * 1000);
          }
      } else if (type === 'CHAT_CALL_ACC') {
          clearCallTimer();
          setCallStatus('connected');
          setIsChatOpen(true);
          // CHAT HISTORY IS NOW PERSISTED
          // --- AUTO PIN LOGIC FOR DESKTOP ---
          if (!isAndroid && notesPinned) setChatPinned(true);
      } else if (type === 'CHAT_CALL_END') {
          clearCallTimer();
          setCallStatus('idle');
          if (!chatPinned) setIsChatOpen(false);
      } else if (type === 'CHAT_CHAT_MSG') {
          if (callStatus === 'connected') {
              setIsChatOpen(true); 
              // --- AUTO PIN LOGIC FOR DESKTOP ---
              if (!isAndroid && notesPinned) setChatPinned(true);
              
              if (payload) {
                  setChatMessages(prev => [...prev, { text: payload, isMe: false, sender: sender, time: Date.now() }]);
              }
          }
      }
  }, [callStatus, callTimeout, chatPinned, notesPinned, isAndroid]);

  const remoteSync = useRemoteSync(
      handleRemoteCommand, 
      handleRemotePlaylist, 
      handleRemoteState,
      handleRemoteChat
  );
  
  // --- ADDED: FORCE CLOSE CHAT IF DISCONNECTED ---
  useEffect(() => {
      if (remoteSync.status !== 'connected') {
          setIsChatOpen(false);
          setCallStatus('idle');
      }
  }, [remoteSync.status]);
  
  // --- MASTER BROADCAST LOOP ---
  useEffect(() => {
      if (remoteSync.role === 'master') {
          const interval = setInterval(() => {
              // Calculate Duration to send to clients
              const currentDuration = showStartTimeRef.current 
                  ? (showEndTime || Date.now()) - showStartTimeRef.current 
                  : null;

              remoteSync.broadcastState({
                  currentTime: playerState.currentTime,
                  isPlaying: playerState.isPlaying,
                  currentIndex: playlistState.currentIndex,
                  volume: playerState.volume, 
                  appMode: appMode,
                  // SYNC INFO
                  showDuration: currentDuration,
                  isShowEnded: !!showEndTime
              });
          }, 200); 
          return () => clearInterval(interval);
      }
  }, [remoteSync.role, playerState.isPlaying, playerState.currentTime, playerState.volume, playlistState.currentIndex, appMode, showEndTime]);

  useEffect(() => {
      if (remoteSync.role === 'master' && remoteSync.clientCount > 0 && playlistState.songs.length > 0) {
          remoteSync.sendPlaylist(playlistState.songs, playlistState.sfxItems, playlistState.sourceFilePath || undefined);
      }
  }, [remoteSync.clientCount, remoteSync.role, playlistState.songs, playlistState.sfxItems, playlistState.sourceFilePath]);

  const handleStartCall = () => {
      if (callStatus === 'idle') {
          setCallStatus('calling');
          setIsChatOpen(true); 
          
          // --- AUTO PIN LOGIC FOR DESKTOP ---
          if (!isAndroid && notesPinned) setChatPinned(true);

          remoteSync.sendChatCommand('CALL_REQ');
          clearCallTimer();
          callTimerRef.current = setTimeout(() => {
              setCallStatus('idle');
              remoteSync.sendChatCommand('CALL_END'); 
          }, callTimeout * 1000);
      }
  };

  const handleAnswerCall = () => {
      if (callStatus === 'ringing') {
          clearCallTimer();
          setCallStatus('connected');
          // CHAT HISTORY IS NOW PERSISTED
          remoteSync.sendChatCommand('CALL_ACC');
      }
  };

  const handleEndCall = () => {
      clearCallTimer();
      setCallStatus('idle');
      // If pinned, we might keep it open, but for now we close unless pinned logic is specific
      if (!chatPinned) setIsChatOpen(false);
      remoteSync.sendChatCommand('CALL_END');
  };

  // --- NEW: HANDLE LOCAL WINDOW CLOSE ---
  const handleCloseChatWindow = () => {
      setIsChatOpen(false);
      // FIX: Force Unpin if user closes the chat explicitly
      if (chatPinned) {
          setChatPinned(false);
          // Also handle layout resizing if notes aren't pinned
          if (!notesPinned) setLeftPanelWidth(40);
      }
  };

  const handleSendChatMessage = (text: string) => {
      setChatMessages(prev => [...prev, { text, isMe: true, time: Date.now() }]);
      remoteSync.sendChatCommand('CHAT_MSG', text);
  };

  // --- READ ONLY CHECK ---
  const isControlsDisabled = remoteSync.isReadOnly;

  // --- RELOAD / REMAP ASSETS HANDLER ---
  // UPDATED: Now accepts optional remapped lists for Windows Client Logic
  const handleReloadAssets = (remappedSongs?: Song[], remappedSfx?: SfxItem[]) => {
     if (remappedSongs || remappedSfx) {
         // LOCAL REMAP MODE (WINDOWS)
         // Directly update the playlist in memory with the new local paths
         playlistActions.loadPlaylist(
             remappedSongs || playlistState.songs, 
             remappedSfx || playlistState.sfxItems, 
             "Remote Playlist (Local)", 
             undefined, 
             undefined, 
             true
         );
         // Keep app in presentation mode
         setAppMode('presentation');
     } else if (remoteSync.role === 'slave' && remoteMasterPath) {
          // REMOTE RELOAD MODE (ANDROID/DEFAULT)
          handleRemotePlaylist(playlistState.songs, playlistState.sfxItems, remoteMasterPath);
     }
  };

  const requestMainPlay = () => {
      if (isControlsDisabled) return; // BLOCKED
      if (remoteSync.role === 'slave') {
          remoteSync.sendMasterCommand({ type: 'PLAY' });
          audioControls.updateState({ isPlaying: true });
      } else {
          performPlay('local');
      }
  };

  const requestPause = () => {
      if (isControlsDisabled) return; // BLOCKED
      if (remoteSync.role === 'slave') {
          remoteSync.sendMasterCommand({ type: 'PAUSE' });
          audioControls.updateState({ isPlaying: false });
      } else {
          performPause('local');
      }
  };

  const requestStop = () => {
      if (isControlsDisabled) return; // BLOCKED
      if (remoteSync.role === 'slave') {
          remoteSync.sendMasterCommand({ type: 'STOP' });
          audioControls.updateState({ isPlaying: false, currentTime: 0 });
      } else {
          performStop('local');
      }
  };

  const requestNext = () => {
      if (isControlsDisabled) return; // BLOCKED
      if (remoteSync.role === 'slave') remoteSync.sendMasterCommand({ type: 'NEXT' });
      else performNext();
  };

  const requestPrev = () => {
      if (isControlsDisabled) return; // BLOCKED
      if (remoteSync.role === 'slave') remoteSync.sendMasterCommand({ type: 'PREV' });
      else performPrev();
  };

  const requestManualFade = () => {
      if (isControlsDisabled) return; // BLOCKED
      if (remoteSync.role === 'slave') remoteSync.sendMasterCommand({ type: 'FADE' });
      else performManualFade('local');
  };

  const requestVolumeChange = (vol: number) => {
      if (isControlsDisabled) return; // BLOCKED
      if (remoteSync.role === 'slave') {
          audioControls.setVolume(vol); 
          remoteSync.sendMasterCommand({ type: 'SET_VOLUME', value: vol });
      } else {
          performVolumeChange(vol);
      }
  };

  const requestSfxPlay = (index: number) => {
      if (isControlsDisabled) return; // BLOCKED
      if (appMode === 'editing') {
          const item = playlistState.sfxItems[index];
          if (!item || !item.url) {
              handleOpenPicker('sfx', index);
          } else {
              setEditingSfxIndex(index);
              performStop('local'); 
          }
          return;
      }
      if (remoteSync.role === 'slave') remoteSync.sendMasterCommand({ type: 'SFX', index });
      else performSfxPlay(index, 'local');
  };

  const requestSongSelect = (idx: number) => {
      if (isControlsDisabled) return; // BLOCKED
      if (remoteSync.role === 'slave') remoteSync.sendMasterCommand({ type: 'SELECT_SONG', index: idx });
      else {
          playlistActions.setCurrentIndex(idx); 
          setEditingSfxIndex(null); 
          performPause('local'); 
      }
  };

  const requestReset = () => {
      if (isControlsDisabled) return; // BLOCKED
      setConfirmModal({
          isOpen: true, 
          title: t.reset_show, 
          message: t.reset_show_msg,
          confirmText: t.btn_confirm,
          cancelText: t.btn_cancel,
          action: () => {
              if (remoteSync.role === 'slave') remoteSync.sendMasterCommand({ type: 'RESET' });
              else performReset('local');
              setConfirmModal(prev => ({...prev, isOpen: false}));
          }
      });
  };

  const handleEditorPlay = () => {
      if (hasTarget) {
          setPlaybackSource('waveform');
          audioControls.play(); 
      }
  };

  const handleSeek = (time: number) => {
      if (remoteSync.role === 'slave') return; // Slave cannot seek freely except visually
      audioControls.seek(time);
      waveSeekRequestRef.current = time; 
      setTimeout(() => { waveSeekRequestRef.current = null; }, 100);
  };

  const requestPlayPauseAction = useCallback(() => {
      if (isControlsDisabled) return;
      if (playerState.isPlaying && playbackSource === 'html5') requestPause();
      else requestMainPlay();
  }, [playerState.isPlaying, playbackSource, requestPause, requestMainPlay, isControlsDisabled]);

  const requestPlayPauseRef = useRef(requestPlayPauseAction);
  useEffect(() => { requestPlayPauseRef.current = requestPlayPauseAction; }, [requestPlayPauseAction]);
  const requestSfxPlayRef = useRef(requestSfxPlay);
  useEffect(() => { requestSfxPlayRef.current = requestSfxPlay; }, [requestSfxPlay]);

  useEffect(() => {
      if (isAndroid) return;
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
          const num = parseInt(e.key);
          if (!isNaN(num)) {
              if (num >= 1 && num <= 3) requestSfxPlayRef.current(num - 1);
              else if (num >= 7 && num <= 9) requestSfxPlayRef.current(num - 4);
          }
          if (e.code === 'Space') {
              e.preventDefault();
              requestPlayPauseRef.current();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAndroid]);

  const updateTargetItem = (updater: (item: Song | SfxItem) => Song | SfxItem) => {
      if (editingSfxIndex !== null) playlistActions.updateSfx(editingSfxIndex, updater(playlistState.sfxItems[editingSfxIndex]) as SfxItem);
      else playlistActions.updateSong(playlistState.currentIndex, (s) => updater(s) as Song);
  };

  // --- NEW FADE TOGGLE HANDLER ---
  const handleToggleFade = () => {
      if (!editingTarget) return;
      
      // If currently ON, turn OFF
      if (editingTarget.hasFadeOut) {
          updateTargetItem(i => ({...i, hasFadeOut: false}));
      } else {
          // If currently OFF, open Modal to ask duration (Default 5s)
          setTimeEditModal({ 
              isOpen: true, 
              type: 'fade_auto', 
              value: 5 // Default proposed value
          });
      }
  };

  const handlePlaylistLoaded = (newSongs: Song[], newSfx: SfxItem[], fileName?: string, path?: string, directory?: Directory, fromDisk: boolean = true) => {
    audioControls.hardReset();
    if (audioRef.current) audioRef.current.src = "";
    // RESET TIMER ON LOAD
    showStartTimeRef.current = null;
    setShowStartTime(null);
    setShowEndTime(null);
    trackStartTimeRef.current = null;
    
    setEditingSfxIndex(null); 
    if (path) {
         const norm = path.replace(/\\/g, '/');
         const lastSlash = norm.lastIndexOf('/');
         if (lastSlash !== -1) setLastExplorerPath(norm.substring(0, lastSlash));
    }
    AppGlobals.Fullname = path || "";
    AppGlobals.Playlistfilename = fileName || "";
    if (path) {
         const norm = path.replace(/\\/g, '/');
         const lastSlash = norm.lastIndexOf('/');
         if (lastSlash !== -1) AppGlobals.Playlistpath = norm.substring(0, lastSlash + 1); 
         else AppGlobals.Playlistpath = "";
    } else {
        AppGlobals.Playlistpath = "";
    }
    AppGlobals.PlaylistLog = AppGlobals.Playlistpath + "Log_" + AppGlobals.Playlistfilename;
    playlistActions.loadPlaylist(newSongs, newSfx, fileName, path, directory, fromDisk);
    if (remoteSync.role === 'master' && remoteSync.clientCount > 0) {
        remoteSync.sendPlaylist(newSongs, newSfx, path || undefined);
    }
    checkLogFileExistence();
  };

  const handleLoadSingle = (file: File) => {
      const newSong: Song = { id: `manual-${Date.now()}`, title: removeExtension(file.name), url: URL.createObjectURL(file), artist: 'Manual Load', originalFileName: file.name, type: 'audio' };
      audioControls.hardReset();
      setEditingSfxIndex(null);
      playlistActions.loadPlaylist([newSong], new Array(6).fill(undefined), undefined, undefined, undefined, false); // Manual load = Dirty
      playlistActions.setSourceFilePath(null);
  };

  // --- NEW SEPARATOR HANDLER ---
  const handleAddSeparator = (label: string) => {
      if (remoteSync.role === 'slave') return;
      
      const newSep: Song = {
          id: `sep-${Date.now()}`,
          title: label,
          url: '',
          type: 'separator',
          path: '',
          originalFileName: ''
      };
      
      playlistActions.addSong(newSep);
  };


  const handleOpenPicker = (target: 'track' | 'sfx' | 'relink', index?: number) => {
      if (remoteSync.role === 'slave') {
          alert("I Brani musicali ed effetti sono modificabili solo dal Server (Regia).");
          return;
      }
      if (!isAndroid && (target === 'track' || target === 'sfx' || target === 'relink')) {
          setPickerState({ isOpen: false, target, index }); 
          setTimeout(() => {
              if (windowsFileInputRef.current) {
                  windowsFileInputRef.current.value = ''; 
                  windowsFileInputRef.current.click();
              }
          }, 50);
      } else {
          setPickerState({ isOpen: true, target, index });
      }
  };

  const handlePickerSelect = (fileInfo: FileInfo, resolvedUrl: string, fullPath: string) => {
      const target = pickerState.target;
      const index = pickerState.index;
      if (target === 'save' || target === 'save_config') return;
      if (target === 'track') {
          const newSong: Song = { 
              id: `added-${Date.now()}`, 
              title: removeExtension(fileInfo.name), 
              url: resolvedUrl, 
              path: fullPath,
              artist: 'Added Track', 
              originalFileName: fileInfo.name,
              type: 'audio'
          };
          playlistActions.addSong(newSong);
      } else if (target === 'sfx' && index !== undefined) {
          const newSfx: SfxItem = {
                  id: `sfx-${Date.now()}`,
                  label: removeExtension(fileInfo.name).substring(0, 10),
                  url: resolvedUrl,
                  path: fullPath,
                  originalFileName: fileInfo.name,
                  trimStart: 0, trimEnd: 0, hasFadeOut: false, customGain: 1.0
          };
          playlistActions.updateSfx(index, newSfx);
      } else if (target === 'relink' && index !== undefined) {
           playlistActions.updateSong(index, (old) => ({
                ...old,
                url: resolvedUrl,
                path: fullPath,
                originalFileName: fileInfo.name,
                // FIX: Reset Metadata on Relink
                title: removeExtension(fileInfo.name),
                trimStart: 0,
                trimEnd: 0,
                customGain: 1.0,
                hasFadeOut: false
           }));
      }
      setPickerState(prev => ({ ...prev, isOpen: false }));
  };

  const handleWindowsFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          const electronPath = (file as any).path;
          const fullPath = electronPath || file.name;
          const url = electronPath ? `file:///${electronPath.replace(/\\/g, '/')}` : URL.createObjectURL(file);
          const fileInfo: FileInfo = { name: file.name, type: 'file', size: file.size, mtime: file.lastModified, uri: '' };
          handlePickerSelect(fileInfo, url, fullPath);
          e.target.value = ''; 
      }
  };

  const handleRequestSavePlaylist = () => {
      if (remoteSync.role === 'slave') {
          remoteSync.sendMasterCommand({ type: 'SAVE_PLAYLIST' });
          return;
      }
      
      const currentFull = playlistState.sourceFilePath || '';
      
      // FIX: Ensure FileLoader opens in the current file's directory
      // This fixes the issue where Quick Save generated a filename-only path
      if (currentFull) {
           const dir = EstraiPath(currentFull); // Utility from windowsFileUtils handles slashes
           if (dir) {
               setLastExplorerPath(dir);
           }
      }

      AppGlobals.Fullname = currentFull;
      AppGlobals.Playlistpath = EstraiPath(currentFull);
      if (AppGlobals.Playlistpath && !AppGlobals.Playlistpath.endsWith('/') && !AppGlobals.Playlistpath.endsWith('\\')) {
           AppGlobals.Playlistpath += '/';
      }
      AppGlobals.Playlistfilename = EstraiName(currentFull);
      AppGlobals.PlaylistLog = AppGlobals.Playlistpath + "Log_" + AppGlobals.Playlistfilename;
      
      setPickerState({ isOpen: true, target: 'save' });
  };

  const handleLoadNewRequest = () => {
      setConfirmModal({
          isOpen: true, 
          title: t.load_new_title, 
          message: t.load_new_msg,
          confirmText: t.btn_confirm,
          cancelText: t.btn_cancel,
          action: () => {
              playlistActions.clearPlaylist(); 
              setConfirmModal(prev => ({...prev, isOpen: false}));
          }
      });
  };

  const handleSaveFromLoader = async (fileName: string, fullPath: string, directory: Directory) => {
      const content = pendingSaveContent !== null ? pendingSaveContent : playlistActions.generatePlaylistContent();
      setPendingSaveContent(null); 
      if (pickerState.target === 'save_config') {
          setPickerState(prev => ({ ...prev, isOpen: false }));
          return;
      }
      const isRealWeb = Capacitor.getPlatform() === 'web' && !isElectron(); 
      if (isRealWeb) {
           const blob = new Blob([content], { type: 'text/plain' });
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = fileName;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(url);
           setSaveSuccessModal({ isOpen: true, location: 'Download Browser', fileName: fileName });
           setPickerState(prev => ({ ...prev, isOpen: false }));
           
           // MARK AS SAVED
           playlistActions.markAsSaved();
           return;
      }
      try {
          await writeTextFile(fullPath, fileName, content, directory);
          await addPlaylistToHistory(fileName, fullPath);
          playlistActions.setSourceFileName(fileName);
          playlistActions.setSourceFilePath(fullPath);
          playlistActions.setSourceDirectory(directory);
          
          // MARK AS SAVED
          playlistActions.markAsSaved();

          setSaveSuccessModal({ isOpen: true, location: fullPath, fileName: fileName });
          setPickerState(prev => ({ ...prev, isOpen: false }));
          AppGlobals.Fullname = fullPath;
          AppGlobals.Playlistfilename = fileName;
          AppGlobals.PlaylistLog = AppGlobals.Playlistpath + "Log_" + fileName;
      } catch (e: any) {
          alert("Errore salvataggio: " + e.message);
      }
  };

  const handleLocalCommit = () => {
      if (localSaveBtnRef.current) {
          const btn = localSaveBtnRef.current;
          btn.classList.add('bg-emerald-500', 'text-white', 'border-emerald-400', 'scale-110');
          setTimeout(() => {
              btn.classList.remove('bg-emerald-500', 'text-white', 'border-emerald-400', 'scale-110');
          }, 400);
      }
      if (remoteSync.role === 'slave' && editingTarget) {
          remoteSync.sendMasterCommand({ 
              type: 'UPDATE_SONG', 
              index: editingSfxIndex !== null ? editingSfxIndex : playlistState.currentIndex,
              isSfx: editingSfxIndex !== null,
              data: editingTarget
          });
      }
  };

  // --- HANDLER IMPLEMENTATIONS ---
  const handleDeleteSong = (index: number) => {
    setConfirmModal({
        isOpen: true,
        title: t.delete_track_title,
        message: t.delete_track_msg,
        confirmText: t.btn_remove,
        cancelText: t.btn_cancel,
        action: () => {
            if (remoteSync.role === 'slave') {
                return;
            }
            playlistActions.deleteSong(index);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
    });
  };

  const handleModeChangeRequest = () => {
    const targetMode = appMode === 'editing' ? 'presentation' : 'editing';
    const isSwitchToLive = targetMode === 'presentation';

    setConfirmModal({
        isOpen: true,
        title: isSwitchToLive ? t.switch_live_title : t.switch_edit_title,
        message: isSwitchToLive ? t.switch_live_msg : t.switch_edit_msg,
        confirmText: t.btn_confirm,
        cancelText: t.btn_cancel,
        action: () => {
             // 1. REMOTE CLIENT LOGIC
             if (remoteSync.role === 'slave') {
                 remoteSync.sendMasterCommand({ type: 'SET_MODE', value: targetMode });
                 // Optimistic update
                 setAppMode(targetMode);
                 if (isSwitchToLive) {
                     setEditingSfxIndex(null);
                     setPlaybackSource('html5');
                 }
                 setConfirmModal(prev => ({...prev, isOpen: false}));
                 return;
             }

             // 2. LOCAL / MASTER LOGIC
             setAppMode(targetMode);
             if (isSwitchToLive) {
                 setEditingSfxIndex(null);
                 setPlaybackSource('html5');
                 audioControls.stop(); // Use controls wrapper for clean stop
                 logEvent("LIVE_MODE_START", "Passaggio a modalità Live", true);
             } else {
                 audioControls.stop();
                 logEvent("EDIT_MODE_START", "Passaggio a modalità Editing", true);
                 checkLogFileExistence(); // Restore Log Button visibility check
             }
             // Resize trigger for Waveform
             setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 300);
             setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
    });
  };

  const handleOpenRawEditor = () => {
     setRawEditorOpen(true);
  };

  const handleOpenLogViewer = async () => {
    const logPath = AppGlobals.Playlistpath;
    const logFileName = "Log_" + AppGlobals.Playlistfilename;
    try {
        let fullLogPath = logPath;
        if (fullLogPath && !fullLogPath.endsWith('/') && !fullLogPath.endsWith('\\')) {
             fullLogPath += '/';
        }
        fullLogPath += logFileName;
        
        const content = await readTextFile(fullLogPath, logFileName, playlistState.sourceDirectory);
        setLogContent(content);
        setLogViewerOpen(true);
    } catch (e) {
        alert("Impossibile leggere il log o file non trovato.");
    }
  };

  const handleUpdateRegion = (start: number, end: number) => {
     updateTargetItem(item => ({ ...item, trimStart: start, trimEnd: end }));
  };

  const handleCaptureMark = (type: 'in' | 'out') => {
     const currentTime = playerState.currentTime;
     if (type === 'in') {
         updateTargetItem(item => ({ ...item, trimStart: currentTime }));
     } else {
         updateTargetItem(item => ({ ...item, trimEnd: currentTime }));
     }
  };

  const handleManualAdjust = (field: 'start' | 'end' | 'duration', amount: number) => {
    if (!editingTarget) return;
    if (field === 'start') {
         const newVal = Math.max(0, (editingTarget.trimStart || 0) + amount);
         updateTargetItem(i => ({ ...i, trimStart: newVal }));
    } else if (field === 'end') {
         const currentEnd = (editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration;
         const newVal = Math.max((editingTarget.trimStart || 0) + 0.1, currentEnd + amount);
         updateTargetItem(i => ({ ...i, trimEnd: newVal }));
    } else if (field === 'duration') {
         const start = editingTarget.trimStart || 0;
         const currentEnd = (editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration;
         const currentDur = currentEnd - start;
         const newDur = Math.max(0.1, currentDur + amount);
         updateTargetItem(i => ({ ...i, trimEnd: start + newDur }));
    }
  };

  const handleOpenTimeModal = (type: 'start' | 'end' | 'duration') => {
    let val = 0;
    if (type === 'start') val = editingTarget?.trimStart || 0;
    else if (type === 'end') val = (editingTarget?.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration;
    else if (type === 'duration') {
         const s = editingTarget?.trimStart || 0;
         const e = (editingTarget?.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration;
         val = e - s;
    }
    setTimeEditModal({ isOpen: true, type, value: val });
  };

  const handleModalSave = (val: number) => {
     const type = timeEditModal.type;
     if (type === 'start') updateTargetItem(i => ({ ...i, trimStart: val }));
     else if (type === 'end') updateTargetItem(i => ({ ...i, trimEnd: val }));
     else if (type === 'duration') {
         const start = editingTarget?.trimStart || 0;
         updateTargetItem(i => ({ ...i, trimEnd: start + val }));
     } else if (type === 'fade_auto') {
         // ACTIVATE AUTO FADE WITH SPECIFIC DURATION - Force integer
         const intVal = Math.round(val);
         updateTargetItem(i => ({ ...i, hasFadeOut: true, fadeOutDuration: intVal }));
     } else if (type === 'fade_manual') {
         // UPDATE GLOBAL MANUAL FADE SETTING - Force integer
         const intVal = Math.round(val);
         setGlobalFadeDuration(intVal);
         saveSettings({ globalFadeDuration: intVal });
     }
  };

  const handleResetTrackConditions = () => {
     updateTargetItem(i => ({
         ...i,
         trimStart: 0,
         trimEnd: 0,
         customGain: 1.0,
         hasFadeOut: false,
         fadeOutDuration: 5.0 // Reset to default
     }));
  };

  const handleDeleteSfx = (index: number) => {
    setConfirmModal({
         isOpen: true,
         title: t.delete_sfx_title,
         message: t.delete_sfx_msg,
         confirmText: t.btn_remove,
         cancelText: t.btn_cancel,
         action: () => {
             playlistActions.updateSfx(index, undefined);
             if (editingSfxIndex === index) setEditingSfxIndex(null);
             setConfirmModal(prev => ({ ...prev, isOpen: false }));
         }
     });
  };

  // Helper for raw editor saving
  const parsePlaylistContent = (content: string): { songs: Song[], sfx: SfxItem[] } => {
    const lines = content.split('\n');
    const songs: Song[] = [];
    const sfx: SfxItem[] = new Array(6).fill(undefined);

    lines.forEach((line, index) => {
        if (!line.trim()) return;
        const parts = line.split(';');
        
        if (parts[0] === 'SFX') {
            const idx = parseInt(parts[1]);
            if (!isNaN(idx) && idx >= 0 && idx < 6) {
                // FADE PARSING LOGIC
                let hasFade = false;
                let fadeDur = 5;
                if (parts[6] === '1') { hasFade = true; }
                else {
                    const f = parseFloat(parts[6]);
                    if (f > 0) { hasFade = true; fadeDur = f; }
                }

                sfx[idx] = {
                    id: `sfx-${Date.now()}-${idx}`,
                    label: parts[2],
                    url: parts[3], // Raw path/url
                    path: parts[3], 
                    originalFileName: extractFileName(parts[3]),
                    trimStart: parseFloat(parts[4]) || 0,
                    trimEnd: parseFloat(parts[5]) || 0,
                    hasFadeOut: hasFade,
                    fadeOutDuration: fadeDur,
                    customGain: parseFloat(parts[7]) || 1.0
                };
            }
        } else if (parts[0] === 'SEPARATOR') {
             // NEW: Handle SEPARATOR in Raw Editor
             songs.push({
                 id: `sep-${Date.now()}-${index}`,
                 title: parts[1],
                 url: '',
                 type: 'separator',
                 path: '',
                 originalFileName: ''
             });
        } else {
            if (parts.length >= 2) {
                 // FADE PARSING LOGIC
                 let hasFade = false;
                 let fadeDur = 5;
                 if (parts[4] === '1') { hasFade = true; }
                 else {
                     const f = parseFloat(parts[4]);
                     if (f > 0) { hasFade = true; fadeDur = f; }
                 }

                 songs.push({
                    id: `song-${Date.now()}-${index}`,
                    title: parts[0],
                    url: parts[1], // Raw path/url
                    path: parts[1], 
                    originalFileName: extractFileName(parts[1]),
                    type: 'audio',
                    trimStart: parseFloat(parts[2]) || 0,
                    trimEnd: parseFloat(parts[3]) || 0,
                    hasFadeOut: hasFade,
                    fadeOutDuration: fadeDur,
                    customGain: parseFloat(parts[5]) || 1.0,
                    note: parts[6] || ''
                 });
            }
        }
    });
    return { songs, sfx };
  };

  // --- FIX: SMART RAW EDITOR SAVE ---
  const handleRawSaveRequest = (content: string) => {
     const { songs: parsedSongs, sfx: parsedSfx } = parsePlaylistContent(content);
     
     // 1. Merge Songs: Preserve URL (File Protocol) if path matches existing
     const mergedSongs = parsedSongs.map(newSong => {
         if (newSong.type === 'separator') return newSong; // Separators don't need url merging

         const existing = playlistState.songs.find(old => {
             // Compare by path or filename (trim to be safe)
             const p1 = (old.path || "").trim();
             const p2 = (newSong.path || "").trim();
             const f1 = (old.originalFileName || "").trim();
             const f2 = (newSong.originalFileName || "").trim();
             
             return (p1 && p2 && p1 === p2) || (f1 && f2 && f1 === f2);
         });

         if (existing) {
             // Keep the working URL and ID from the existing song
             return { ...newSong, url: existing.url, id: existing.id };
         }
         return newSong;
     });

     // 2. Merge SFX
     const mergedSfx = parsedSfx.map((newSfx, idx) => {
         if (!newSfx) return undefined;
         const existing = playlistState.sfxItems[idx];
         if (existing) {
             const p1 = (existing.path || "").trim();
             const p2 = (newSfx.path || "").trim();
             const f1 = (existing.originalFileName || "").trim();
             const f2 = (newSfx.originalFileName || "").trim();
             
             if ((p1 && p2 && p1 === p2) || (f1 && f2 && f1 === f2)) {
                 return { ...newSfx, url: existing.url, id: existing.id };
             }
         }
         return newSfx;
     }) as SfxItem[];

     // 3. Load Merged Data
     // IMPORTANT: Pass `false` for fromDisk to indicate this is an edit, not a fresh load.
     handlePlaylistLoaded(mergedSongs, mergedSfx, playlistState.sourceFileName, playlistState.sourceFilePath || undefined, playlistState.sourceDirectory, false);
     setRawEditorOpen(false);
  };

  const remoteSyncPath = playlistState.sourceFilePath || undefined;

  // --- RENDER VARS ---
  const currentDurationDisplay = editingTarget ? Math.max(0, ((editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration) - (editingTarget.trimStart || 0)) : 0;
  const currentTrimEndDisplay = editingTarget ? ((editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration) : 0;
  const currentTrimStartDisplay = editingTarget ? (editingTarget.trimStart || 0) : 0;
  const waveformHeightClass = showWaveform 
      ? (appMode === 'editing' ? 'h-32' : (isCompactView ? 'h-12' : 'h-20')) 
      : 'h-0 border-none';

  // --- PINNED LOGIC FOR DESKTOP ---
  const isPinnedDesktop = chatPinned && !isAndroid;
  const isNotesPinnedDesktop = notesPinned && !isAndroid;

  if (!playlistState.isPlaylistLoaded) {
      return (
          <div className="h-screen w-screen bg-slate-950 flex justify-center overflow-hidden relative">
            <div className="h-full w-full flex flex-col transition-all duration-300">
                <FileLoader 
                    onPlaylistLoaded={handlePlaylistLoaded} 
                    onOpenInfo={() => setInfoModalOpen(true)}
                    initialPath={lastExplorerPath}
                    onPathChange={setLastExplorerPath}
                    language={language}
                    onSettingsRequest={() => setSettingsModalOpen(true)} 
                    appVersion={APP_VERSION}
                />
            </div>
            
            {/* NETWORK ICON - LOADING SCREEN - FORCE VISIBILITY */}
            <div className="absolute bottom-6 right-6 z-[9999]">
                <button 
                    onClick={() => setNetworkModalOpen(true)}
                    className={`p-3 rounded-full shadow-lg border transition-all ${remoteSync.status === 'connected' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 text-indigo-400 border-slate-700 hover:border-indigo-500'}`}
                >
                    <Wifi className="w-6 h-6" />
                </button>
            </div>
            
            <InfoModal isOpen={infoModalOpen} onClose={() => setInfoModalOpen(false)} t={t} appVersion={APP_VERSION} />
            <NetworkModal 
                isOpen={networkModalOpen} 
                onClose={() => setNetworkModalOpen(false)} 
                sync={remoteSync} 
                t={t} 
                clientPin={clientPin}
                onChangeClientPin={(val) => { setClientPin(val); saveSettings({ clientPin: val }); }}
                serverPin={serverPin}
                clientName={clientName}
            />
            <SettingsModal 
                isOpen={settingsModalOpen} 
                onClose={() => setSettingsModalOpen(false)}
                currentLang={language}
                onSelectLang={(lang) => { setLanguage(lang); saveSettings({ language: lang }); }}
                enableNetwork={enableNetwork}
                onToggleNetwork={(val) => { setEnableNetwork(val); saveSettings({ enableNetwork: val }); }}
                enableBeep={enableBeep}
                onToggleBeep={(val) => { setEnableBeep(val); saveSettings({ enableBeep: val }); }}
                callTimeout={callTimeout}
                onChangeTimeout={(val) => { setCallTimeout(val); saveSettings({ callTimeout: val }); }}
                serverPin={serverPin}
                onChangeServerPin={(val) => { setServerPin(val); saveSettings({ serverPin: val }); }}
                clientName={clientName}
                onChangeClientName={(val) => { setClientName(val); saveSettings({ clientName: val }); }}
            />
          </div>
      );
  }

  return (
    <div className={`h-screen w-screen bg-black flex overflow-hidden relative transition-all duration-500
        ${isControlsDisabled ? 'ring-8 ring-inset ring-indigo-900/50 opacity-90' : ''}`}>
      <div className={`h-full w-full flex flex-col ${appMode === 'presentation' ? 'bg-black' : 'bg-slate-950'} transition-all duration-300`}>
          <input type="file" ref={windowsFileInputRef} onChange={handleWindowsFileSelect} className="hidden" accept="audio/*,.mp3,.wav,.ogg,.m4a" />

          {pickerState.isOpen && (
              <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="w-full h-full flex items-center justify-center p-6">
                      <div className="w-full h-full max-w-5xl bg-slate-950 rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
                          <FileLoader 
                              pickerMode={pickerState.target !== 'save' && pickerState.target !== 'save_config'} 
                              onClose={() => setPickerState(prev => ({...prev, isOpen: false}))}
                              onFileSelect={handlePickerSelect}
                              onPlaylistLoaded={() => {}} 
                              onOpenInfo={() => {}} 
                              initialPath={lastExplorerPath}
                              onPathChange={setLastExplorerPath}
                              saveMode={pickerState.target === 'save' || pickerState.target === 'save_config'}
                              defaultFileName={pickerState.target === 'save_config' ? 'settings.json' : playlistState.sourceFileName}
                              onSave={handleSaveFromLoader}
                              language={language}
                          />
                      </div>
                  </div>
              </div>
          )}

          <div className="flex-1 flex min-h-0 overflow-hidden relative" onMouseMove={(e) => (!isPinnedDesktop && !isNotesPinnedDesktop) && isDragging.current && handleDragMove(e.nativeEvent)} onMouseUp={handleDragEnd}>
              <div 
                style={{ width: (isPinnedDesktop || isNotesPinnedDesktop) ? '30%' : (appMode === 'editing' ? `${leftPanelWidth}%` : '40%') }} 
                className="flex flex-col border-r border-slate-800 relative z-10 bg-slate-900/50 min-w-[250px] transition-[width] duration-300 ease-in-out overflow-hidden"
              >
                <PlaylistView 
                    songs={playlistState.songs}
                    currentIndex={playlistState.currentIndex}
                    isPlaying={playerState.isPlaying && editingSfxIndex === null} 
                    onSongSelect={(idx) => requestSongSelect(idx)}
                    onLoadNew={handleLoadNewRequest} 
                    onLoadSingle={handleLoadSingle}
                    onAddTrack={() => handleOpenPicker('track')} 
                    onAddSeparator={handleAddSeparator} // PASS HANDLER
                    onReorder={playlistActions.reorderSongs}
                    onDeleteSong={handleDeleteSong}
                    appMode={appMode}
                    onRequestModeChange={handleModeChangeRequest} 
                    playedSongIds={playlistState.playedSongIds}
                    onRequestReset={requestReset}
                    onSavePlaylist={handleRequestSavePlaylist} 
                    showWaveform={showWaveform}
                    onToggleWaveform={() => setShowWaveform(!showWaveform)}
                    onOpenRawEditor={handleOpenRawEditor}
                    onOpenInfo={() => setInfoModalOpen(true)}
                    onRelink={(idx) => handleOpenPicker('relink', idx)} 
                    language={language}
                    onLanguageRequest={() => setSettingsModalOpen(true)} 
                    playlistFileName={playlistState.sourceFileName} 
                    isCompactView={isCompactView}
                    onToggleCompactView={() => setIsCompactView(!isCompactView)}
                    appVersion={APP_VERSION}
                    isAndroid={isAndroid}
                    onOpenLog={(!isAndroid && logFileExists && appMode === 'editing') ? handleOpenLogViewer : undefined}
                    readOnly={isControlsDisabled} 
                    onRenameSong={(idx) => setRenameModal({isOpen: true, index: idx, name: playlistState.songs[idx].title})}
                    hasUnsavedChanges={playlistState.hasUnsavedChanges}
                    // PASS TIMER PROPS
                    showStartTime={showStartTime}
                    showEndTime={showEndTime}
                    // PIN NOTES PROPS
                    onTogglePinNotes={() => {
                        const newVal = !notesPinned;
                        setNotesPinned(newVal);
                        if (!newVal && !chatPinned) setLeftPanelWidth(40);
                    }}
                    isNotesPinned={notesPinned}
                />
              </div>

              {appMode === 'editing' && !isPinnedDesktop && !isNotesPinnedDesktop && (
                  <div
                      onMouseDown={handleDragStart}
                      onTouchStart={handleDragStart}
                      className="w-4 -ml-2 z-20 cursor-col-resize hover:bg-emerald-500/20 active:bg-emerald-500/50 transition-colors flex items-center justify-center group"
                      style={{ touchAction: 'none' }} 
                  >
                      <div className="w-1 h-8 bg-slate-700 rounded-full group-hover:bg-emerald-400 group-active:bg-emerald-300"></div>
                  </div>
              )}

              <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 min-w-0 overflow-hidden relative">
                
                {/* --- RELOCATED NETWORK & CHAT BUTTONS (ABSOLUTE POSITIONING) --- */}
                {!pickerState.isOpen && (
                    <div className="absolute top-4 right-4 z-50 flex gap-2">
                        <button 
                            onClick={() => setNetworkModalOpen(true)}
                            className={`p-1.5 rounded-full border transition-all shadow-lg flex items-center gap-2 px-3 ${
                                remoteSync.status === 'connected' 
                                    ? 'bg-emerald-600/90 text-white border-emerald-500 hover:bg-emerald-500' 
                                    : 'bg-slate-800/80 text-indigo-400 border-slate-600 hover:border-indigo-500'
                            }`}
                        >
                            <Wifi className="w-4 h-4" />
                            {remoteSync.status === 'connected' && <span className="text-xs font-bold uppercase">{remoteSync.role === 'master' ? `Master (${remoteSync.clientCount})` : 'Slave'}</span>}
                        </button>
                        {remoteSync.status === 'connected' && (
                            <button 
                                onClick={() => {
                                    if (callStatus === 'connected' && !isChatOpen) {
                                        // HANDLE GHOST WINDOW LOGIC
                                        setIsChatOpen(true);
                                        if (!isAndroid && notesPinned) setChatPinned(true);
                                    } else {
                                        handleStartCall();
                                    }
                                }}
                                className={`p-2 rounded-full border transition-all shadow-lg flex items-center justify-center ${
                                    callStatus === 'ringing'
                                        ? 'bg-amber-500 text-white border-amber-400 animate-pulse ring-4 ring-amber-500/30'
                                        : callStatus === 'calling'
                                            ? 'bg-emerald-600 text-white border-emerald-500 animate-pulse'
                                            : callStatus === 'connected'
                                                ? 'bg-emerald-500 text-white border-emerald-400'
                                                : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-100'
                                }`}
                                title={callStatus === 'ringing' ? t.call_answer : t.chat_title}
                            >
                                {callStatus === 'ringing' ? <PhoneIncoming className="w-5 h-5" /> : (callStatus === 'calling' ? <PhoneCall className="w-5 h-5" /> : <Phone className="w-5 h-5" />)}
                            </button>
                        )}
                    </div>
                )}

                <div className={`${waveformHeightClass} shrink-0 border-b border-slate-800 relative bg-black/40 transition-[height] duration-300 overflow-hidden`}>
                    {showWaveform ? (
                        <Waveform 
                            url={editingTarget?.url || ''}
                            isPlaying={playerState.isPlaying && playbackSource === 'waveform'} 
                            volume={playerState.volume}
                            trimStart={editingTarget?.trimStart}
                            trimEnd={editingTarget?.trimEnd}
                            isEditing={appMode === 'editing'}
                            hasFadeOut={editingTarget?.hasFadeOut} 
                            onReady={(d) => audioControls.updateState({ duration: d })}
                            onFinish={handleTrackEnd}
                            onTimeUpdate={(t) => {
                                if (playbackSource === 'waveform') audioControls.updateState({ currentTime: t });
                                else if (appMode === 'editing' && !playerState.isPlaying) audioControls.updateState({ currentTime: t });
                            }}
                            onRegionChange={handleUpdateRegion}
                            onCursorMove={(t) => {}}
                            seekRequest={waveSeekRequestRef.current}
                            syncTime={playbackSource === 'html5' ? playerState.currentTime : null} 
                            language={language}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600 font-mono text-xs">{t.waveform_hidden}</div>
                    )}
                </div>

                {(!isCompactView || appMode === 'editing') && (
                    <div className="shrink-0 p-3 border-b border-slate-800 bg-slate-800/20 flex flex-col gap-2">
                        {appMode === 'editing' && (
                            <div className="flex items-center gap-2">
                                <Scissors className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    Editor {editingSfxIndex !== null ? 'SFX' : (language === 'it' ? 'Traccia' : 'Track')}
                                    {editingTarget && (
                                        <span className="text-emerald-400 font-normal normal-case truncate max-w-[200px]">
                                            ({editingSfxIndex !== null ? (editingTarget as SfxItem).label : (editingTarget as Song).title})
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}
                        
                        <div className={`flex items-center justify-center gap-4 w-full ${isControlsDisabled ? 'pointer-events-none' : ''}`}>
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] text-slate-500 font-bold uppercase">{t.time_start}</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleCaptureMark('in')} disabled={appMode !== 'editing'} className="p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-emerald-400 shadow-md hover:bg-emerald-900/50 hover:text-white disabled:opacity-0 transition-colors" title={t.mark_in}><MapPin className="w-5 h-5" /></button>
                                    <div className="relative flex items-center bg-slate-900 rounded-lg border border-slate-700 p-0.5 gap-0">
                                        <button onClick={() => handleManualAdjust('start', -1)} disabled={appMode !== 'editing'} className="p-1.5 hover:bg-slate-800 rounded-l-md text-slate-400 hover:text-white disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                                        <div onClick={() => handleOpenTimeModal('start')} className="w-20 bg-transparent text-center font-mono text-emerald-400 font-bold text-sm cursor-pointer py-1 select-none">
                                            {formatTimeDetail(currentTrimStartDisplay)}
                                        </div>
                                        <button onClick={() => handleManualAdjust('start', +1)} disabled={appMode !== 'editing'} className="p-1.5 hover:bg-slate-800 rounded-r-md text-slate-400 hover:text-white disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] text-slate-500 font-bold uppercase">{t.time_duration}</span>
                                <div className="flex items-center bg-slate-800 rounded-lg border border-slate-600 p-0.5 shadow-inner gap-0 h-[34px]">
                                    <button onClick={() => handleManualAdjust('duration', -1)} disabled={appMode !== 'editing'} className="p-1.5 hover:bg-slate-700 rounded-l-md text-slate-400 hover:text-white disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                                    <div onClick={() => handleOpenTimeModal('duration')} className="w-20 bg-transparent text-center font-mono text-white font-black text-sm cursor-pointer py-1 select-none">
                                        {formatTimeDetail(currentDurationDisplay)}
                                    </div>
                                    <button onClick={() => handleManualAdjust('duration', +1)} disabled={appMode !== 'editing'} className="p-1.5 hover:bg-slate-700 rounded-r-md text-slate-400 hover:text-white disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] text-slate-500 font-bold uppercase">{t.time_end}</span>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex items-center bg-slate-900 rounded-lg border border-slate-700 p-0.5 gap-0">
                                        <button onClick={() => handleManualAdjust('end', -1)} disabled={appMode !== 'editing'} className="p-1.5 hover:bg-slate-800 rounded-l-md text-slate-400 hover:text-white disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                                        <div onClick={() => handleOpenTimeModal('end')} className="w-20 bg-transparent text-center font-mono text-red-400 font-bold text-sm cursor-pointer py-1 select-none">
                                            {formatTimeDetail(currentTrimEndDisplay)}
                                        </div>
                                        <button onClick={() => handleManualAdjust('end', +1)} disabled={appMode !== 'editing'} className="p-1.5 hover:bg-slate-800 rounded-r-md text-slate-400 hover:text-white disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                                    </div>
                                    <button onClick={() => handleCaptureMark('out')} disabled={appMode !== 'editing'} className="p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-red-400 shadow-md hover:bg-red-900/50 hover:text-white disabled:opacity-0 transition-colors" title={t.mark_out}><MapPin className="w-5 h-5" /></button>
                                </div>
                            </div>
                        </div>

                        {appMode === 'editing' && (
                            <>
                                <div className="w-full h-px bg-slate-800/50" />
                                <div className="flex items-center justify-center gap-4 w-full animate-in fade-in slide-in-from-top-2">
                                    
                                    {/* WRAPPER PER CONTROLLI DISABILITATI IN SOLA LETTURA */}
                                    <div className={`flex items-center gap-4 ${isControlsDisabled ? 'pointer-events-none opacity-50' : ''}`}>
                                        <button
                                            onClick={() => (playerState.isPlaying && playbackSource === 'waveform' ? requestPause() : handleEditorPlay())}
                                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${playerState.isPlaying && playbackSource === 'waveform' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50' : 'bg-slate-800 text-slate-300 border border-slate-600 hover:text-white hover:border-white'}`}
                                            title={t.play_raw_tooltip}
                                        >
                                            {playerState.isPlaying && playbackSource === 'waveform' ? <PauseCircle className="w-6 h-6" /> : <PlayCircle className="w-6 h-6" />}
                                        </button>

                                        <button onClick={handleResetTrackConditions} className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-500 hover:text-white hover:border-white transition-all shadow-sm" title={t.reset_track_tooltip}><RefreshCcw className="w-4 h-4" /></button>
                                        
                                        <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-700">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase w-12 text-right">{t.volume}</span>
                                            <input type="range" min="0" max="1" step="0.01" value={editingTarget?.customGain || 1.0} onChange={(e) => updateTargetItem(i => ({...i, customGain: parseFloat(e.target.value)}))} className="w-32 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-white" />
                                            <span className="font-mono text-xs w-10 text-center text-indigo-400 font-bold">{Math.round((editingTarget?.customGain || 1)*100)}%</span>
                                        </div>

                                        {/* NEW: FADE TOGGLE WITH CONFIG */}
                                        <button 
                                            onClick={handleToggleFade}
                                            className={`h-10 px-4 rounded-lg border flex items-center gap-2 transition-all ${editingTarget?.hasFadeOut ? 'bg-rose-900/40 border-rose-500 text-rose-400' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}
                                            title="Attiva/Disattiva Fade Out (Apre configurazione se attivo)"
                                        >
                                            <Wind className="w-4 h-4" />
                                            <span className="text-xs font-bold">{t.fade_btn}</span>
                                            {editingTarget?.hasFadeOut && (
                                                <span className="text-[9px] font-mono opacity-80 border-l border-rose-500/50 pl-2 ml-1">
                                                    {Math.round(editingTarget.fadeOutDuration || 5)}s
                                                </span>
                                            )}
                                        </button>

                                        {editingSfxIndex === null && (
                                            <button 
                                                onClick={() => setNoteModalOpen(true)}
                                                className="h-10 w-10 ml-2 rounded-xl border border-slate-600 bg-slate-800 text-amber-400 hover:text-white hover:border-amber-500 transition-all flex items-center justify-center"
                                                title={t.edit_note_tooltip}
                                            >
                                                <StickyNote className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* --- REMOTE SYNC BUTTON (Visible ONLY in SLAVE Mode) --- */}
                                    {/* FIX: MOVED OUTSIDE POINTER-EVENTS-NONE CONTAINER TO BE CLICKABLE */}
                                    {remoteSync.role === 'slave' && (
                                        <button
                                            ref={localSaveBtnRef}
                                            onClick={handleLocalCommit}
                                            className="h-10 w-10 ml-2 rounded-xl border border-emerald-500/50 bg-slate-800 text-emerald-400 hover:text-white hover:bg-emerald-600 transition-all flex items-center justify-center shadow-lg"
                                            title={t.commit_tooltip}
                                        >
                                            <Send className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className={`flex flex-col min-h-0 bg-slate-900/50 ${isCompactView && appMode === 'presentation' ? 'shrink-0 border-b border-slate-800' : 'flex-1'} ${isControlsDisabled ? 'pointer-events-none' : ''}`}>
                    {appMode === 'editing' && (
                        <div className="p-2 border-b border-slate-800 flex items-center gap-2 bg-slate-800/30">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.sfx_section}</span>
                        </div>
                    )}
                    <div className={`overflow-y-auto ${isCompactView && appMode === 'presentation' ? 'p-1' : 'flex-1 p-2'}`}>
                        <div className={`${isCompactView && appMode === 'presentation' ? 'flex flex-row w-full justify-evenly items-center' : 'grid grid-cols-3 gap-2 h-full'}`}>
                            {playlistState.sfxItems.map((sfx, idx) => {
                                if (isCompactView && appMode === 'presentation' && (!sfx || !sfx.url)) return null;
                                const isPlaying = activeSfxIndices.has(idx); 
                                const isEditingThis = editingSfxIndex === idx; 
                                const hasFile = sfx && sfx.url;
                                const hasGain = sfx && sfx.customGain !== 1.0;
                                const hasCuts = sfx && ((sfx.trimStart && sfx.trimStart > 0) || (sfx.trimEnd && sfx.trimEnd > 0));
                                const hasFade = sfx && sfx.hasFadeOut;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => requestSfxPlay(idx)}
                                        className={`relative group rounded-xl border-2 flex flex-col items-center justify-center p-2 transition-all active:scale-95 shadow-lg
                                            ${isCompactView && appMode === 'presentation' ? 'w-24 h-12' : 'h-20'} 
                                            ${hasFile
                                                ? (isPlaying 
                                                    ? 'bg-lime-900/40 border-lime-500/80 shadow-[0_0_15px_rgba(132,204,22,0.2)]' 
                                                    : isEditingThis 
                                                        ? 'bg-indigo-900/40 border-indigo-500 ring-2 ring-indigo-500/20' 
                                                        : 'bg-slate-800 border-slate-700 hover:border-amber-500 hover:bg-slate-700') 
                                                : 'bg-slate-900/50 border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600'
                                            }`}
                                    >
                                        {!isAndroid && (
                                            <div className="absolute top-1 left-2 text-sm font-black text-slate-500 group-hover:text-white transition-colors pointer-events-none z-10">
                                                {idx < 3 ? idx + 1 : idx + 4}
                                            </div>
                                        )}
                                        {hasFile ? (
                                            <>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className={`rounded-full flex items-center justify-center transition-colors 
                                                        ${isCompactView && appMode === 'presentation' ? 'w-4 h-4' : 'w-6 h-6'}
                                                        ${isPlaying ? 'bg-lime-500 text-slate-900' : (isEditingThis ? 'bg-indigo-500 text-white' : 'bg-amber-500/10 group-hover:bg-amber-500/20')}`}>
                                                        {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : (isEditingThis ? <Edit2 className="w-3 h-3" /> : <Zap className="w-3 h-3 text-amber-500" />)}
                                                    </div>
                                                    {!isCompactView && (
                                                        <div className="flex items-center gap-0.5 opacity-80">
                                                            {hasGain && <SignalHigh className={`w-3 h-3 ${isEditingThis ? 'text-indigo-300' : 'text-slate-400'}`} />}
                                                            {hasCuts && <Scissors className={`w-3 h-3 ${isEditingThis ? 'text-indigo-300' : 'text-slate-400'}`} />}
                                                            {hasFade && <Wind className={`w-3 h-3 ${isEditingThis ? 'text-indigo-300' : 'text-slate-400'}`} />}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className={`font-bold truncate w-full text-center ${isCompactView && appMode === 'presentation' ? 'text-[10px] leading-none' : 'text-xs'} ${isPlaying ? 'text-lime-400' : (isEditingThis ? 'text-indigo-300' : 'text-white')}`}>{sfx.label || `SFX ${idx+1}`}</span>
                                                {appMode === 'editing' && (
                                                    <div 
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteSfx(idx); }}
                                                        className="absolute top-1 right-1 p-1 bg-red-900/80 rounded-full text-red-200 hover:bg-red-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center gap-1 opacity-50 group-hover:opacity-100 text-slate-500">
                                                <Plus className="w-5 h-5" />
                                                <span className="text-[10px] font-bold">ADD SFX</span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* --- BOTTOM NOTE PREVIEW (ONLY IF NOT PINNED) --- */}
                {editingSfxIndex === null && !isNotesPinnedDesktop && (appMode === 'presentation' || !isAndroid) && (editingTarget as Song)?.type !== 'separator' && (
                    <div className="shrink-0 bg-slate-900 p-3 border-t border-slate-800">
                        <div className={`flex items-start gap-3 ${isCompactView ? 'h-24' : 'h-20'}`}>
                            <button 
                                disabled={true}
                                className="p-2 rounded-lg border border-amber-500/30 shrink-0 transition-all bg-amber-900/20 text-amber-400 cursor-default"
                            >
                                <StickyNote className="w-5 h-5" />
                            </button>
                            <div className="flex-1 h-full">
                                <div className={`w-full h-full rounded-lg p-2 text-sm font-bold leading-relaxed overflow-y-auto custom-scrollbar ${
                                    (editingTarget as Song)?.note 
                                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200' 
                                    : 'bg-slate-800/50 border border-slate-800 text-slate-600 italic'
                                }`}>
                                    <span className="whitespace-pre-wrap">
                                        {(editingTarget as Song)?.note || t.no_note_placeholder}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
              </div>

              {/* --- RIGHT COLUMN CONTAINER (CHAT & NOTES PINNED) --- */}
              {(isPinnedDesktop || isNotesPinnedDesktop) && (
                  <div className="w-[25%] shrink-0 border-l border-slate-800 bg-slate-950 flex flex-col transition-all duration-300 ease-in-out">
                      {/* 1. NOTES PANEL (Top) */}
                      {isNotesPinnedDesktop && (
                          <div className={`flex-1 min-h-0 ${isPinnedDesktop ? 'border-b border-slate-800' : ''}`}>
                              <NotesPanel 
                                  targetItem={editingTarget} 
                                  isSfx={editingSfxIndex !== null}
                                  onUpdateNote={(val) => {
                                      if (remoteSync.role === 'slave' && editingSfxIndex === null) { 
                                          remoteSync.sendMasterCommand({ type: 'UPDATE_SONG', index: playlistState.currentIndex, isSfx: false, data: { ...editingTarget, note: val } }); 
                                      } else { 
                                          updateTargetItem(i => ({...i, note: val})); 
                                      }
                                  }}
                                  readOnly={isControlsDisabled}
                                  onClose={() => {
                                      setNotesPinned(false);
                                      if (!chatPinned) setLeftPanelWidth(40);
                                  }}
                              />
                          </div>
                      )}

                      {/* 2. CHAT PANEL (Bottom) */}
                      {isPinnedDesktop && isChatOpen && (
                          <div className={`${isNotesPinnedDesktop ? 'flex-1 min-h-0' : 'flex-1 h-full'}`}>
                                <ChatModal 
                                  isOpen={true} 
                                  messages={chatMessages}
                                  onSendMessage={handleSendChatMessage}
                                  onEndCall={handleEndCall}
                                  onCloseWindow={handleCloseChatWindow} // NEW PROP PASSED
                                  t={t}
                                  isPinned={chatPinned}
                                  onTogglePin={(val) => setChatPinned(val)}
                                  displayMode="floating"
                                  connectedStatus={callStatus}
                                  onAnswerCall={handleAnswerCall}
                              />
                          </div>
                      )}
                  </div>
              )}
          </div>

          <div className={`shrink-0 h-24 bg-slate-900 border-t border-slate-800 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.5)] ${isControlsDisabled ? 'pointer-events-none' : ''}`}>
             <PlayerControls 
                state={playerState}
                onPlayPause={() => playerState.isPlaying && playbackSource === 'html5' ? requestPause() : requestMainPlay()} 
                onNext={() => requestNext()}
                onPrev={() => requestPrev()}
                onStop={() => requestStop()}
                onSeek={handleSeek}
                onVolumeChange={(v) => requestVolumeChange(v)} 
                onFade={() => requestManualFade()} 
                onFadeConfig={() => setTimeEditModal({isOpen: true, type: 'fade_manual', value: globalFadeDuration})}
                manualFadeDuration={Math.round(globalFadeDuration)} // PASS PROP
                title={editingTarget ? (editingSfxIndex !== null ? (editingTarget as SfxItem).label : (editingTarget as Song).title) : t.no_track_title}
                startTime={editingTarget?.trimStart || 0}
                endTime={editingTarget?.trimEnd || 0}
                appMode={appMode}
                language={language}
                readOnly={isControlsDisabled} // Pass ReadOnly prop
             />
          </div>
          
      </div>

      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} confirmText={confirmModal.confirmText} cancelText={confirmModal.cancelText} onConfirm={confirmModal.action} onCancel={() => setConfirmModal(prev => ({...prev, isOpen: false}))} />
      <SaveSuccessModal isOpen={saveSuccessModal.isOpen} fileName={saveSuccessModal.fileName} location={saveSuccessModal.location} title={t.saved_title} msgFileUpdated={t.file_updated} onClose={() => setSaveSuccessModal(prev => ({ ...prev, isOpen: false }))} />
      
      {/* UPDATE: Use TimeEditModal for Fade Config */}
      <TimeEditModal 
          isOpen={timeEditModal.isOpen} 
          type={timeEditModal.type as any} // Cast to satisfy type definition
          initialValue={timeEditModal.value} 
          onSave={handleModalSave} 
          onClose={() => setTimeEditModal(prev => ({...prev, isOpen: false}))} 
          t={t} 
      />
      
      <NoteModal isOpen={noteModalOpen} initialValue={(editingTarget as Song)?.note || ''} onSave={(val) => { if (remoteSync.role === 'slave' && editingSfxIndex === null) { remoteSync.sendMasterCommand({ type: 'UPDATE_SONG', index: playlistState.currentIndex, isSfx: false, data: { ...editingTarget, note: val } }); } else { updateTargetItem(i => ({...i, note: val})); }}} onClose={() => setNoteModalOpen(false)} t={t} />
      <RawEditorModal isOpen={rawEditorOpen} initialContent={playlistActions.generatePlaylistContent()} onSave={handleRawSaveRequest} onClose={() => setRawEditorOpen(false)} t={t} />
      <RawEditorModal isOpen={logViewerOpen} initialContent={logContent} onSave={() => {}} onClose={() => setLogViewerOpen(false)} t={t} readOnly={true} title="File log della playlist" /> 
      <NetworkModal 
          isOpen={networkModalOpen} 
          onClose={() => setNetworkModalOpen(false)} 
          sync={remoteSync} 
          t={t} 
          clientPin={clientPin} 
          onChangeClientPin={(val) => { setClientPin(val); saveSettings({ clientPin: val }); }} 
          serverPin={serverPin} 
          clientName={clientName} 
          songs={playlistState.songs} 
          sfx={playlistState.sfxItems} 
          masterFilePath={remoteSyncPath} 
          onAssetsUpdated={handleReloadAssets} // UPDATED HANDLER
      /> 
      <RenameModal 
          isOpen={renameModal.isOpen}
          initialValue={renameModal.name}
          onClose={() => setRenameModal(prev => ({...prev, isOpen: false}))}
          onSave={(val) => {
              if (renameModal.index !== -1) {
                  // Se sono in modalità Slave, dovrei mandare il comando al master, 
                  // ma l'UI generalmente blocca questa interazione.
                  // Se invece sono Master, aggiorno localmente:
                  playlistActions.updateSong(renameModal.index, s => ({...s, title: val}));
              }
          }}
          t={t}
      />

      {/* ADDED MISSING MODALS TO MAIN VIEW */}
      <InfoModal isOpen={infoModalOpen} onClose={() => setInfoModalOpen(false)} t={t} appVersion={APP_VERSION} />
      <SettingsModal 
          isOpen={settingsModalOpen} 
          onClose={() => setSettingsModalOpen(false)}
          currentLang={language}
          onSelectLang={(lang) => { setLanguage(lang); saveSettings({ language: lang }); }}
          enableNetwork={enableNetwork}
          onToggleNetwork={(val) => { setEnableNetwork(val); saveSettings({ enableNetwork: val }); }}
          enableBeep={enableBeep}
          onToggleBeep={(val) => { setEnableBeep(val); saveSettings({ enableBeep: val }); }}
          callTimeout={callTimeout}
          onChangeTimeout={(val) => { setCallTimeout(val); saveSettings({ callTimeout: val }); }}
          serverPin={serverPin}
          onChangeServerPin={(val) => { setServerPin(val); saveSettings({ serverPin: val }); }}
          clientName={clientName}
          onChangeClientName={(val) => { setClientName(val); saveSettings({ clientName: val }); }}
      />

      {!isPinnedDesktop && (
          <ChatModal 
              isOpen={isChatOpen} 
              messages={chatMessages}
              onSendMessage={handleSendChatMessage}
              onEndCall={handleEndCall}
              onCloseWindow={handleCloseChatWindow} // NEW PROP PASSED
              t={t}
              isPinned={chatPinned}
              onTogglePin={(val) => setChatPinned(val)}
              displayMode="floating"
              connectedStatus={callStatus}
              onAnswerCall={handleAnswerCall}
          />
      )}
    </div>
  );
};

export default App;
