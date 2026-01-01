import React, { useEffect, useRef, useState } from 'react';
import { Song, AppMode, Language } from '../types';
import { Music2, PlayCircle, PauseCircle, Upload, Disc, Check, Edit3, MonitorPlay, RotateCcw, Save, Scissors, Wind, SignalHigh, GripVertical, Plus, AlertTriangle, Activity, Trash2, FileSignature, Info, Link2, ChevronUp, ChevronDown, StickyNote, Minimize2, Maximize2, FilePenLine, FileText } from 'lucide-react';
import { translations } from '../translations';

interface PlaylistViewProps {
  songs: Song[];
  currentIndex: number;
  isPlaying: boolean;
  onSongSelect: (index: number) => void;
  // onPlayPause rimosso dall'uso diretto nelle righe, usato solo per controlli globali se necessario
  onLoadNew: () => void;
  onLoadSingle: (file: File) => void;
  onAddTrack: () => void; // Changed: No longer accepts file, just triggers picker
  onReorder: (fromIndex: number, toIndex: number) => void; 
  onDeleteSong: (index: number) => void; // New Prop
  appMode: AppMode;
  onRequestModeChange: () => void; // Changed from setAppMode
  playedSongIds: Set<string>;
  onRequestReset: () => void; // Changed from onResetPlayed
  onSavePlaylist: () => void; // RIPRISTINATO NOME UNICO PER IL SALVATAGGIO
  showWaveform: boolean;
  onToggleWaveform: () => void;
  onOpenRawEditor: () => void;
  onOpenInfo: () => void; // NEW PROP
  onRelink: (index: number) => void; // NEW PROP FOR RELINKING
  language?: Language;
  onLanguageRequest?: () => void; // NEW PROP to trigger language selector
  playlistFileName?: string; // NEW PROP for displaying filename
  isCompactView?: boolean; // NEW PROP for Compact Mode State
  onToggleCompactView?: () => void; // NEW PROP for Compact Mode Toggle
  appVersion?: string; // NEW PROP: App Version String
  isAndroid?: boolean; // NEW PROP: Platform check
  onOpenLog?: () => void; // NEW PROP: Open Log Viewer
}

// --- HELPER: Format Duration (MM:SS) ---
const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

// --- COMPONENT: Flag Icon (Visual Only) ---
// Now accepts click handler from parent
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
        audio.preload = 'metadata'; // Load only metadata to get duration
        
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
            audio.src = ''; // Clean up
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
  onOpenLog 
}) => {
  const activeRef = useRef<HTMLButtonElement>(null);
  const t = translations[language];

  // Auto-scroll to active song
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  const getRowStyles = (index: number, isActive: boolean, isPlayedLive: boolean, isMissing: boolean) => {
    let classes = "";

    if (isMissing) {
        // Updated Missing Style: Hoverable to indicate interaction (relink)
        classes += 'border-red-900/50 bg-red-900/10 text-red-400 hover:bg-red-900/20 cursor-pointer ';
    } else {
        classes += 'border-transparent text-slate-300 ';
        // In Editing: Hover effects allowed
        if (appMode === 'editing') {
            classes += 'bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700 cursor-pointer ';
        } else {
            // In Live: Check if played (previous track)
            if (isPlayedLive) {
                 // Light red background for played tracks in live mode
                 classes += 'bg-red-900/20 text-red-300/50 border-transparent cursor-default grayscale ';
            } else {
                // In Live: No hover bg, cursor default (locked) for active/future
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
      if (isMissing) {
          // Trigger Relink Logic
          onRelink(index);
          return; 
      }

      // LIVE MODE: Completely disable interaction via list
      if (appMode === 'presentation') {
          return;
      }
      // EDITING MODE: Allow selection
      onSongSelect(index);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 backdrop-blur-sm transition-colors duration-500 border-r border-slate-800">
      
      {/* HEADER: Mode Switch & Tools */}
      <div className="shrink-0 p-4 border-b border-slate-800 bg-slate-900/95 z-10 flex flex-col gap-2">
        
        {/* Top Row: Title + Mode Toggle */}
        <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
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
                 
                 {/* RAW EDITOR BUTTON - ONLY EDITING */}
                 {appMode === 'editing' && (
                    <button
                        onClick={onOpenRawEditor}
                        className="p-1.5 rounded-full transition-colors border bg-slate-800 border-slate-600 text-slate-400 hover:text-white hover:border-indigo-500 hover:bg-slate-700"
                        title="Editor Testuale Playlist (Raw)"
                    >
                        <FileSignature className="w-4 h-4" />
                    </button>
                 )}

                 {/* INFO BUTTON (EDITING ONLY) */}
                 {appMode === 'editing' && (
                    <button
                        onClick={onOpenInfo}
                        className="p-1.5 rounded-full transition-colors border bg-slate-800 border-slate-600 text-slate-500 hover:text-white hover:border-slate-400"
                        title={t.info_credits}
                    >
                        <Info className="w-4 h-4" />
                    </button>
                 )}

                 {/* COMPACT MODE BUTTON (LIVE ONLY) */}
                 {appMode === 'presentation' && onToggleCompactView && (
                    <button
                        onClick={onToggleCompactView}
                        className={`p-1.5 rounded-full transition-colors border ${isCompactView ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-white hover:border-slate-400'}`}
                        title={isCompactView ? "Expand View" : "Compact View"}
                    >
                        {isCompactView ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                    </button>
                 )}

                 {/* Version - Windows Only (MOVED HERE) */}
                 {!isAndroid && appVersion && (
                     <div className="text-[9px] font-bold text-slate-600 select-none shrink-0 ml-2 border border-slate-700/50 px-1.5 py-0.5 rounded">
                         {appVersion}
                     </div>
                 )}
             </div>

             <div className="flex gap-2">
                {appMode === 'presentation' && (
                    <button 
                        onClick={onRequestReset}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors shadow-lg shadow-red-900/20"
                        title={t.reset_tooltip}
                    >
                        <RotateCcw className="w-3 h-3" />
                        {t.reset_show}
                    </button>
                )}

                 {appMode === 'editing' && songs.length > 0 && (
                    <>
                         {/* LOG VIEWER BUTTON - ONLY IF AVAILABLE */}
                         {onOpenLog && (
                             <button
                                 onClick={onOpenLog}
                                 className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold uppercase text-indigo-300 hover:text-white bg-slate-800 hover:bg-indigo-600 rounded-lg transition-colors border border-slate-700 hover:border-indigo-500 shadow-md"
                                 title="Visualizza Log Spettacolo"
                             >
                                 <FileText className="w-4 h-4" />
                             </button>
                         )}

                        {/* SINGLE SAVE BUTTON */}
                        <button 
                            onClick={onSavePlaylist}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase text-emerald-400 hover:text-white bg-slate-800 hover:bg-emerald-600 rounded-lg transition-colors border border-slate-700 hover:border-emerald-500 shadow-lg"
                            title={t.save_playlist}
                        >
                            <Save className="w-4 h-4" />
                            {t.save_playlist}
                        </button>
                    </>
                 )}
             </div>
        </div>

        {/* MIDDLE ROW: Playlist Filename Display */}
        <div className="flex items-center justify-between px-1">
            {playlistFileName ? (
                <div className="text-[10px] font-mono text-slate-500 truncate select-all" title={playlistFileName}>
                    {playlistFileName}
                </div>
            ) : <div />}
        </div>

        {/* Bottom Row: Loaders (Only Visible in Editing Mode) */}
        <div className="flex items-center justify-between min-h-[32px]">
            <h2 className="text-sm font-semibold text-slate-500 flex items-center gap-2">
                <Music2 className="w-4 h-4" />
                {appMode === 'editing' ? (
                     <span>{songs.length} {t.tracks}</span>
                ) : (
                     <span className="text-emerald-400 font-bold uppercase tracking-wide">
                         {t.played_counter}: <span className="text-white">{currentIndex}</span> / <span className="text-white">{songs.length}</span>
                     </span>
                )}
            </h2>

            <div className="flex gap-2 items-center">
                {/* LOAD BUTTON - EDITING ONLY */}
                {appMode === 'editing' && (
                    <button
                        onClick={onLoadNew}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors text-slate-300 hover:text-white border border-slate-700 hover:border-indigo-500 shadow-sm"
                        title={t.load_new}
                    >
                        <Upload className="w-4 h-4" />
                        {t.load_btn}
                    </button>
                )}

                {/* FLAG ICON - ALWAYS HERE (AFTER LOAD) */}
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
          // CHECK IF FILE IS MISSING (url is effectively a filename, not a blob/http)
          // FIX: Added 'file:' protocol check for Electron
          const isMissing = !song.url.startsWith('blob:') && !song.url.startsWith('http') && !song.url.startsWith('file:');
          
          const isActive = index === currentIndex;
          // Logic for 'Played' in live mode: Any track before the current index
          const isPlayedLive = appMode === 'presentation' && index < currentIndex;
          
          // BOOLEAN FIX: Force cast to boolean to avoid printing '0'
          const hasCuts = !!((song.trimStart && song.trimStart > 0) || (song.trimEnd && song.trimEnd > 0));
          const hasGain = song.customGain !== 1.0;
          const hasNote = !!song.note && song.note.trim().length > 0;
          
          return (
            <button
              key={song.id}
              ref={isActive ? activeRef : null}
              onClick={() => handleRowClick(index, isActive, isMissing)}
              disabled={isPlayedLive} // Remove disabled for missing, handle in onClick
              className={`w-full group flex items-center gap-4 p-4 rounded-xl transition-all duration-200 text-left border ${getRowStyles(index, isActive, isPlayedLive, isMissing)}`}
            >
              {/* Index Column - CLICKABLE BADGE IN EDITING */}
              <div 
                onClick={(e) => {
                    // IF IN EDITING MODE: Click triggers RELINK (change file)
                    if (appMode === 'editing') {
                        e.stopPropagation(); // Stop row select
                        onRelink(index);
                    }
                }}
                title={appMode === 'editing' ? t.relink_tooltip_badge : ""}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all z-10 
                ${appMode === 'editing' ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-emerald-400' : ''}
                ${isMissing 
                    ? 'bg-red-900 text-red-500 group-hover:bg-red-800' 
                    : isActive 
                        ? (isPlaying ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400')
                        : (isPlayedLive ? 'bg-red-900/30 text-red-500/50' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600')
              }`}>
                
                {isMissing ? (
                    <Link2 className="w-5 h-5 animate-pulse" />
                ) : isActive ? (
                   // Show Activity/Music Icon if active, but NOT a button
                   <Activity className={`w-5 h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
                ) : isPlayedLive ? (
                   <Check className="w-4 h-4" />
                ) : (
                  <span className="text-sm font-bold font-mono">{index + 1}</span>
                )}
              </div>
              
              {/* MIDDLE COLUMN: Title and Info + Status Icons */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 overflow-hidden">
                    <h3 className={`font-medium truncate ${isPlayedLive ? 'decoration-red-500/50 line-through' : ''}`}>
                    {song.title}
                    </h3>
                    <SongDuration song={song} isMissing={isMissing} errorText={t.file_error} />
                </div>
                
                {/* Filename + Status Icons Row */}
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

                    {/* MOVED STATUS ICONS HERE (Right aligned) */}
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
                        {!isMissing && song.hasFadeOut && (
                            <div className={`flex items-center justify-center w-5 h-5 rounded bg-slate-900/50 border border-slate-700 ${isActive ? 'text-rose-400' : 'text-slate-500'}`} title="Fade Out attivo">
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
              
              {/* RIGHT COLUMN: Interaction Controls Only (Arrows + Trash) */}
              <div className="flex items-center gap-3 shrink-0 ml-2">
                  {appMode === 'editing' && (
                      <>
                        {/* MOVE BUTTONS - STACKED LEFT OF TRASH */}
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

                        {/* DELETE BUTTON */}
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

        {appMode === 'editing' && (
             <div className="pt-2 pb-8">
                 <button 
                    onClick={onAddTrack}
                    className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl text-slate-500 hover:text-emerald-400 hover:bg-slate-800/50 transition-all group shadow-none hover:shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                 >
                    <Plus className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase tracking-wider">{t.add_track}</span>
                 </button>
             </div>
        )}
      </div>
    </div>
  );
};

export default PlaylistView;