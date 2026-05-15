
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Song, AppMode, Language } from '../types';
import { Music2, PlayCircle, PauseCircle, Upload, Disc, Check, Edit3, MonitorPlay, RotateCcw, Save, Scissors, Wind, SignalHigh, GripVertical, Plus, AlertTriangle, Activity, Trash2, FileSignature, Info, Link2, ChevronUp, ChevronDown, StickyNote, Minimize2, Maximize2, FilePenLine, FileText, MessageSquare, Timer, Divide, Pin } from 'lucide-react';
import { translations } from '../translations';

interface PlaylistViewProps {
  songs: Song[];
  currentIndex: number;
  isPlaying: boolean;
  onSongSelect: (index: number) => void;
  onLoadNew: () => void;
  onLoadSingle: (file: File) => void;
  onAddTrack: () => void; 
  onAddSeparator?: (label: string) => void; 
  onReorder: (fromIndex: number, toIndex: number) => void; 
  onDeleteSong: (index: number) => void; 
  appMode: AppMode;
  onRequestModeChange: () => void; 
  playedSongIds: Set<string>;
  onRequestReset: () => void; 
  onSavePlaylist: () => void; 
  showWaveform: boolean;
  onToggleWaveform: () => void;
  onOpenRawEditor: () => void;
  onOpenInfo: () => void; 
  onRelink: (index: number) => void; 
  language?: Language;
  onLanguageRequest?: () => void; 
  playlistFileName?: string; 
  isCompactView?: boolean; 
  onToggleCompactView?: () => void; 
  appVersion?: string; 
  isAndroid?: boolean; 
  onOpenLog?: () => void; 
  readOnly?: boolean;
  onRenameSong?: (index: number) => void;
  hasUnsavedChanges?: boolean;
  showStartTime?: number | null;
  showEndTime?: number | null;
  onTogglePinNotes?: () => void;
  isNotesPinned?: boolean;
  hasScript?: boolean;
  onRequestOpenScript?: () => void;
  // NEW: Reposition callback
  onRepositionRequest?: (index: number) => void;
}

// --- HELPER: Format Duration (MM:SS) ---
const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

// --- COMPONENT: Show Timer (Orologio Spettacolo) ---
const ShowTimer: React.FC<{ start: number | null, end: number | null }> = ({ start, end }) => {
    const [timeString, setTimeString] = useState("00h:00m:00s");

    useEffect(() => {
        // Se non è ancora iniziato, mostra 0
        if (!start) {
            setTimeString("00h:00m:00s");
            return;
        }

        const updateTime = () => {
            const now = end || Date.now();
            const diff = Math.max(0, now - start);
            
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            setTimeString(
                `${hours.toString().padStart(2, '0')}h:${minutes.toString().padStart(2, '0')}m:${seconds.toString().padStart(2, '0')}s`
            );
        };

        // Aggiorna subito
        updateTime();

        // Se c'è una fine (spettacolo finito), non serve l'intervallo
        if (end) return;

        // Aggiorna ogni secondo
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, [start, end]);

    return (
        <div className="flex items-center gap-2 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-700/50 shadow-inner">
            <Timer className="w-4 h-4 text-emerald-500 animate-pulse" />
            <span className="font-mono font-bold text-sm text-emerald-400 tracking-widest tabular-nums">
                {timeString}
            </span>
        </div>
    );
};

// --- COMPONENT: Flag Icon (Visual Only) ---
const FlagIcon: React.FC<{lang: Language, onClick: () => void}> = ({ lang, onClick }) => (
  <button 
    onClick={onClick}
    className="w-8 h-5 rounded-[1px] shadow-sm overflow-hidden opacity-80 hover:opacity-100 transition-opacity cursor-pointer border border-white/10 flex items-center justify-center" 
    title="Lingua/Language"
  >
    {lang === 'it' ? (
        <svg viewBox="0 0 3 2" className="w-full h-full">
            <rect width="1" height="2" x="0" fill="#009246" />
            <rect width="1" height="2" x="1" fill="#ffffff" />
            <rect width="1" height="2" x="2" fill="#ce2b37" />
        </svg>
    ) : (
        <svg viewBox="0 0 60 30" className="w-full h-full">
            <rect width="60" height="30" fill="#012169"/>
            <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
            <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4"/>
            <path d="M30,0 L30,30 M0,15 L60,15" stroke="#fff" strokeWidth="10"/>
            <path d="M30,0 L30,30 M0,15 L60,15" stroke="#C8102E" strokeWidth="6"/>
        </svg>
    )}
  </button>
);

// --- COMPONENT: Song Duration Calculator ---
const SongDuration: React.FC<{ song: Song, isMissing: boolean, errorText: string }> = ({ song, isMissing, errorText }) => {
    const [duration, setDuration] = useState<number>(0);

    useEffect(() => {
        if (isMissing || !song.url) return;
        
        const audio = new Audio(song.url);
        audio.preload = 'metadata'; 
        
        const onLoadedMetadata = () => {
            const d = audio.duration;
            if (!isNaN(d) && isFinite(d)) {
                setDuration(d);
            }
        };
        
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.onerror = () => setDuration(0);

        return () => {
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.src = ''; 
        };
    }, [song.url, isMissing]);

    if (isMissing) return <span className="text-[10px] text-red-400 font-bold uppercase">{errorText}</span>;
    if (duration === 0) return null;

    // Calculate Effective Duration
    const start = song.trimStart || 0;
    const end = (song.trimEnd && song.trimEnd > 0) ? song.trimEnd : duration;
    const effective = Math.max(0, end - start);
    const isCut = Math.abs(effective - duration) > 0.5;

    return (
        <span className="text-xs font-mono text-slate-500 shrink-0 ml-2 whitespace-nowrap">
            {formatDuration(duration)}
            {isCut && (
                <span className="text-emerald-500 ml-1 font-semibold">
                    ({formatDuration(effective)})
                </span>
            )}
        </span>
    );
};

const PlaylistView: React.FC<PlaylistViewProps> = ({ 
  songs, 
  currentIndex, 
  isPlaying, 
  onSongSelect, 
  onLoadNew,
  onLoadSingle,
  onAddTrack,
  onAddSeparator,
  onReorder,
  onDeleteSong,
  appMode,
  onRequestModeChange,
  playedSongIds,
  onRequestReset,
  onSavePlaylist, 
  showWaveform,
  onToggleWaveform,
  onOpenRawEditor,
  onOpenInfo,
  onRelink,
  language = 'it',
  onLanguageRequest,
  playlistFileName,
  isCompactView = false,
  onToggleCompactView,
  appVersion,
  isAndroid = false,
  onOpenLog,
  readOnly = false,
  onRenameSong,
  hasUnsavedChanges,
  showStartTime,
  showEndTime,
  onTogglePinNotes,
  isNotesPinned = false,
  hasScript = false,
  onRequestOpenScript,
  onRepositionRequest
}) => {
  const activeRef = useRef<HTMLButtonElement>(null);
  const t = translations[language];

  // State for the "Add Act" dropdown
  const [showAddActMenu, setShowAddActMenu] = useState(false);
  const [customActNote, setCustomActNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // --- COUNTING LOGIC (Exclude Separators) ---
  const totalAudioTracks = useMemo(() => {
      return songs.filter(s => s.type !== 'separator').length;
  }, [songs]);

  const playedAudioTracks = useMemo(() => {
      // Counts non-separator tracks before current index
      if (currentIndex >= songs.length) return totalAudioTracks; // All played
      return songs.slice(0, currentIndex).filter(s => s.type !== 'separator').length;
  }, [songs, currentIndex, totalAudioTracks]);

  // --- VISUAL INDICES CALCULATION (Exclude Separators from numbering) ---
  const visualIndices = useMemo(() => {
      let count = 0;
      return songs.map(s => {
          if (s.type === 'separator') return 0;
          count++;
          return count;
      });
  }, [songs]);

  // Auto-scroll to active song
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  const getRowStyles = (index: number, isActive: boolean, isPlayedLive: boolean, isMissing: boolean) => {
    let classes = "";

    if (isMissing) {
        classes += 'border-red-900/50 bg-red-900/10 text-red-400 hover:bg-red-900/20 cursor-pointer ';
    } else {
        classes += 'border-transparent text-slate-300 ';
        if (appMode === 'editing' && !readOnly) {
            classes += 'bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700 cursor-pointer ';
        } else {
            if (isPlayedLive) {
                 classes += 'bg-red-900/20 text-red-300/50 border-transparent cursor-default grayscale ';
            } else {
                classes += 'bg-slate-800/20 cursor-default ';
            }
        }
    }
    
    if (isActive) {
        if (isPlaying) {
            classes = classes.replace('border-transparent', '').replace('bg-slate-800/40', '');
            classes += 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)] ';
        } else {
            classes = classes.replace('border-transparent', '').replace('bg-slate-800/40', '');
            classes += 'bg-orange-500/20 border-orange-500/50 text-orange-300 shadow-[0_0_15px_rgba(249,115,22,0.15)] ';
        }
    }
    
    return classes;
  };

  const handleRowClick = (index: number, isActive: boolean, isMissing: boolean) => {
      if (readOnly) return; 

      if (isMissing) {
          onRelink(index);
          return; 
      }

      if (appMode === 'presentation') {
          return;
      }
      onSongSelect(index);
  };

  return (
    <div className={`flex flex-col h-full bg-slate-900/50 backdrop-blur-sm transition-colors duration-500 border-r border-slate-800 ${readOnly ? 'pointer-events-none' : ''}`}>
      
      {/* HEADER */}
      <div className="shrink-0 p-4 border-b border-slate-800 bg-slate-900/95 z-10 flex flex-col gap-2">
        <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                 {readOnly ? (
                     <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-900/50 border border-indigo-500 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.3)] animate-pulse">
                         <MessageSquare className="w-4 h-4" />
                         <span className="text-xs font-black uppercase tracking-widest">SOLO CHAT</span>
                     </div>
                 ) : (
                     <>
                         <button 
                            onClick={onRequestModeChange}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                                appMode === 'editing' 
                                    ? 'bg-amber-500/20 border-amber-500 text-amber-400' 
                                    : 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            }`}
                         >
                            {appMode === 'editing' ? <Edit3 className="w-4 h-4"/> : <MonitorPlay className="w-4 h-4"/>}
                            <span className="text-xs font-bold uppercase tracking-wider">
                                {appMode === 'editing' ? t.mode_editing : t.mode_live}
                            </span>
                         </button>
                         
                         {appMode === 'editing' && (
                             <div className="relative">
                                 <button
                                     onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                                     className="p-1.5 rounded-full transition-colors border bg-slate-800 border-slate-600 text-slate-400 hover:text-white"
                                     title="Opzioni"
                                 >
                                     <div className="flex flex-col gap-[3px] p-[3px]">
                                         <div className="w-1 h-1 rounded-full bg-current"></div>
                                         <div className="w-1 h-1 rounded-full bg-current"></div>
                                         <div className="w-1 h-1 rounded-full bg-current"></div>
                                     </div>
                                 </button>
                                 {showOptionsMenu && (
                                     <>
                                         <div className="fixed inset-0 z-30" onClick={() => setShowOptionsMenu(false)}></div>
                                         <div className="absolute top-full left-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-40 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                                            <button 
                                                onClick={() => { onLoadNew(); setShowOptionsMenu(false); }}
                                                className="px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800 text-slate-300 hover:text-white border-b border-slate-800 text-xs font-bold uppercase transition-colors"
                                            >
                                                <span>Carica Playlist</span>
                                                <Upload className="w-4 h-4 text-emerald-400" />
                                            </button>
                                            {onRequestOpenScript && (
                                                <button 
                                                    onClick={() => { onRequestOpenScript(); setShowOptionsMenu(false); }}
                                                    className="px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800 text-slate-300 hover:text-white border-b border-slate-800 text-xs font-bold uppercase transition-colors"
                                                >
                                                    <span>Copione</span>
                                                    <FileText className="w-4 h-4 text-sky-400" />
                                                </button>
                                            )}
                                            {onOpenLog && (
                                                <button 
                                                    onClick={() => { onOpenLog(); setShowOptionsMenu(false); }}
                                                    className="px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800 text-slate-300 hover:text-white border-b border-slate-800 text-xs font-bold uppercase transition-colors"
                                                >
                                                    <span>Log Spettacolo</span>
                                                    <FileText className="w-4 h-4 text-indigo-400" />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => { onOpenRawEditor(); setShowOptionsMenu(false); }}
                                                className="px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold uppercase transition-colors"
                                            >
                                                <span>Editor Testuale</span>
                                                <FileSignature className="w-4 h-4 text-amber-400" />
                                            </button>
                                         </div>
                                     </>
                                 )}
                             </div>
                         )}

                         {appMode === 'editing' && (
                            <button
                                onClick={onOpenInfo}
                                className="p-1.5 rounded-full transition-colors border bg-slate-800 border-slate-600 text-slate-500 hover:text-white hover:border-slate-400"
                                title={t.info_credits}
                            >
                                <Info className="w-4 h-4" />
                            </button>
                         )}

                         {appMode === 'presentation' && isAndroid && onToggleCompactView && (
                            <button
                                onClick={onToggleCompactView}
                                className={`p-1.5 rounded-full transition-colors border ${isCompactView ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-white hover:border-slate-400'}`}
                                title={isCompactView ? "Expand View" : "Compact View"}
                            >
                                {isCompactView ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                            </button>
                         )}
                         
                         {/* PIN NOTE BUTTON FOR DESKTOP */}
                         {!isAndroid && onTogglePinNotes && !hasScript && (
                             <button
                                onClick={onTogglePinNotes}
                                className={`p-1.5 rounded-full transition-colors border ${isNotesPinned ? 'bg-amber-500 text-white border-amber-400' : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-white hover:border-slate-400'}`}
                                title={isNotesPinned ? "Sgancia Note" : "Fissa Note a Destra"}
                             >
                                 <Pin className="w-4 h-4" />
                             </button>
                         )}

                         {!isAndroid && appVersion && (
                             <div className="text-[9px] font-bold text-slate-600 select-none shrink-0 ml-2 border border-slate-700/50 px-1.5 py-0.5 rounded">
                                 {appVersion}
                             </div>
                         )}
                     </>
                 )}
             </div>

             <div className="flex gap-2">
                {!readOnly && appMode === 'presentation' && (
                    <button 
                        onClick={onRequestReset}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors shadow-lg shadow-red-900/20"
                        title={t.reset_tooltip}
                    >
                        <RotateCcw className="w-3 h-3" />
                        {t.reset_show}
                    </button>
                )}

                 {!readOnly && appMode === 'editing' && songs.length > 0 && (
                    <>
                        <button 
                            onClick={onSavePlaylist}
                            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase transition-colors rounded-lg border shadow-sm
                                ${hasUnsavedChanges 
                                    ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 animate-pulse shadow-emerald-900/20' 
                                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white hover:border-emerald-500' // Neutral default
                                }`}
                            title={t.save_playlist}
                        >
                            <Save className="w-4 h-4" />
                            {t.save_playlist}
                        </button>
                    </>
                 )}
             </div>
        </div>

        <div className="flex items-center justify-between px-1">
            {playlistFileName ? (
                <div className="text-[10px] font-mono text-slate-500 truncate select-all" title={playlistFileName}>
                    {playlistFileName}
                </div>
            ) : <div />}
        </div>

        <div className="flex items-center justify-between min-h-[32px]">
            <div className="flex items-center gap-4">
                <h2 className="text-sm font-semibold text-slate-500 flex items-center gap-2">
                    <Music2 className="w-4 h-4" />
                    {appMode === 'editing' ? (
                        <span>{totalAudioTracks} {t.tracks}</span>
                    ) : (
                        <span className="text-emerald-400 font-bold uppercase tracking-wide">
                            {t.played_counter}: <span className="text-white">{playedAudioTracks}</span> / <span className="text-white">{totalAudioTracks}</span>
                        </span>
                    )}
                </h2>

                {/* --- SHOW TIMER (Only Visible in Live Mode) --- */}
                {appMode === 'presentation' && (
                    <ShowTimer start={showStartTime || null} end={showEndTime || null} />
                )}
            </div>

            <div className="flex gap-2 items-center">
                     {onLanguageRequest && (
                    <div className="ml-1">
                            <FlagIcon lang={language} onClick={onLanguageRequest} />
                    </div>
                )}
            </div>
        </div>
      </div>
      
      {/* LIST */}
      <div className="flex-1 overflow-y-auto touch-pan-y overscroll-contain p-4 space-y-2 pb-4">
        {songs.map((song, index) => {
          
          // --- VISUAL SEPARATOR RENDERING ---
          if (song.type === 'separator') {
              return (
                  <div key={song.id} className="group relative flex items-center justify-center py-3 my-2 opacity-80 select-none">
                       {/* Line Left */}
                       <div className="h-px bg-gradient-to-r from-transparent via-slate-600 to-slate-600 w-1/4"></div>
                       
                       {/* Text */}
                       <span 
                            className="mx-4 font-bold text-amber-500 uppercase tracking-[0.2em] text-sm shadow-black drop-shadow-md cursor-text hover:text-white transition-colors"
                            onDoubleClick={(e) => {
                                if (appMode === 'editing' && !readOnly && onRenameSong) {
                                    e.stopPropagation();
                                    onRenameSong(index);
                                }
                            }}
                            title={appMode === 'editing' && !readOnly ? "Doppio click per modificare" : ""}
                        >
                           {song.title}
                       </span>

                       {/* Line Right */}
                       <div className="h-px bg-gradient-to-l from-transparent via-slate-600 to-slate-600 w-1/4"></div>

                       {/* EDITING CONTROLS FOR SEPARATOR */}
                       {appMode === 'editing' && !readOnly && (
                           <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 px-2 py-1 rounded-lg">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onReorder(index, index - 1); }}
                                    disabled={index === 0}
                                    className="p-1 rounded text-slate-400 hover:text-white"
                                >
                                    <ChevronUp className="w-3 h-3" />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onReorder(index, index + 1); }}
                                    disabled={index === songs.length - 1}
                                    className="p-1 rounded text-slate-400 hover:text-white"
                                >
                                    <ChevronDown className="w-3 h-3" />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDeleteSong(index); }}
                                    className="p-1 text-red-500 hover:text-red-400"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                           </div>
                       )}
                  </div>
              );
          }

          const isMissing = !song.url.startsWith('blob:') && !song.url.startsWith('http') && !song.url.startsWith('file:');
          
          const isActive = index === currentIndex;
          const isPlayedLive = appMode === 'presentation' && index < currentIndex;
          
          const hasCuts = !!((song.trimStart && song.trimStart > 0) || (song.trimEnd && song.trimEnd > 0));
          const hasGain = song.customGain !== 1.0;
          const hasNote = !!song.note && song.note.trim().length > 0;
          
          return (
            <button
              key={song.id}
              ref={isActive ? activeRef : null}
              onClick={() => handleRowClick(index, isActive, isMissing)}
              // MODIFIED: Removed isPlayedLive from disabled so double click works
              disabled={readOnly} 
              className={`w-full group flex items-center gap-4 p-4 rounded-xl transition-all duration-200 text-left border ${getRowStyles(index, isActive, isPlayedLive, isMissing)}`}
            >
              <div 
                onClick={(e) => {
                    if (appMode === 'editing' && !readOnly) {
                        e.stopPropagation(); 
                        onRelink(index);
                    }
                }}
                onDoubleClick={(e) => {
                    if (appMode === 'presentation' && !readOnly && onRepositionRequest) {
                        e.stopPropagation();
                        // This will be handled in App.tsx
                        onRepositionRequest(index);
                    }
                }}
                title={appMode === 'editing' ? t.relink_tooltip_badge : (appMode === 'presentation' && !readOnly ? "Doppio click per riposizionare" : "")}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all z-10 
                ${appMode === 'editing' && !readOnly ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-emerald-400' : ''}
                ${appMode === 'presentation' && !readOnly && !isPlaying ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-amber-400' : ''}
                ${isMissing 
                    ? 'bg-red-900 text-red-500 group-hover:bg-red-800' 
                    : isActive 
                        ? (isPlaying ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400')
                        : (isPlayedLive ? 'bg-red-900/30 text-red-500/50' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600')
              }`}>
                
                {isMissing ? (
                    <Link2 className="w-5 h-5 animate-pulse" />
                ) : isActive ? (
                   <Disc className={`w-5 h-5 ${isPlaying ? 'animate-spin' : ''}`} />
                ) : isPlayedLive ? (
                   <Check className="w-4 h-4" />
                ) : (
                  <span className="text-sm font-bold font-mono">{visualIndices[index]}</span>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 overflow-hidden">
                    <h3 
                        // DOUBLE CLICK RENAME HANDLER
                        onDoubleClick={(e) => {
                            if (appMode === 'editing' && !readOnly && onRenameSong) {
                                e.stopPropagation();
                                onRenameSong(index);
                            }
                        }}
                        className={`font-medium truncate select-none ${isPlayedLive ? 'decoration-red-500/50 line-through' : ''} ${appMode === 'editing' && !readOnly ? 'cursor-text hover:text-emerald-400' : ''}`}
                        title={appMode === 'editing' && !readOnly ? "Doppio click per rinominare" : ""}
                    >
                        {song.title}
                    </h3>
                    <SongDuration song={song} isMissing={isMissing} errorText={t.file_error} />
                </div>
                
                <div className="flex items-center justify-between mt-1 h-5">
                    {!isPlayedLive && !isMissing ? (
                        <p className={`text-xs truncate font-mono ${isActive ? 'opacity-80' : 'opacity-50'}`} title={song.path || song.originalFileName || song.url}>
                        {song.path || song.originalFileName || song.url}
                        </p>
                    ) : isMissing ? (
                         <span className="text-[10px] text-red-400 font-bold uppercase truncate flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {t.missing_file}: {song.path || song.originalFileName || song.url}
                         </span>
                    ) : (
                        <span className="text-xs text-red-400/50 font-bold uppercase">{t.played_status}</span>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {!isMissing && hasGain && (
                            <div className={`flex items-center justify-center w-5 h-5 rounded bg-slate-900/50 border border-slate-700 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} title={`Gain: ${Math.round((song.customGain || 1)*100)}%`}>
                                <SignalHigh className="w-3 h-3" />
                            </div>
                        )}
                        {!isMissing && hasCuts && (
                            <div className={`flex items-center justify-center w-5 h-5 rounded bg-slate-900/50 border border-slate-700 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} title="Tagli attivi">
                                <Scissors className="w-3 h-3" />
                            </div>
                        )}
                        
                        {/* FADE ICON MODIFIED TO SHOW DURATION IN TOOLTIP */}
                        {!isMissing && song.hasFadeOut && (
                            <div 
                                className={`flex items-center justify-center w-5 h-5 rounded bg-slate-900/50 border border-slate-700 ${isActive ? 'text-rose-400' : 'text-slate-500'}`} 
                                title={`Fade OUT attivo (${song.fadeOutDuration || 5} sec)`}
                            >
                                <Wind className="w-3 h-3" />
                            </div>
                        )}
                        
                        {!isMissing && hasNote && (
                            <div className={`flex items-center justify-center w-5 h-5 rounded bg-slate-900/50 border border-slate-700 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} title="Nota presente">
                                <StickyNote className="w-3 h-3" />
                            </div>
                        )}
                    </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0 ml-2">
                  {appMode === 'editing' && !readOnly && (
                      <>
                        <div className="flex flex-col gap-1">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onReorder(index, index - 1); }}
                                disabled={index === 0}
                                className={`p-1 rounded bg-slate-800/50 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-all ${index === 0 ? 'opacity-0 pointer-events-none' : ''}`}
                                title="Sposta su"
                            >
                                <ChevronUp className="w-3 h-3" />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onReorder(index, index + 1); }}
                                disabled={index === songs.length - 1}
                                className={`p-1 rounded bg-slate-800/50 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-all ${index === songs.length - 1 ? 'opacity-0 pointer-events-none' : ''}`}
                                title="Sposta giù"
                            >
                                <ChevronDown className="w-3 h-3" />
                            </button>
                        </div>

                        <button 
                            onClick={(e) => { e.stopPropagation(); onDeleteSong(index); }}
                            className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-950/30 rounded-lg transition-colors"
                            title={t.delete_track_title}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                  )}
              </div>
            </button>
          );
        })}

        {appMode === 'editing' && !readOnly && (
             <div className="pt-2 pb-8 flex gap-3">
                 <button 
                    onClick={onAddTrack}
                    className="flex-1 flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl text-slate-500 hover:text-emerald-400 hover:bg-slate-800/50 transition-all group shadow-none hover:shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                 >
                    <Plus className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase tracking-wider">{t.add_track}</span>
                 </button>

                 {onAddSeparator && (
                     <div className="relative">
                         <button 
                             onClick={() => setShowAddActMenu(!showAddActMenu)}
                             className="h-full flex flex-col items-center justify-center gap-1 px-4 border-2 border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl text-slate-500 hover:text-amber-400 hover:bg-slate-800/50 transition-all w-24"
                         >
                            <Divide className="w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Divisore</span>
                         </button>

                         {/* DROPDOWN MENU */}
                         {showAddActMenu && (
                             <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowAddActMenu(false)}></div>
                                <div className="absolute bottom-full mb-2 right-0 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-40 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                                    <button 
                                        onClick={() => { onAddSeparator("ATTO II"); setShowAddActMenu(false); }}
                                        className="p-3 text-left hover:bg-slate-800 text-slate-300 hover:text-white border-b border-slate-800 text-xs font-bold uppercase"
                                    >
                                        ATTO II
                                    </button>
                                    <button 
                                        onClick={() => { onAddSeparator("ATTO III"); setShowAddActMenu(false); }}
                                        className="p-3 text-left hover:bg-slate-800 text-slate-300 hover:text-white border-b border-slate-800 text-xs font-bold uppercase"
                                    >
                                        ATTO III
                                    </button>
                                    <button 
                                        onClick={() => { setShowNoteInput(true); setShowAddActMenu(false); }}
                                        className="p-3 text-left hover:bg-slate-800 text-amber-400 hover:text-amber-300 text-xs font-bold uppercase flex items-center justify-between"
                                    >
                                        Personalizzato... <Edit3 className="w-3 h-3" />
                                    </button>
                                </div>
                             </>
                         )}

                         {/* CUSTOM NOTE INPUT MODAL (Inline logic for simplicity) */}
                         {showNoteInput && (
                            <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6">
                                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm">
                                    <h3 className="text-white font-bold mb-4">Testo Divisore</h3>
                                    <input 
                                        type="text" 
                                        maxLength={20}
                                        value={customActNote}
                                        onChange={(e) => setCustomActNote(e.target.value)}
                                        placeholder="Es. INTERVALLO"
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white mb-4 uppercase font-bold text-center"
                                        autoFocus
                                    />
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setShowNoteInput(false)} className="px-4 py-2 bg-slate-800 rounded text-slate-300 font-bold">Annulla</button>
                                        <button 
                                            onClick={() => { 
                                                if(customActNote.trim()) onAddSeparator(customActNote.toUpperCase()); 
                                                setCustomActNote(""); 
                                                setShowNoteInput(false); 
                                            }} 
                                            className="px-4 py-2 bg-emerald-600 rounded text-white font-bold"
                                        >
                                            Aggiungi
                                        </button>
                                    </div>
                                </div>
                            </div>
                         )}
                     </div>
                 )}
             </div>
        )}
      </div>
    </div>
  );
};

export default PlaylistView;
