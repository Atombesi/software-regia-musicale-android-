import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Song, PlayerState, SfxItem, AppMode, Language } from './types';
import FileLoader from './components/FileLoader';
import PlaylistView from './components/PlaylistView';
import PlayerControls from './components/PlayerControls';
import Waveform from './components/Waveform';
import { Disc3, Radio, Smartphone, RefreshCcw, Grid, Zap, Wind, Clock, Save, Volume2, RotateCcw, MapPin, X, Download, HardDrive, Copy, CheckCircle2, Music2, Trash2, Plus, Edit2, FolderOpen, Play, Pause, AlertOctagon, Keyboard, Minus, FileSignature, Check, Scissors, SignalHigh, Mic, ChevronLeft, ChevronRight, LocateFixed, PlayCircle, PauseCircle, StickyNote, Clapperboard, User, Globe } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding, FileInfo } from '@capacitor/filesystem';
import { translations } from './translations';

// --- HELPERS ---
const formatTimeDetail = (time: number | undefined) => {
  const t = time || 0;
  if (isNaN(t) || !isFinite(t)) return "0:00.00";
  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const parseManualTime = (str: string): number => {
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

const removeExtension = (name: string): string => {
    return name.replace(/\.[^/.]+$/, "");
};

// --- MODALS ---
interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Conferma", cancelText = "Annulla" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center transform scale-100">
                <AlertOctagon className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">{message}</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={onCancel} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-sm transition-colors border border-slate-700">{cancelText}</button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm transition-colors shadow-lg">{confirmText}</button>
                </div>
            </div>
        </div>
    );
};

interface SaveSuccessModalProps {
    isOpen: boolean;
    fileName: string;
    location: string;
    onClose: () => void;
    title: string;
    msgFileUpdated: string;
}

const SaveSuccessModal: React.FC<SaveSuccessModalProps> = ({ isOpen, fileName, location, onClose, title, msgFileUpdated }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.2)] max-w-sm w-full p-8 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-emerald-500/50">
                    <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">{title}</h3>
                <div className="bg-slate-800/50 rounded-xl p-4 w-full mb-6 border border-slate-700">
                    <div className="mb-3">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">{msgFileUpdated}</span>
                        <span className="text-emerald-400 font-mono text-sm font-bold break-all">{fileName}</span>
                    </div>
                </div>
                <button onClick={onClose} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg active:scale-95">OK</button>
            </div>
        </div>
    );
};

// --- INFO MODAL ---
interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    t: any;
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, t }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[160] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full h-[90vh] flex flex-col relative overflow-hidden">
                {/* Background Decor */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                
                {/* Top Section: Header + Author - Fixed */}
                <div className="p-8 pb-4 shrink-0 relative z-10">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-6 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 overflow-hidden relative shrink-0">
                                <Clapperboard className="w-6 h-6 text-emerald-400 absolute z-0" />
                                <img 
                                    src="./icona_app.png" 
                                    className="w-full h-full object-cover relative z-10" 
                                    alt="Icon"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                                />
                            </div>
                            <h2 className="text-3xl font-black text-white tracking-tight">Regia Musiche Attozero</h2>
                        </div>
                        
                        <div className="mt-2 text-right">
                            <span className="text-emerald-400 font-mono font-bold text-sm">ver: 1.0 (Dic 2025)</span>
                        </div>
                    </div>

                    {/* Author Section */}
                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="w-32 h-32 md:w-40 md:h-40 shrink-0 rounded-2xl bg-slate-800 border-2 border-slate-700 overflow-hidden shadow-xl flex items-center justify-center relative">
                            <User className="w-20 h-20 text-slate-600 absolute z-0" />
                            <img 
                                src="./foto_andrea.jpg" 
                                className="w-full h-full object-cover relative z-10" 
                                alt="Andrea Tombesi"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                            />
                        </div>

                        <div className="flex-1 flex flex-col justify-center">
                            <div className="grid grid-cols-[100px_1fr] gap-y-4 text-sm items-center">
                                <div className="text-slate-500 font-bold uppercase tracking-wider text-right pr-4">Author</div>
                                <div className="text-lg font-bold text-white">Andrea Tombesi</div>

                                <div className="text-slate-500 font-bold uppercase tracking-wider text-right pr-4">E-mail</div>
                                <div className="text-base text-emerald-400 font-mono select-all">Brz.modena@gmail.com</div>

                                <div className="text-slate-500 font-bold uppercase tracking-wider text-right pr-4">Web Page</div>
                                <div className="truncate">
                                    <a href="https://andreatombesi.wordpress.com" target="_blank" rel="noopener noreferrer" className="text-base text-indigo-400 hover:text-indigo-300 underline font-mono">
                                        andreatombesi.wordpress.com
                                    </a>
                                </div>

                                <div className="text-slate-500 font-bold uppercase tracking-wider text-right pr-4">Country</div>
                                <div className="text-base text-slate-300">Modena - Italy</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Section: License Title + Box + Button */}
                <div className="flex-1 min-h-0 flex flex-col px-8 pb-8 relative z-10">
                    <strong className="block text-white mb-2 uppercase tracking-wider text-sm shrink-0 pl-1">{t.license_title}</strong>
                    
                    <div className="flex-1 min-h-0 flex gap-4">
                         {/* Text Box (Narrower, Scrollable) */}
                         <div className="flex-1 bg-slate-900/50 rounded-xl p-4 border border-slate-800 text-[11px] text-slate-300 leading-tight shadow-inner overflow-y-auto custom-scrollbar">
                              <p className="mb-2">
                                  <strong>{t.license_freeware_title}</strong> {t.license_freeware_text}
                              </p>
                              <p className="mb-2">
                                  <strong>{t.license_asis_title}</strong> {t.license_asis_text}
                              </p>
                              <p className="mb-4">
                                  {t.license_liability_text}
                              </p>
                              <p className="text-amber-500/90 font-bold border border-amber-500/30 p-2 rounded bg-amber-500/10 mb-4">
                                  {t.license_warning_text}
                              </p>
                              
                              <div className="w-full h-px bg-slate-700/50 my-4" />

                              <strong className="block text-slate-400 mb-2 uppercase text-xs">{t.credits_opensource}</strong>
                              <div className="text-slate-400">
                                  <p className="mb-2">{t.credits_libs}</p>
                                  <ul className="list-disc pl-4 space-y-1">
                                      <li>React, Capacitor, Wavesurfer.js, Lucide React, Tailwind CSS, Vite.</li>
                                  </ul>
                              </div>
                         </div>

                         {/* Close Button Container - Aligned Bottom Right */}
                         <div className="flex flex-col justify-end shrink-0">
                             <button onClick={onClose} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors border border-slate-700 hover:border-slate-500 shadow-lg whitespace-nowrap">
                                 {t.btn_close}
                             </button>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- LANGUAGE SELECTION MODAL ---
interface LanguageModalProps {
    isOpen: boolean;
    currentLang: Language;
    onSelect: (lang: Language) => void;
    onClose: () => void;
}

const LanguageModal: React.FC<LanguageModalProps> = ({ isOpen, currentLang, onSelect, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[180] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full p-6 transform scale-100">
                <div className="flex items-center justify-center gap-3 mb-6 text-indigo-400">
                    <Globe className="w-8 h-8" />
                    <h3 className="text-xl font-bold text-white">{translations[currentLang].select_language}</h3>
                </div>
                
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={() => { onSelect('it'); onClose(); }}
                        className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${currentLang === 'it' ? 'bg-indigo-500/20 border-indigo-500' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                    >
                        <div className="w-10 h-6 shrink-0 border border-white/20 shadow-sm">
                            <svg viewBox="0 0 3 2" className="w-full h-full">
                                <rect width="1" height="2" x="0" fill="#009246" />
                                <rect width="1" height="2" x="1" fill="#ffffff" />
                                <rect width="1" height="2" x="2" fill="#ce2b37" />
                            </svg>
                        </div>
                        <span className={`font-bold ${currentLang === 'it' ? 'text-white' : 'text-slate-400'}`}>Italiano</span>
                        {currentLang === 'it' && <Check className="w-5 h-5 text-indigo-400 ml-auto" />}
                    </button>

                    <button 
                        onClick={() => { onSelect('en'); onClose(); }}
                        className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${currentLang === 'en' ? 'bg-indigo-500/20 border-indigo-500' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                    >
                        <div className="w-10 h-6 shrink-0 border border-white/20 shadow-sm">
                            <svg viewBox="0 0 60 30" className="w-full h-full">
                                <rect width="60" height="30" fill="#012169"/>
                                <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
                                <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4"/>
                                <path d="M30,0 L30,30 M0,15 L60,15" stroke="#fff" strokeWidth="10"/>
                                <path d="M30,0 L30,30 M0,15 L60,15" stroke="#C8102E" strokeWidth="6"/>
                            </svg>
                        </div>
                        <span className={`font-bold ${currentLang === 'en' ? 'text-white' : 'text-slate-400'}`}>English</span>
                        {currentLang === 'en' && <Check className="w-5 h-5 text-indigo-400 ml-auto" />}
                    </button>
                </div>

                <button onClick={onClose} className="mt-6 w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition-colors border border-slate-700">
                    {translations[currentLang].btn_cancel}
                </button>
            </div>
        </div>
    );
};

// --- RAW PLAYLIST EDITOR MODAL ---
interface RawEditorModalProps {
    isOpen: boolean;
    initialContent: string;
    onSave: (content: string) => void;
    onClose: () => void;
    t: any;
}

const RawEditorModal: React.FC<RawEditorModalProps> = ({ isOpen, initialContent, onSave, onClose, t }) => {
    const [content, setContent] = useState(initialContent);

    useEffect(() => {
        if(isOpen) setContent(initialContent);
    }, [isOpen, initialContent]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[135] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col p-6">
                <div className="flex items-center gap-3 mb-4 text-indigo-400 shrink-0">
                    <FileSignature className="w-8 h-8" />
                    <h3 className="text-2xl font-bold text-white">Editor Testuale Playlist</h3>
                </div>
                
                <div className="flex-1 mb-4 relative">
                    <textarea 
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full h-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-emerald-400 font-mono text-sm resize-none focus:outline-none focus:border-indigo-500 leading-relaxed"
                        spellCheck={false}
                    />
                </div>

                <div className="flex gap-3 justify-end shrink-0">
                    <button onClick={onClose} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700">{t.btn_cancel}</button>
                    <button 
                        onClick={() => { onSave(content); }} 
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors shadow-lg flex items-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        {t.save_playlist}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- NOTE EDIT MODAL ---
interface NoteModalProps {
    isOpen: boolean;
    initialValue: string;
    onSave: (val: string) => void;
    onClose: () => void;
    t: any;
}

const NoteModal: React.FC<NoteModalProps> = ({ isOpen, initialValue, onSave, onClose, t }) => {
    const [val, setVal] = useState(initialValue);
    
    // Update local state when modal opens or initialValue changes
    useEffect(() => {
        if(isOpen) setVal(initialValue || "");
    }, [isOpen, initialValue]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full p-6 transform scale-100">
                <div className="flex items-center gap-3 mb-4 text-amber-400">
                    <StickyNote className="w-8 h-8" />
                    <h3 className="text-2xl font-bold text-white">{t.director_note}</h3>
                </div>
                
                <textarea 
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    className="w-full h-40 bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-lg resize-none focus:outline-none focus:border-amber-500 placeholder-slate-600 mb-6"
                    placeholder={t.no_note_placeholder}
                    autoFocus
                />

                <div className="flex gap-3 justify-end">
                    <button onClick={onClose} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700">{t.btn_cancel}</button>
                    <button 
                        onClick={() => { onSave(val); onClose(); }} 
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-lg flex items-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        {t.btn_save}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- TIME EDIT MODAL ---
interface TimeEditModalProps {
    isOpen: boolean;
    type: 'start' | 'end' | 'duration' | null;
    initialValue: number;
    onSave: (val: number) => void;
    onClose: () => void;
    t: any;
}

const TimeEditModal: React.FC<TimeEditModalProps> = ({ isOpen, type, initialValue, onSave, onClose, t }) => {
    const [valStr, setValStr] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValStr(formatTimeDetail(initialValue));
            setTimeout(() => inputRef.current?.select(), 100);
        }
    }, [isOpen, initialValue]);

    if (!isOpen || !type) return null;

    const handleSave = () => {
        const num = parseManualTime(valStr);
        onSave(num);
        onClose();
    };

    const titleMap = {
        'start': t.time_start,
        'end': t.time_end,
        'duration': t.time_duration
    };

    return (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
                <Clock className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-4">{titleMap[type]}</h3>
                
                <input 
                    ref={inputRef}
                    type="text" 
                    value={valStr} 
                    onChange={(e) => setValStr(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="w-full bg-slate-800 border-2 border-indigo-500/50 rounded-xl py-4 text-3xl font-mono text-center text-white font-bold mb-6 focus:outline-none focus:border-indigo-400"
                />

                <div className="grid grid-cols-2 gap-3">
                    <button onClick={onClose} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700">{t.btn_cancel}</button>
                    <button onClick={handleSave} className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors shadow-lg">{t.btn_apply}</button>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  // LANGUAGE STATE
  const [language, setLanguage] = useState<Language>('it');
  const [langModalOpen, setLangModalOpen] = useState(false);
  const t = translations[language];

  const [songs, setSongs] = useState<Song[]>([]);
  const [sfxItems, setSfxItems] = useState<SfxItem[]>(new Array(6).fill(undefined));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playedSongIds, setPlayedSongIds] = useState<Set<string>>(new Set());
  
  // NEW STATE: Flag to determine if a playlist (even empty) is loaded
  const [isPlaylistLoaded, setIsPlaylistLoaded] = useState(false);

  // EDITING STATE
  const [editingSfxIndex, setEditingSfxIndex] = useState<number | null>(null);

  // 'html5' = Live style (Strict), 'waveform' = Editor style (Raw)
  const [playbackSource, setPlaybackSource] = useState<'html5' | 'waveform'>('html5');

  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
  });

  const [appMode, setAppMode] = useState<AppMode>('editing');
  const [showWaveform, setShowWaveform] = useState(true); 
  
  // COMPACT VIEW STATE
  const [isCompactView, setIsCompactView] = useState(false);

  const [activeSfxIndices, setActiveSfxIndices] = useState<Set<number>>(new Set());
  const activeSfxAudioRefs = useRef<{[index: number]: HTMLAudioElement}>({});

  const [sourceFileName, setSourceFileName] = useState<string>("playlist.txt");
  const [sourceFilePath, setSourceFilePath] = useState<string | null>(null);
  const [sourceDirectory, setSourceDirectory] = useState<Directory | undefined>(undefined);

  // PERSISTENT EXPLORER PATH STATE
  const [lastExplorerPath, setLastExplorerPath] = useState<string>('');

  // PICKER MODAL STATE - ADDED 'relink' and 'save' TARGETS
  const [pickerState, setPickerState] = useState<{isOpen: boolean; target: 'track' | 'sfx' | 'relink' | 'save'; index?: number}>({isOpen: false, target: 'track'});

  // Modals
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; action: () => void; confirmText?: string; cancelText?: string}>({isOpen: false, title: '', message: '', action: () => {}});
  const [saveSuccessModal, setSaveSuccessModal] = useState({ isOpen: false, location: '' });
  const [timeEditModal, setTimeEditModal] = useState<{isOpen: boolean; type: 'start'|'end'|'duration'|null; value: number}>({isOpen: false, type: null, value: 0});
  const [noteModalOpen, setNoteModalOpen] = useState(false); 
  const [infoModalOpen, setInfoModalOpen] = useState(false); // New Info Modal
  const [rawEditorOpen, setRawEditorOpen] = useState(false); // Raw Editor
  const [pendingSaveContent, setPendingSaveContent] = useState<string | null>(null); // For raw save

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveSeekRequestRef = useRef<number | null>(null);
  const localSaveBtnRef = useRef<HTMLButtonElement>(null);
  const fadeIntervalRef = useRef<any>(null);
  
  // Volume Ref to track visual slider without re-triggering effects
  const volumeRef = useRef<number>(1.0);

  const editingTarget = editingSfxIndex !== null ? sfxItems[editingSfxIndex] : songs[currentIndex];
  const hasTarget = !!editingTarget && !!editingTarget.url;

  // --- HANDLERS (DEFINED BEFORE EFFECT) ---
  const handleTrackEnd = useCallback(() => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      if (audioRef.current) audioRef.current.pause();

      if (editingSfxIndex === null) {
          const currentId = songs[currentIndex]?.id;
          if (currentId) setPlayedSongIds(prev => new Set(prev).add(currentId));

          if (appMode === 'presentation') {
               // Allow advancing past the last track to reach "End of Show" state (index = length)
               if (currentIndex < songs.length) {
                   const nextIndex = currentIndex + 1;
                   setCurrentIndex(nextIndex);
                   
                   const nextSong = songs[nextIndex];
                   
                   if (nextSong) {
                       // VISUAL PREPARE: Jump to Start of next track immediately
                       setPlayerState(prev => ({
                           ...prev,
                           isPlaying: false,
                           currentTime: nextSong.trimStart || 0,
                       }));
                   } else {
                       // END OF SHOW REACHED
                       setPlayerState(prev => ({
                           ...prev,
                           isPlaying: false,
                           currentTime: 0,
                           duration: 0
                       }));
                       if(audioRef.current) audioRef.current.src = "";
                   }
               }
          }
      } 
      
      // Clear Fade Interval just in case
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
  }, [appMode, currentIndex, songs, editingSfxIndex, editingTarget]);

  // --- INITIALIZATION ---
  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;
    
    const updateState = () => {
      // ONLY update state from HTML5 Audio if it is the active source
      if (playbackSource === 'html5') {
          const t = audio.currentTime;
          
          // --- AUTO FADE & END CHECK (HTML5 STRICT MODE) ---
          if (editingTarget) {
              const start = editingTarget.trimStart || 0;
              const end = (editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : audio.duration;
              const fadeDuration = 3; // 3 Seconds Fade

              // 1. Check End
              if (t >= end - 0.05) { // Small tolerance
                  handleTrackEnd();
                  return;
              }

              // 2. Auto Fade Out (Automatic via config)
              if (editingTarget.hasFadeOut && end > 0) {
                  const remaining = end - t;
                  // Use REF for base volume to avoid stale closures and dependency loops
                  const baseVol = volumeRef.current; 

                  if (remaining <= fadeDuration && remaining > 0) {
                      const factor = remaining / fadeDuration; // 0 to 1
                      audio.volume = baseVol * factor;
                  } else {
                      // Ensure volume is consistent if we scrub around
                      // audio.volume = baseVol;
                  }
              }
          }

          setPlayerState(prev => ({
            ...prev,
            currentTime: t,
            duration: audio.duration || 0
          }));
      }
    };

    const handleEnded = () => { 
        if (playbackSource === 'html5') {
            handleTrackEnd(); 
        }
    };

    audio.addEventListener('timeupdate', updateState);
    audio.addEventListener('loadedmetadata', updateState);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateState);
      audio.removeEventListener('loadedmetadata', updateState);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, [playbackSource, editingTarget, handleTrackEnd]); // REMOVED playerState.volume to fix fade conflict

  // --- AUDIO SOURCE MANAGEMENT ---
  useEffect(() => {
    if (audioRef.current) {
        // Source Loading
        if (editingTarget && editingTarget.url) {
             const currentSrc = audioRef.current.src;
             if (!currentSrc.includes(editingTarget.url) && editingTarget.url.startsWith('blob:') === false) {
                 audioRef.current.src = editingTarget.url;
             } else if (editingTarget.url.startsWith('blob:')) {
                 audioRef.current.src = editingTarget.url;
             }
             
             // --- VOLUME INITIALIZATION (REV 2.0) ---
             // Initialize slider and audio volume to the Track's Saved Custom Gain.
             const initialVol = editingTarget.customGain || 1.0;
             if (!playerState.isPlaying) { // Only reset on load/stop, not during play if this effect runs
                 audioRef.current.volume = initialVol;
                 volumeRef.current = initialVol; // Sync Ref
                 setPlayerState(prev => ({ ...prev, volume: initialVol }));
             }

             // Ensure visual state matches song start if changed while paused
             if (!playerState.isPlaying && playbackSource === 'html5') {
                 // Check if we are far from start (e.g. just loaded new track)
                 // This ensures "Preparing" the next track sets the cursor correctly
                 const start = editingTarget.trimStart || 0;
                 if (Math.abs(playerState.currentTime - start) > 0.5 && Math.abs(audioRef.current.currentTime - start) > 0.5) {
                     // Force sync mainly for the UI, audio seek happens on play or explicit seek
                 }
             }

        } else {
            audioRef.current.src = "";
        }

        // PLAYBACK CONTROL SPLIT
        if (playbackSource === 'html5') {
            // HTML5 IS MASTER (Live or Blue Button Editing)
            if (playerState.isPlaying && audioRef.current.paused) {
                 // STRICT START: If we are before trimStart, jump there
                 const start = editingTarget?.trimStart || 0;
                 if (audioRef.current.currentTime < start - 0.1 || Math.abs(audioRef.current.currentTime - start) < 0.1) {
                     audioRef.current.currentTime = start;
                 }
                 
                 audioRef.current.play().catch(e => console.error(e));
            } else if (!playerState.isPlaying && !audioRef.current.paused) {
                 audioRef.current.pause();
            }
        } else {
            // WAVEFORM IS MASTER (Editor Small Button)
            // Silence HTML5
            if (!audioRef.current.paused) {
                audioRef.current.pause();
            }
        }
    }
  }, [currentIndex, editingSfxIndex, songs, sfxItems, playerState.isPlaying, playbackSource, editingTarget]); // Ensure editingTarget update triggers reload

  // BLUE BUTTON (BOTTOM) - "Execute as Live"
  const handleMainPlay = () => {
      if (hasTarget) {
          setPlaybackSource('html5');
          setPlayerState(prev => ({ ...prev, isPlaying: true }));
      }
  };

  // EDITOR BUTTON (SMALL) - "Raw Play"
  const handleEditorPlay = () => {
      if (hasTarget) {
          setPlaybackSource('waveform');
          setPlayerState(prev => ({ ...prev, isPlaying: true }));
      }
  };

  const handlePause = () => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
  };

  const handleStop = () => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      if(audioRef.current) {
          audioRef.current.pause();
          // Reset volume to the tracks default (ready for next play)
          if(editingTarget) {
              const resetVol = editingTarget.customGain || 1.0;
              audioRef.current.volume = resetVol;
              volumeRef.current = resetVol;
              setPlayerState(prev => ({...prev, volume: resetVol}));
          }
      }

      if (appMode === 'presentation') {
           // In Live, STOP means Next (Prepare Next) OR Finish if last
           if (editingSfxIndex === null && currentIndex < songs.length) {
               const nextIndex = currentIndex + 1;
               setCurrentIndex(nextIndex);
               const nextSong = songs[nextIndex];
               
               if (nextSong) {
                   // Prepare visual
                   setPlayerState(prev => ({
                        ...prev,
                        currentTime: nextSong.trimStart || 0
                   }));
               } else {
                   // End of Show State
                   setPlayerState(prev => ({
                        ...prev,
                        currentTime: 0,
                        duration: 0
                   }));
                   if(audioRef.current) audioRef.current.src = "";
               }
           }
      } else {
          // In Editing, Stop means Pause + seek to start
           const startTime = (editingTarget && editingTarget.trimStart) ? editingTarget.trimStart : 0;
           setPlayerState(prev => ({ ...prev, currentTime: startTime }));
           
           // If we were in waveform mode, sync it
           waveSeekRequestRef.current = startTime;
           setTimeout(() => { waveSeekRequestRef.current = null; }, 50);
      }
  };

  // --- MANUAL FADE BUTTON ---
  const handleManualFade = () => {
      if (!audioRef.current || !playerState.isPlaying) return;
      
      // Prevent multiple fades
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      const startVol = audioRef.current.volume;
      const duration = 2500; // 2.5s fade
      const steps = 50; // updates
      const intervalTime = duration / steps;
      const volStep = startVol / steps;

      fadeIntervalRef.current = setInterval(() => {
          if (audioRef.current) {
              const newVol = Math.max(0, audioRef.current.volume - volStep);
              
              // CRITICAL: Update ref and audio directly to ensure smoothness
              volumeRef.current = newVol;
              audioRef.current.volume = newVol;
              
              // Update state for UI visual only (Slider)
              // Since volume is removed from useEffect deps, this won't restart the player
              setPlayerState(prev => ({...prev, volume: newVol})); 

              if (newVol <= 0.01) {
                  clearInterval(fadeIntervalRef.current);
                  handleTrackEnd(); // Stop and Next
              }
          } else {
               clearInterval(fadeIntervalRef.current);
          }
      }, intervalTime);
  };

  const handleNext = () => {
      if (editingSfxIndex !== null) return;
      if (currentIndex < songs.length - 1) {
          const nextIndex = currentIndex + 1;
          setCurrentIndex(nextIndex);
          // Visual Prepare
          const nextSong = songs[nextIndex];
          setPlayerState(prev => ({
            ...prev,
            isPlaying: false,
            currentTime: nextSong.trimStart || 0
          }));
      }
  };

  const handlePrev = () => {
      if (editingSfxIndex !== null) return;
      if (currentIndex > 0) {
          const nextIndex = currentIndex - 1;
          setCurrentIndex(nextIndex);
          // Visual Prepare
          const nextSong = songs[nextIndex];
          setPlayerState(prev => ({
            ...prev,
            isPlaying: false,
            currentTime: nextSong.trimStart || 0
          }));
      }
  };

  const handleSeek = (time: number) => {
      if (editingTarget) {
          let target = time;
          const start = editingTarget.trimStart || 0;
          const end = (editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : (playerState.duration || 100);
          target = Math.max(start, Math.min(end, time));
          
          setPlayerState(prev => ({ ...prev, currentTime: target }));
          
          // Sync both engines just in case
          if (audioRef.current) audioRef.current.currentTime = target;
          waveSeekRequestRef.current = target; 
          setTimeout(() => { waveSeekRequestRef.current = null; }, 100);
      }
  };

  const handleVolume = (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      
      // Update everything in sync
      volumeRef.current = clamped;
      setPlayerState(prev => ({ ...prev, volume: clamped }));
      
      if (audioRef.current) {
          audioRef.current.volume = clamped; 
      }
  };

  // --- SFX GRID PLAYBACK (FIRE & FORGET) ---
  const playSfxGrid = (index: number) => {
      if (editingSfxIndex === index) {
          if (playerState.isPlaying) handlePause();
          else handleMainPlay(); // Use main play for convenience
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

      const item = sfxItems[index];
      if (item && item.url) {
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
  };

  // --- DATA MANAGEMENT ---
  const updateTargetItem = (updater: (item: Song | SfxItem) => Song | SfxItem) => {
      if (editingSfxIndex !== null) {
          setSfxItems(prev => {
              const copy = [...prev];
              if (copy[editingSfxIndex]) {
                  copy[editingSfxIndex] = updater(copy[editingSfxIndex]) as SfxItem;
              }
              return copy;
          });
      } else {
          setSongs(prev => {
              const copy = [...prev];
              if (copy[currentIndex]) {
                  copy[currentIndex] = updater(copy[currentIndex]) as Song;
              }
              return copy;
          });
      }
  };

  const handlePlaylistLoaded = (newSongs: Song[], newSfx: SfxItem[], fileName?: string, path?: string, directory?: Directory) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setSongs(newSongs);
    setSfxItems(newSfx);
    setCurrentIndex(0);
    setEditingSfxIndex(null); 
    setPlayedSongIds(new Set());
    setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0, duration: 0 }));
    if (fileName) setSourceFileName(fileName);
    if (path) setSourceFilePath(path); 
    if (directory) setSourceDirectory(directory);
    
    // IMPORTANT: Set flag to true to show the app interface even if playlist is empty
    setIsPlaylistLoaded(true);
  };

  const handleLoadSingle = (file: File) => {
      const newSong: Song = { id: `manual-${Date.now()}`, title: removeExtension(file.name), url: URL.createObjectURL(file), artist: 'Manual Load', originalFileName: file.name };
      setSongs([newSong]);
      setCurrentIndex(0);
      setEditingSfxIndex(null);
      setPlayedSongIds(new Set());
      setSourceFilePath(null); 
  };

  // --- NEW FILE PICKER HANDLING ---
  const handleOpenPicker = (target: 'track' | 'sfx' | 'relink', index?: number) => {
      setPickerState({ isOpen: true, target, index });
  };

  const handlePickerSelect = (fileInfo: FileInfo, resolvedUrl: string, fullPath: string) => {
      const target = pickerState.target;
      const index = pickerState.index;
      
      if (target === 'save') return;

      if (target === 'track') {
          // Add Track
          const newSong: Song = { 
              id: `added-${Date.now()}`, 
              title: removeExtension(fileInfo.name), 
              url: resolvedUrl, 
              path: fullPath,
              artist: 'Added Track', 
              originalFileName: fileInfo.name 
          };
          setSongs(prev => [...prev, newSong]);
      } else if (target === 'sfx' && index !== undefined) {
          // Add SFX
          setSfxItems(prev => {
              const copy = [...prev];
              copy[index] = {
                  id: `sfx-${Date.now()}`,
                  label: removeExtension(fileInfo.name).substring(0, 10),
                  url: resolvedUrl,
                  path: fullPath,
                  originalFileName: fileInfo.name,
                  trimStart: 0, trimEnd: 0, hasFadeOut: false, customGain: 1.0
              };
              return copy;
          });
      } else if (target === 'relink' && index !== undefined) {
           // Relink Existing Track
           setSongs(prev => {
                const copy = [...prev];
                const old = copy[index];
                copy[index] = {
                    ...old,
                    url: resolvedUrl,
                    path: fullPath,
                    originalFileName: fileInfo.name
                    // Keeps trimStart, trimEnd, customGain, note, etc.
                };
                return copy;
           });
      }
      setPickerState(prev => ({ ...prev, isOpen: false }));
  };

  const handleSfxClick = (index: number) => {
      if (appMode === 'editing') {
          const item = sfxItems[index];
          if (!item || !item.url) {
              handleOpenPicker('sfx', index);
          } else {
              setEditingSfxIndex(index);
              handleStop(); 
          }
      } 
      else {
          playSfxGrid(index);
      }
  };

  const handleDeleteSfx = (index: number) => {
       setConfirmModal({
          isOpen: true, 
          title: t.delete_sfx_title, 
          message: t.delete_sfx_msg,
          confirmText: t.btn_confirm,
          cancelText: t.btn_cancel,
          action: () => {
              if (editingSfxIndex === index) {
                  setEditingSfxIndex(null); 
                  handleStop();
              }
              setSfxItems(prev => {
                  const copy = [...prev];
                  copy[index] = undefined as any; 
                  return copy;
              });
              setConfirmModal(prev => ({...prev, isOpen: false}));
          }
      });
  };

  const handleResetPlayed = () => {
      setConfirmModal({
          isOpen: true, 
          title: t.reset_show, 
          message: t.reset_show_msg,
          confirmText: t.btn_confirm,
          cancelText: t.btn_cancel,
          action: () => {
              setPlayedSongIds(new Set());
              setCurrentIndex(0);
              setEditingSfxIndex(null);
              
              // MANUAL STOP LOGIC to prevent handleStop() from auto-advancing in live mode
              setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
              if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
              if(audioRef.current) {
                  audioRef.current.pause();
                  // Reset volume to the tracks default (ready for next play)
                  if(songs[0]) {
                      const resetVol = songs[0].customGain || 1.0;
                      audioRef.current.volume = resetVol;
                      volumeRef.current = resetVol;
                      setPlayerState(prev => ({...prev, volume: resetVol}));
                  }
                  // Force seek to 0
                  audioRef.current.currentTime = 0;
              }
              // End Manual Stop Logic

              setConfirmModal(prev => ({...prev, isOpen: false}));
          }
      });
  };

  const handleModeChangeRequest = () => {
      if (appMode === 'editing') {
          setConfirmModal({
              isOpen: true, 
              title: t.switch_live_title, 
              message: t.switch_live_msg,
              confirmText: t.btn_confirm,
              cancelText: t.btn_cancel,
              action: () => {
                   setAppMode('presentation');
                   setEditingSfxIndex(null); 
                   setPlaybackSource('html5'); // Ensure Live mode uses HTML5
                   handleStop();
                   setConfirmModal(prev => ({...prev, isOpen: false}));
              }
          });
      } else {
          setConfirmModal({
              isOpen: true, 
              title: t.switch_edit_title, 
              message: t.switch_edit_msg,
              confirmText: t.btn_confirm,
              cancelText: t.btn_cancel,
              action: () => {
                   setAppMode('editing');
                   handleStop();
                   setConfirmModal(prev => ({...prev, isOpen: false}));
              }
          });
      }
  };

  // --- EDITING LOGIC ---
  const handleUpdateRegion = (start: number, end: number) => {
      if (appMode !== 'editing') return;
      updateTargetItem((item) => ({ ...item, trimStart: start, trimEnd: end }));
  };

  // NEW SNAP LOGIC
  const handleManualAdjust = (type: 'start' | 'end' | 'duration', delta: number) => {
    if (appMode !== 'editing' || !editingTarget) return;
    
    let newStart = editingTarget.trimStart || 0;
    let newEnd = (editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration;
    
    // Helper to snap to integer
    const snap = (val: number, d: number) => {
        let base = Math.floor(val);
        if (Math.abs(val - base) < 0.01) {
            return Math.max(0, val + d);
        }
        if (d > 0) return base + 1;
        else return Math.max(0, base); 
    };

    if (type === 'start') {
        newStart = snap(newStart, delta);
        if (newEnd > 0 && newStart >= newEnd) newStart = Math.max(0, newEnd - 1);
        handleUpdateRegion(newStart, newEnd);
    } else if (type === 'end') {
        newEnd = snap(newEnd, delta);
        if (newEnd > 0 && newEnd <= newStart) newEnd = newStart + 1;
        handleUpdateRegion(newStart, newEnd);
    } else if (type === 'duration') {
        let currentDuration = Math.max(0, newEnd - newStart);
        let newDuration = snap(currentDuration, delta);
        newDuration = Math.max(1, newDuration);
        newEnd = newStart + newDuration;
        handleUpdateRegion(newStart, newEnd);
    }
  };

  // OPEN MODAL
  const handleOpenTimeModal = (type: 'start' | 'end' | 'duration') => {
      if (appMode !== 'editing' || !editingTarget) return;
      let val = 0;
      if (type === 'start') val = editingTarget.trimStart || 0;
      else if (type === 'end') val = (editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration;
      else if (type === 'duration') val = Math.max(0, ((editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration) - (editingTarget.trimStart || 0));

      setTimeEditModal({ isOpen: true, type, value: val });
  };

  const handleModalSave = (newVal: number) => {
      const type = timeEditModal.type;
      if (!type || !editingTarget) return;

      let start = editingTarget.trimStart || 0;
      let end = (editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration;

      if (type === 'start') handleUpdateRegion(newVal, end);
      else if (type === 'end') handleUpdateRegion(start, newVal);
      else if (type === 'duration') handleUpdateRegion(start, start + newVal);
  };

  const handleCaptureMark = (type: 'in' | 'out') => {
      if (appMode !== 'editing' || !editingTarget) return;
      const currentTime = playerState.currentTime;
      let start = editingTarget.trimStart || 0;
      let end = (editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration;

      if (type === 'in') {
          const newStart = Math.min(currentTime, end - 0.1);
          handleUpdateRegion(newStart, end);
      } else {
          const newEnd = Math.max(currentTime, start + 0.1);
          handleUpdateRegion(start, newEnd);
      }
  };
  
  const handleResetTrackConditions = () => {
      if (appMode !== 'editing') return;
      updateTargetItem((item) => ({ ...item, trimStart: 0, trimEnd: 0, customGain: 1.0, hasFadeOut: false }));
      if(audioRef.current) audioRef.current.currentTime = 0;
      setPlayerState(prev => ({...prev, currentTime: 0}));
  };

  const handleDeleteSong = (index: number) => {
       setConfirmModal({
          isOpen: true, 
          title: t.delete_track_title, 
          message: t.delete_track_msg,
          confirmText: t.btn_confirm,
          cancelText: t.btn_cancel,
          action: () => {
              if (index === currentIndex && playerState.isPlaying) {
                  handleStop();
              }
              setSongs(prev => {
                  const newSongs = [...prev];
                  newSongs.splice(index, 1);
                  return newSongs;
              });
              if (index < currentIndex) {
                  setCurrentIndex(prev => Math.max(0, prev - 1));
              } else if (index === currentIndex) {
                  if (currentIndex >= songs.length - 1) {
                      setCurrentIndex(prev => Math.max(0, prev - 1));
                  }
              }
              setConfirmModal(prev => ({...prev, isOpen: false}));
          }
      });
  };

  // -- GENERATE PLAYLIST TEXT HELPER --
  const generatePlaylistFileContent = () => {
      const isAndroid = Capacitor.getPlatform() === 'android';
      let content = "";
      songs.forEach(s => {
          // Use FULL PATH first, then Fallback to filename/URL
          let path = s.path || s.originalFileName || s.url;
          // FORCE BACKSLASH FOR WINDOWS
          if (!isAndroid) {
              path = path.replace(/\//g, '\\');
          }
          content += `${s.title};${path};${s.trimStart || 0};${s.trimEnd || 0};${s.hasFadeOut ? '1' : '0'};${s.customGain || 1.0};${s.note || ''}\n`;
      });
      sfxItems.forEach((sfx, idx) => {
          if (sfx && sfx.url) {
             let path = sfx.path || sfx.originalFileName || sfx.url;
             // FORCE BACKSLASH FOR WINDOWS
             if (!isAndroid) {
                 path = path.replace(/\//g, '\\');
             }
             content += `SFX;${idx};${sfx.label};${path};${sfx.trimStart || 0};${sfx.trimEnd || 0};${sfx.hasFadeOut ? '1' : '0'};${sfx.customGain || 1.0}\n`;
          }
      });
      return content;
  };

  // Handle opening Raw Editor
  const handleOpenRawEditor = () => {
      setPendingSaveContent(null);
      setRawEditorOpen(true);
  };

  const handleRawSaveRequest = (content: string) => {
      setPendingSaveContent(content);
      // Immediately trigger name selection via the new Picker Save As
      handleRequestSavePlaylist(); 
      setRawEditorOpen(false); // Close editor
  };

  // Replaced direct save with Modal opener
  const handleRequestSavePlaylist = () => {
      // Determine initial path for the saver
      let initPath = lastExplorerPath; // Default to last used or current explorer location
      if (sourceFilePath && sourceFilePath.includes('/')) {
           // Try to use the current file's directory if available
           initPath = sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/'));
      }
      setLastExplorerPath(initPath); // Set the explorer to open here
      setPickerState({ isOpen: true, target: 'save' });
  };

  // NEW: Save from File Loader (Save As)
  const handleSaveFromLoader = async (fileName: string, fullPath: string, directory: Directory) => {
      // Use pending content if coming from raw editor, otherwise regenerate from objects
      const content = pendingSaveContent !== null ? pendingSaveContent : generatePlaylistFileContent();
      setPendingSaveContent(null); // Clear pending

      if (Capacitor.getPlatform() === 'web') {
           const blob = new Blob([content], { type: 'text/plain' });
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = fileName;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(url);
           setSaveSuccessModal({ isOpen: true, location: 'Download Browser' });
           setPickerState(prev => ({ ...prev, isOpen: false }));
      } else {
          try {
              await Filesystem.writeFile({
                  path: fullPath,
                  data: content,
                  directory: directory,
                  encoding: Encoding.UTF8
              });
              
              setSourceFileName(fileName);
              setSourceFilePath(fullPath);
              setSourceDirectory(directory);
              
              setSaveSuccessModal({ isOpen: true, location: fullPath });
              setPickerState(prev => ({ ...prev, isOpen: false }));
          } catch (e: any) {
              alert("Errore salvataggio: " + e.message);
          }
      }
  };

  const handleLocalCommit = () => {
      // Handle the generic editor save button
      if (localSaveBtnRef.current) {
          const btn = localSaveBtnRef.current;
          btn.classList.add('bg-emerald-500', 'text-white', 'border-emerald-400', 'scale-110');
          setTimeout(() => {
              btn.classList.remove('bg-emerald-500', 'text-white', 'border-emerald-400', 'scale-110');
          }, 400);
      }
  };

  // --- RENDER VARS ---
  const currentDurationDisplay = editingTarget ? Math.max(0, ((editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration) - (editingTarget.trimStart || 0)) : 0;
  const currentTrimEndDisplay = editingTarget ? ((editingTarget.trimEnd && editingTarget.trimEnd > 0) ? editingTarget.trimEnd : playerState.duration) : 0;
  const currentTrimStartDisplay = editingTarget ? (editingTarget.trimStart || 0) : 0;

  // IMPORTANT: Changed condition to use explicit flag. 
  // This allows empty playlists to be "loaded".
  if (!isPlaylistLoaded) {
      return (
          <>
            <FileLoader 
                onPlaylistLoaded={handlePlaylistLoaded} 
                onOpenInfo={() => setInfoModalOpen(true)}
                initialPath={lastExplorerPath}
                onPathChange={setLastExplorerPath}
                language={language}
            />
            <InfoModal isOpen={infoModalOpen} onClose={() => setInfoModalOpen(false)} t={t} />
          </>
      );
  }

  return (
    <div className={`h-full w-full flex flex-col ${appMode === 'presentation' ? 'bg-black' : 'bg-slate-950'} transition-colors duration-500 overflow-hidden`}>
      
      {/* Hidden Inputs */}
      {/* NOTE: SFX input removed in favor of modal picker */}
      
      {/* FILE PICKER MODAL OVERLAY */}
      {pickerState.isOpen && (
          <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="w-full h-full flex items-center justify-center p-6">
                   <div className="w-full h-full max-w-5xl bg-slate-950 rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
                       <FileLoader 
                           pickerMode={pickerState.target !== 'save'} // Only track/sfx/relink are "picker" modes
                           onClose={() => setPickerState(prev => ({...prev, isOpen: false}))}
                           onFileSelect={handlePickerSelect}
                           onPlaylistLoaded={() => {}} // Not used in picker mode
                           onOpenInfo={() => {}} // Not used in picker mode
                           initialPath={lastExplorerPath}
                           onPathChange={setLastExplorerPath}
                           // SAVE AS PROPS
                           saveMode={pickerState.target === 'save'}
                           defaultFileName={sourceFileName}
                           onSave={handleSaveFromLoader}
                           language={language}
                       />
                   </div>
              </div>
          </div>
      )}

      {/* MAIN CONTENT */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
          
          {/* LEFT: PLAYLIST (40%) */}
          <div className="w-[40%] flex flex-col border-r border-slate-800 relative z-10 bg-slate-900/50">
             <PlaylistView 
                songs={songs}
                currentIndex={currentIndex}
                isPlaying={playerState.isPlaying && editingSfxIndex === null} // Only show playing if playing Playlist
                onSongSelect={(idx) => { 
                    setCurrentIndex(idx); 
                    setEditingSfxIndex(null); // Switch back to playlist
                    setPlayerState(prev => ({...prev, isPlaying: false})); 
                }}
                onLoadNew={() => setConfirmModal({
                    isOpen: true, 
                    title: t.load_new_title, 
                    message: t.load_new_msg,
                    confirmText: t.btn_confirm,
                    cancelText: t.btn_cancel,
                    action: () => {
                        setSongs([]);
                        setIsPlaylistLoaded(false); // CRITICAL: Reset loaded flag to show FileLoader
                        setConfirmModal(prev => ({...prev, isOpen: false}));
                    }
                })}
                onLoadSingle={handleLoadSingle}
                onAddTrack={() => handleOpenPicker('track')} 
                onReorder={(a,b) => {
                     setSongs(prev => {
                        const u = [...prev]; const [m] = u.splice(a,1); u.splice(b,0,m);
                        if(currentIndex===a) setCurrentIndex(b);
                        else if(currentIndex>a && currentIndex<=b) setCurrentIndex(currentIndex-1);
                        else if(currentIndex<a && currentIndex>=b) setCurrentIndex(currentIndex+1);
                        return u;
                     });
                }}
                onDeleteSong={handleDeleteSong}
                appMode={appMode}
                onRequestModeChange={handleModeChangeRequest} 
                playedSongIds={playedSongIds}
                onRequestReset={handleResetPlayed}
                onExportPlaylist={handleRequestSavePlaylist}
                showWaveform={showWaveform}
                onToggleWaveform={() => setShowWaveform(!showWaveform)}
                onOpenRawEditor={handleOpenRawEditor}
                onOpenInfo={() => setInfoModalOpen(true)}
                onRelink={(idx) => handleOpenPicker('relink', idx)} // Pass handler
                language={language}
                onLanguageRequest={() => setLangModalOpen(true)}
                playlistFileName={sourceFileName} // Pass Filename
                isCompactView={isCompactView}
                onToggleCompactView={() => setIsCompactView(!isCompactView)}
             />
          </div>

          {/* RIGHT: TOOLS & WAVEFORM & SFX (60%) */}
          <div className="w-[60%] flex flex-col bg-slate-900 border-l border-slate-800">
             
             {/* 1. WAVEFORM (Dynamic Height) */}
             <div className="h-16 shrink-0 border-b border-slate-800 relative bg-black/40 transition-[height] duration-300 overflow-hidden">
                {showWaveform ? (
                    <Waveform 
                        url={editingTarget?.url || ''}
                        isPlaying={playerState.isPlaying && playbackSource === 'waveform'} // Play only if source is waveform
                        volume={playerState.volume}
                        trimStart={editingTarget?.trimStart}
                        trimEnd={editingTarget?.trimEnd}
                        isEditing={appMode === 'editing'}
                        hasFadeOut={editingTarget?.hasFadeOut} // New prop for color logic
                        onReady={(d) => setPlayerState(prev => ({...prev, duration: d}))}
                        onFinish={handleTrackEnd}
                        onTimeUpdate={(t) => {
                             // If waveform is playing raw, update state
                             if (playbackSource === 'waveform') {
                                 setPlayerState(prev => ({...prev, currentTime: t}));
                             }
                             // IMPORTANT: In editing, if paused (or manually scrubbing), we still want to track cursor 
                             // to allow Mark In/Out to work on cursor position.
                             else if (appMode === 'editing' && !playerState.isPlaying) {
                                 setPlayerState(prev => ({...prev, currentTime: t}));
                             }
                        }}
                        onRegionChange={handleUpdateRegion}
                        onCursorMove={(t) => {}}
                        seekRequest={waveSeekRequestRef.current}
                        // Sync with HTML5 player if that's the source
                        syncTime={playbackSource === 'html5' ? playerState.currentTime : null}
                        language={language}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 font-mono text-xs">{t.waveform_hidden}</div>
                )}
             </div>

             {/* 2. EDITOR (Hidden Header in Live) */}
             {/* CONDITIONAL RENDER: Hide entirely in Compact Live Mode */}
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
                     
                     {/* ROW 1: TIME CONTROLS */}
                     <div className="flex items-center justify-center gap-4 w-full">
                         
                         {/* START */}
                         <div className="flex flex-col items-center gap-1">
                             <span className="text-[9px] text-slate-500 font-bold uppercase">{t.time_start}</span>
                             <div className="flex items-center gap-2">
                                {/* MARK IN BUTTON (LEFT) - OUTSIDE KEYS */}
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

                         {/* DURATION */}
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

                         {/* END */}
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

                                {/* MARK OUT BUTTON (RIGHT) - OUTSIDE KEYS */}
                                <button onClick={() => handleCaptureMark('out')} disabled={appMode !== 'editing'} className="p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-red-400 shadow-md hover:bg-red-900/50 hover:text-white disabled:opacity-0 transition-colors" title={t.mark_out}><MapPin className="w-5 h-5" /></button>
                             </div>
                         </div>
                     </div>

                     {/* ROW 2: PLAY/PAUSE -> RESET -> VOLUME -> FADE -> NOTE -> COMMIT */}
                     {appMode === 'editing' && (
                        <>
                            <div className="w-full h-px bg-slate-800/50" />
                            <div className="flex items-center justify-center gap-4 w-full animate-in fade-in slide-in-from-top-2">
                                 
                                 {/* 0. EDITOR PLAY/PAUSE (RAW) */}
                                 <button
                                    onClick={playerState.isPlaying && playbackSource === 'waveform' ? handlePause : handleEditorPlay}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${playerState.isPlaying && playbackSource === 'waveform' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50' : 'bg-slate-800 text-slate-300 border border-slate-600 hover:text-white hover:border-white'}`}
                                    title={t.play_raw_tooltip}
                                 >
                                    {playerState.isPlaying && playbackSource === 'waveform' ? <PauseCircle className="w-6 h-6" /> : <PlayCircle className="w-6 h-6" />}
                                 </button>

                                 {/* 1. RESET */}
                                 <button onClick={handleResetTrackConditions} className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-500 hover:text-white hover:border-white transition-all shadow-sm" title={t.reset_track_tooltip}><RefreshCcw className="w-4 h-4" /></button>
                                 
                                 {/* 2. VOLUME */}
                                 <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-700">
                                     <span className="text-[10px] text-slate-500 font-bold uppercase w-12 text-right">{t.volume}</span>
                                     <input type="range" min="0" max="1" step="0.01" value={editingTarget?.customGain || 1.0} onChange={(e) => updateTargetItem(i => ({...i, customGain: parseFloat(e.target.value)}))} className="w-32 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-white" />
                                     <span className="font-mono text-xs w-10 text-center text-indigo-400 font-bold">{Math.round((editingTarget?.customGain || 1)*100)}%</span>
                                 </div>

                                 {/* 3. FADE */}
                                 <button 
                                    onClick={() => updateTargetItem(i => ({...i, hasFadeOut: !i.hasFadeOut}))}
                                    className={`h-10 px-4 rounded-lg border flex items-center gap-2 transition-all ${editingTarget?.hasFadeOut ? 'bg-rose-900/40 border-rose-500 text-rose-400' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}
                                 >
                                     <Wind className="w-4 h-4" />
                                     <span className="text-xs font-bold">{t.fade_btn}</span>
                                 </button>

                                 {/* 3.5. NOTE BUTTON (NEW) - ONLY FOR SONGS */}
                                 {editingSfxIndex === null && (
                                     <button 
                                        onClick={() => setNoteModalOpen(true)}
                                        className="h-10 w-10 ml-2 rounded-xl border border-slate-600 bg-slate-800 text-amber-400 hover:text-white hover:border-amber-500 transition-all flex items-center justify-center"
                                        title={t.edit_note_tooltip}
                                     >
                                         <StickyNote className="w-5 h-5" />
                                     </button>
                                 )}

                                 {/* 4. COMMIT / SAVE LOCAL */}
                                 <button
                                    ref={localSaveBtnRef}
                                    onClick={handleLocalCommit}
                                    className="h-10 w-10 ml-2 rounded-xl border border-slate-600 bg-slate-800 text-slate-400 hover:text-white hover:border-emerald-500 transition-all flex items-center justify-center"
                                    title={t.commit_tooltip}
                                 >
                                     <Save className="w-5 h-5" />
                                 </button>
                            </div>
                        </>
                     )}
                 </div>
             )}

             {/* 3. SFX GRID */}
             {/* Dynamic Layout: If Compact Live, change flex-1/grid to shrink-0/flex-row */}
             <div className={`flex flex-col min-h-0 bg-slate-900/50 ${isCompactView && appMode === 'presentation' ? 'shrink-0 border-b border-slate-800' : 'flex-1'}`}>
                 {appMode === 'editing' && (
                    <div className="p-2 border-b border-slate-800 flex items-center gap-2 bg-slate-800/30">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.sfx_section}</span>
                    </div>
                 )}
                 <div className={`overflow-y-auto ${isCompactView && appMode === 'presentation' ? 'p-1' : 'flex-1 p-2'}`}>
                     <div className={`${isCompactView && appMode === 'presentation' ? 'flex flex-row w-full justify-evenly items-center' : 'grid grid-cols-3 gap-2 h-full'}`}>
                         {sfxItems.map((sfx, idx) => {
                             // COMPACT FILTER: Hide empty slots in Compact Mode
                             if (isCompactView && appMode === 'presentation' && (!sfx || !sfx.url)) return null;

                             const isPlaying = activeSfxIndices.has(idx); // Playback state (Live/Fire&Forget)
                             const isEditingThis = editingSfxIndex === idx; // Edit state
                             const hasFile = sfx && sfx.url;
                             const hasGain = sfx && sfx.customGain !== 1.0;
                             const hasCuts = sfx && ((sfx.trimStart && sfx.trimStart > 0) || (sfx.trimEnd && sfx.trimEnd > 0));
                             const hasFade = sfx && sfx.hasFadeOut;
                             
                             return (
                                 <button
                                    key={idx}
                                    onClick={() => handleSfxClick(idx)}
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
                                     {hasFile ? (
                                         <>
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className={`rounded-full flex items-center justify-center transition-colors 
                                                    ${isCompactView && appMode === 'presentation' ? 'w-4 h-4' : 'w-6 h-6'}
                                                    ${isPlaying ? 'bg-lime-500 text-slate-900' : (isEditingThis ? 'bg-indigo-500 text-white' : 'bg-amber-500/10 group-hover:bg-amber-500/20')}`}>
                                                    {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : (isEditingThis ? <Edit2 className="w-3 h-3" /> : <Zap className="w-3 h-3 text-amber-500" />)}
                                                </div>
                                                
                                                {/* MOVED STATUS ICONS TO TOP, NEXT TO MAIN ICON */}
                                                {!isCompactView && (
                                                    <div className="flex items-center gap-0.5 opacity-80">
                                                        {hasGain && <SignalHigh className={`w-3 h-3 ${isEditingThis ? 'text-indigo-300' : 'text-slate-400'}`} />}
                                                        {hasCuts && <Scissors className={`w-3 h-3 ${isEditingThis ? 'text-indigo-300' : 'text-slate-400'}`} />}
                                                        {hasFade && <Wind className={`w-3 h-3 ${isEditingThis ? 'text-indigo-300' : 'text-slate-400'}`} />}
                                                    </div>
                                                )}
                                            </div>

                                            <span className={`font-bold truncate w-full text-center ${isCompactView && appMode === 'presentation' ? 'text-[10px] leading-none' : 'text-xs'} ${isPlaying ? 'text-lime-400' : (isEditingThis ? 'text-indigo-300' : 'text-white')}`}>{sfx.label || `SFX ${idx+1}`}</span>
                                            
                                            {/* DELETE BTN (Editing only) */}
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

             {/* 4. DIRECTOR NOTE (LIVE ONLY) - Removed from Editing View */}
             {editingSfxIndex === null && appMode === 'presentation' && (
                <div className="shrink-0 bg-slate-900 p-3 border-t border-slate-800">
                    <div className={`flex items-start gap-3 ${isCompactView ? 'h-24' : 'h-16'}`}>
                        
                        {/* NOTE ICON BUTTON (STATIC IN LIVE) */}
                        <button 
                            disabled={true}
                            className="p-2 rounded-lg border border-amber-500/30 shrink-0 transition-all bg-amber-900/20 text-amber-400 cursor-default"
                        >
                            <StickyNote className="w-5 h-5" />
                        </button>

                        <div className="flex-1 h-full">
                            <div className={`w-full h-full rounded-lg p-2 text-sm font-bold flex items-center leading-tight overflow-hidden ${
                                (editingTarget as Song)?.note 
                                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200' 
                                : 'bg-slate-800/50 border border-slate-800 text-slate-600 italic'
                            }`}>
                                <span className={`${isCompactView ? 'line-clamp-3' : 'line-clamp-2'} whitespace-pre-wrap`}>
                                    {(editingTarget as Song)?.note || t.no_note_placeholder}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
             )}
          </div>
      </div>

      {/* BOTTOM CONTROLS */}
      <div className="shrink-0 h-24 bg-slate-900 border-t border-slate-800 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
         <PlayerControls 
            state={playerState}
            onPlayPause={() => playerState.isPlaying && playbackSource === 'html5' ? handlePause() : handleMainPlay()} // Main Play always triggers HTML5 mode
            onNext={handleNext}
            onPrev={handlePrev}
            onStop={handleStop}
            onSeek={handleSeek}
            onVolumeChange={handleVolume}
            onFade={handleManualFade} 
            title={editingTarget ? (editingSfxIndex !== null ? (editingTarget as SfxItem).label : (editingTarget as Song).title) : t.no_track_title}
            startTime={editingTarget?.trimStart || 0}
            endTime={editingTarget?.trimEnd || 0}
            appMode={appMode}
            language={language}
         />
      </div>

      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} confirmText={confirmModal.confirmText} cancelText={confirmModal.cancelText} onConfirm={confirmModal.action} onCancel={() => setConfirmModal(prev => ({...prev, isOpen: false}))} />
      <SaveSuccessModal isOpen={saveSuccessModal.isOpen} fileName={sourceFileName} location={saveSuccessModal.location} title={t.saved_title} msgFileUpdated={t.file_updated} onClose={() => setSaveSuccessModal(prev => ({ ...prev, isOpen: false }))} />
      <TimeEditModal isOpen={timeEditModal.isOpen} type={timeEditModal.type} initialValue={timeEditModal.value} onSave={handleModalSave} onClose={() => setTimeEditModal(prev => ({...prev, isOpen: false}))} t={t} />
      <NoteModal isOpen={noteModalOpen} initialValue={(editingTarget as Song)?.note || ''} onSave={(val) => updateTargetItem(i => ({...i, note: val}))} onClose={() => setNoteModalOpen(false)} t={t} />
      {/* SavePlaylistModal REMOVED: Replaced by Picker Save Mode */}
      <InfoModal isOpen={infoModalOpen} onClose={() => setInfoModalOpen(false)} t={t} />
      <RawEditorModal isOpen={rawEditorOpen} initialContent={generatePlaylistFileContent()} onSave={handleRawSaveRequest} onClose={() => setRawEditorOpen(false)} t={t} />
      <LanguageModal isOpen={langModalOpen} currentLang={language} onSelect={setLanguage} onClose={() => setLangModalOpen(false)} />
    </div>
  );
};

export default App;