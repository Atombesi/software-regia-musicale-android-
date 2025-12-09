import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, FolderOpen, FileText, Monitor, ChevronRight, Folder, Music, AlertTriangle, ArrowUpCircle, FilePlus, Info, X, Save } from 'lucide-react';
import { Song, SfxItem, Language } from '../types';
import { Filesystem, Directory, Encoding, FileInfo } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { translations } from '../translations';

interface FileLoaderProps {
  onPlaylistLoaded: (songs: Song[], sfx: SfxItem[], sourceFileName?: string, sourcePath?: string, sourceDirectory?: Directory) => void;
  onOpenInfo: () => void;
  // New Props for Picker Mode
  onClose?: () => void;
  pickerMode?: boolean;
  onFileSelect?: (file: FileInfo, resolvedUrl: string, fullPath: string) => void;
  // New Props for Path Persistence
  initialPath?: string;
  onPathChange?: (path: string) => void;
  language?: Language;
  // SAVE AS PROPS
  saveMode?: boolean;
  defaultFileName?: string;
  onSave?: (fileName: string, fullPath: string, directory: Directory) => void;
}

const FileLoader: React.FC<FileLoaderProps> = ({ 
    onPlaylistLoaded, 
    onOpenInfo, 
    onClose, 
    pickerMode = false, 
    onFileSelect, 
    initialPath = '', 
    onPathChange, 
    language = 'it',
    saveMode = false,
    defaultFileName = '',
    onSave
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const t = translations[language]; // Translation helper
  
  // STATE FOR ANDROID EXPLORER
  const [isAndroid, setIsAndroid] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [rootDirectory, setRootDirectory] = useState<Directory>(Directory.ExternalStorage);
  const [dirContents, setDirContents] = useState<FileInfo[]>([]);
  const [explorerInitialized, setExplorerInitialized] = useState(false);

  // SAVE INPUT STATE
  const [saveFileName, setSaveFileName] = useState(defaultFileName);

  // STATE FOR WEB INPUT
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
        setIsAndroid(true);
        // If in picker mode OR save mode on Android, start explorer immediately
        if (pickerMode || saveMode) {
             initializeExplorer();
        }
    }
  }, [pickerMode, saveMode]);

  // Update current path if initial path changes (e.g. fresh mount with stored state)
  useEffect(() => {
      if (initialPath) {
          setCurrentPath(initialPath);
      }
  }, [initialPath]);

  // Sync default filename
  useEffect(() => {
      if (defaultFileName) setSaveFileName(defaultFileName);
  }, [defaultFileName]);

  const initializeExplorer = () => {
      setExplorerInitialized(true);
      // Use currentPath (which might be initialPath) or fallback to Download
      const startPath = currentPath || 'Download';
      loadAndroidDir(startPath, Directory.ExternalStorage);
  };

  const extractFileName = (path: string): string => {
      if (!path) return "";
      try { path = decodeURIComponent(path); } catch (e) {}
      path = path.replace(/['"]/g, '');
      return path.replace(/^.*[\\\/]/, '').trim();
  };

  const removeExtension = (name: string): string => {
      return name.replace(/\.[^/.]+$/, "");
  };

  const isAudioFile = (name: string): boolean => {
      return /\.(mp3|wav|ogg|m4a|flac|aac|wma|aiff|alac|3gp|mp4|amr|mid)$/i.test(name);
  };

  // ==========================================
  // PARSING LOGIC
  // ==========================================
  const parsePlaylistContent = (content: string): { songs: Song[], sfx: SfxItem[] } => {
      const lines = content.split('\n');
      const songs: Song[] = [];
      const sfx: SfxItem[] = new Array(6).fill(undefined);

      lines.forEach((line, index) => {
          if (!line.trim()) return;
          const parts = line.split(';');
          
          if (parts[0] === 'SFX') {
              // SFX;index;label;path;trimStart;trimEnd;hasFadeOut;customGain
              const idx = parseInt(parts[1]);
              if (!isNaN(idx) && idx >= 0 && idx < 6) {
                  sfx[idx] = {
                      id: `sfx-${Date.now()}-${idx}`,
                      label: parts[2],
                      url: parts[3],
                      path: parts[3], // STORE RAW PATH
                      originalFileName: extractFileName(parts[3]),
                      trimStart: parseFloat(parts[4]) || 0,
                      trimEnd: parseFloat(parts[5]) || 0,
                      hasFadeOut: parts[6] === '1',
                      customGain: parseFloat(parts[7]) || 1.0
                  };
              }
          } else {
              // title;path;trimStart;trimEnd;hasFadeOut;customGain;note
              if (parts.length >= 2) {
                   songs.push({
                      id: `song-${Date.now()}-${index}`,
                      title: parts[0],
                      url: parts[1],
                      path: parts[1], // STORE RAW PATH
                      originalFileName: extractFileName(parts[1]),
                      trimStart: parseFloat(parts[2]) || 0,
                      trimEnd: parseFloat(parts[3]) || 0,
                      hasFadeOut: parts[4] === '1',
                      customGain: parseFloat(parts[5]) || 1.0,
                      note: parts[6] || ''
                   });
              }
          }
      });
      return { songs, sfx };
  };

  // ==========================================
  // ANDROID FILE EXPLORER
  // ==========================================

  const loadAndroidDir = async (path: string, directory: Directory) => {
      try {
          setIsProcessing(true);
          setError(null);

          try {
             const perm = await Filesystem.checkPermissions();
             if (perm.publicStorage !== 'granted') {
                 const req = await Filesystem.requestPermissions();
                 if (req.publicStorage !== 'granted') {
                     throw new Error(t.error_permission);
                 }
             }
          } catch (e) {
             console.warn("Permission check skipped/failed", e);
          }

          const result = await Filesystem.readdir({
              path: path,
              directory: directory
          });
          
          const sorted = result.files.sort((a, b) => {
              const aTxt = a.name.toLowerCase().endsWith('.txt');
              const bTxt = b.name.toLowerCase().endsWith('.txt');
              const aAudio = isAudioFile(a.name);
              const bAudio = isAudioFile(b.name);

              if (a.type === 'directory' && b.type !== 'directory') return -1;
              if (a.type !== 'directory' && b.type === 'directory') return 1;
              
              // Sort logic depends on mode
              if (pickerMode) {
                   if (aAudio && !bAudio) return -1;
                   if (!aAudio && bAudio) return 1;
              } else {
                   if (aTxt && !bTxt) return -1;
                   if (!aTxt && bTxt) return 1;
              }
              
              return a.name.localeCompare(b.name);
          });

          setDirContents(sorted);
          setCurrentPath(path);
          setRootDirectory(directory);
          
          // Notify parent of path change
          if (onPathChange) {
              onPathChange(path);
          }

      } catch (err: any) {
          console.error(err);
          // If path failed (e.g. folder moved), fallback to root
          if (path !== '') {
              loadAndroidDir('', directory);
              return;
          }
          setError(t.error_read_folder + ": " + (err.message || JSON.stringify(err)));
          setDirContents([]); 
      } finally {
          setIsProcessing(false);
      }
  };

  const handleNavigateUp = () => {
      if (!currentPath || currentPath === '.') return;
      const parts = currentPath.split('/');
      parts.pop();
      const newPath = parts.join('/') || ''; 
      loadAndroidDir(newPath, rootDirectory);
  };

  const resolveFileUrl = async (file: FileInfo, pathPrefix: string): Promise<string> => {
       const filePath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
       try {
           const uriResult = await Filesystem.getUri({
               path: filePath,
               directory: rootDirectory
           });
           return Capacitor.convertFileSrc(uriResult.uri);
       } catch (e) {
           console.error("URI Resolution failed", e);
           return "";
       }
  };

  const handleFileClick = async (file: FileInfo) => {
      if (file.type === 'directory') {
          const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
          loadAndroidDir(newPath, rootDirectory);
          return;
      } 
      
      // SAVE MODE: Clicking a file selects its name (overwrite)
      if (saveMode) {
          if (file.type === 'file') {
              setSaveFileName(file.name);
          }
          return;
      }

      // PICKER MODE LOGIC (Add Track or Relink)
      if (pickerMode) {
          if (isAudioFile(file.name)) {
              if (onFileSelect) {
                  // Capture Full Path for saving
                  const fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
                  const url = await resolveFileUrl(file, currentPath);
                  onFileSelect(file, url, fullPath);
              }
              if (onClose) onClose();
          }
          return;
      }

      // NORMAL PLAYLIST LOAD MODE
      if (file.name.toLowerCase().endsWith('.txt')) {
          try {
              setIsProcessing(true);
              const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
              const contents = await Filesystem.readFile({
                  path: filePath,
                  directory: rootDirectory,
                  encoding: Encoding.UTF8
              });
              
              const parsed = parsePlaylistContent(contents.data as string);
              
              // --- HYBRID PATH RESOLUTION ---
              const resolvePath = async (filenameOrPath: string) => {
                   if (!filenameOrPath) return "";
                   
                   // 1. Try path AS IS (Absolute/Stored Path)
                   try {
                       const uriResult = await Filesystem.getUri({
                           path: filenameOrPath,
                           directory: rootDirectory
                       });
                       return Capacitor.convertFileSrc(uriResult.uri);
                   } catch (e) {
                       // 2. Fallback: Try Relative to Current Playlist Folder
                       const cleanName = extractFileName(filenameOrPath);
                       const fallbackPath = currentPath ? `${currentPath}/${cleanName}` : cleanName;
                       
                       // Avoid re-trying if they are identical
                       if (fallbackPath === filenameOrPath) return "";

                       try {
                           const uriResult = await Filesystem.getUri({
                               path: fallbackPath,
                               directory: rootDirectory
                           });
                           return Capacitor.convertFileSrc(uriResult.uri);
                       } catch (e2) {
                           return "";
                       }
                   }
              };

              const resolvedSongs = await Promise.all(parsed.songs.map(async s => ({
                  ...s,
                  url: await resolvePath(s.path || s.url) || s.url // Try s.path first
              })));

              const resolvedSfx = await Promise.all(parsed.sfx.map(async s => {
                  if (!s) return s;
                  return {
                      ...s,
                      url: await resolvePath(s.path || s.url) || s.url
                  };
              }));

              onPlaylistLoaded(resolvedSongs, resolvedSfx, file.name, currentPath, rootDirectory);

          } catch (e: any) {
              setError("Errore caricamento playlist: " + e.message);
          } finally {
              setIsProcessing(false);
          }
      }
  };

  // ==========================================
  // WEB INPUT
  // ==========================================
  const handleWebFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const files: File[] = Array.from(e.target.files);
          
          // PICKER MODE WEB
          if (pickerMode) {
              const file = files[0];
              if (onFileSelect) {
                   onFileSelect({
                       name: file.name,
                       type: 'file',
                       size: file.size,
                       mtime: file.lastModified,
                       uri: ''
                   }, URL.createObjectURL(file), file.name); // FullPath is just name on Web
              }
              if (onClose) onClose();
              return;
          }

          const playlistFile = files.find(f => f.name.toLowerCase().endsWith('.txt'));
          
          if (playlistFile) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                  const content = ev.target?.result as string;
                  const parsed = parsePlaylistContent(content);
                  
                  const resolveBlob = (name: string) => {
                      const clean = extractFileName(name);
                      const match = files.find(f => f.name === clean);
                      return match ? URL.createObjectURL(match) : name;
                  };

                  const songs = parsed.songs.map(s => ({
                      ...s,
                      url: resolveBlob(s.originalFileName || s.url)
                  }));

                  const sfx = parsed.sfx.map(s => {
                      if(!s) return s;
                      return { ...s, url: resolveBlob(s.originalFileName || s.url) };
                  });

                  onPlaylistLoaded(songs, sfx, playlistFile.name);
              };
              reader.readAsText(playlistFile);
          } else {
              // ... existing web fallback ...
              const audioFiles = files.filter(f => isAudioFile(f.name)).sort((a,b) => a.name.localeCompare(b.name));
              if (audioFiles.length > 0) {
                  const songs: Song[] = audioFiles.map((f, i) => ({
                      id: `auto-${i}`,
                      title: removeExtension(f.name),
                      url: URL.createObjectURL(f),
                      path: f.name,
                      originalFileName: f.name
                  }));
                  onPlaylistLoaded(songs, new Array(6).fill(undefined));
              } else {
                  setError("Nessun file playlist (.txt) o audio trovato.");
              }
          }
      }
  };

  // RENDER EXPLORER VIEW (Android Initialized or Force Picker on Web if needed logic)
  if (isAndroid && explorerInitialized) {
      return (
          <div className="flex flex-col h-full bg-slate-950 text-slate-200 relative">
              <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 overflow-hidden">
                      <FolderOpen className="w-6 h-6 text-emerald-500" />
                      <div className="flex flex-col min-w-0">
                          <span className="text-xs text-slate-500 font-bold uppercase">
                              {saveMode ? "Salva Playlist In..." : (pickerMode ? t.select_file : t.file_explorer)}
                          </span>
                          <span className="text-sm font-mono truncate text-white" title={currentPath || "Root"}>
                              /{currentPath}
                          </span>
                      </div>
                  </div>
                  <div className="flex gap-2">
                       {currentPath && (
                           <button onClick={handleNavigateUp} className="p-2 bg-slate-800 rounded-lg border border-slate-700 hover:border-emerald-500 transition-colors">
                               <ArrowUpCircle className="w-6 h-6" />
                           </button>
                       )}
                       {onClose && (
                           <button onClick={onClose} className="p-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg border border-red-900/50 transition-colors" title={t.btn_close}>
                               <X className="w-6 h-6" />
                           </button>
                       )}
                  </div>
              </div>

              {error && (
                  <div className="m-4 p-4 bg-red-900/20 border border-red-500/50 rounded-xl flex items-start gap-3">
                      <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
                      <p className="text-sm text-red-200">{error}</p>
                  </div>
              )}

              <div className="flex-1 overflow-y-auto p-2 pb-24">
                  {isProcessing ? (
                      <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div></div>
                  ) : (
                      <div className="grid grid-cols-1 gap-1">
                          {dirContents.map((file, idx) => {
                              const isDir = file.type === 'directory';
                              const isTxt = file.name.toLowerCase().endsWith('.txt');
                              const isAudio = isAudioFile(file.name);
                              
                              // Visual Dimming logic
                              let isDisabled = false;
                              if (saveMode) {
                                  // Save Mode: Folders OK to browse, Txt OK to pick name
                                  if (!isDir && !isTxt) isDisabled = true;
                              } else if (pickerMode) {
                                  // Picker: Folders and Audio OK
                                  if (!isDir && !isAudio) isDisabled = true;
                              } else {
                                  // Normal Load: Folders, Txt, Audio OK
                                  if (!isDir && !isTxt && !isAudio) isDisabled = true;
                              }

                              return (
                                  <button
                                      key={idx}
                                      onClick={() => !isDisabled && handleFileClick(file)}
                                      disabled={isDisabled}
                                      className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left group
                                          ${isDisabled 
                                              ? 'opacity-30 border-transparent cursor-not-allowed' 
                                              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'
                                          }`}
                                  >
                                      <div className="shrink-0 text-slate-500 group-hover:text-emerald-400">
                                          {isDir ? <Folder className="w-8 h-8 fill-slate-800" /> : (isTxt ? <FileText className="w-8 h-8 text-amber-500" /> : <Music className="w-8 h-8" />)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                          <h4 className={`text-base font-medium truncate ${isDir ? 'text-white' : 'text-slate-300'}`}>{file.name}</h4>
                                          {file.type === 'file' && <p className="text-xs text-slate-500">{file.size ? (file.size/1024/1024).toFixed(2) + ' MB' : ''}</p>}
                                      </div>
                                      {!isDisabled && <ChevronRight className="w-5 h-5 text-slate-600" />}
                                  </button>
                              );
                          })}
                          {dirContents.length === 0 && (
                              <div className="text-center py-10 text-slate-600">{t.empty_folder}</div>
                          )}
                      </div>
                  )}
              </div>

              {/* SAVE AS FOOTER */}
              {saveMode && (
                  <div className="absolute bottom-0 left-0 w-full p-4 bg-slate-900 border-t border-slate-800 shrink-0 flex items-center gap-4 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
                    <div className="flex-1">
                        <label className="block text-xs text-slate-500 font-bold uppercase mb-1">{t.file_name_label}</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={saveFileName}
                                onChange={(e) => setSaveFileName(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg py-3 px-4 text-white font-mono focus:outline-none focus:border-emerald-500"
                                placeholder="playlist.txt"
                            />
                        </div>
                    </div>
                    <button 
                        onClick={() => {
                            if(onSave) {
                                // Ensure .txt extension
                                let finalName = saveFileName;
                                if(!finalName.toLowerCase().endsWith('.txt')) finalName += ".txt";
                                const fullPath = currentPath ? `${currentPath}/${finalName}` : finalName;
                                onSave(finalName, fullPath, rootDirectory);
                            }
                        }}
                        className="h-12 px-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95 mt-5"
                    >
                        <Save className="w-5 h-5" />
                        {t.btn_save}
                    </button>
                  </div>
              )}
          </div>
      );
  }

  // RENDER LANDING VIEW
  return (
    <div className="flex flex-col h-full bg-slate-950 items-center justify-center p-6 relative overflow-hidden">
        
        {/* Close Button if Modal - VISIBLE IN LANDING AS WELL */}
        {onClose && (
            <button 
                onClick={onClose} 
                className="absolute top-4 right-4 z-50 p-3 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-red-900/50 hover:border-red-500 border border-slate-700 transition-all shadow-lg"
                title={t.btn_close}
            >
                <X className="w-6 h-6" />
            </button>
        )}

        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
            <div className="absolute top-1/2 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-2xl w-full flex flex-col items-center text-center gap-8">
            <div className="mb-4">
                <div className="w-24 h-24 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl flex items-center justify-center mx-auto mb-6 relative">
                    <Music className="w-10 h-10 text-emerald-500" />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center">
                        <Monitor className="w-4 h-4 text-indigo-400" />
                    </div>
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-2">Regia Musiche <span className="text-emerald-500">Attozero</span></h1>
                <p className="text-slate-400 text-lg">
                    {pickerMode ? t.select_audio_title : t.select_playlist_title}
                </p>
            </div>

            {error && (
                <div className="w-full bg-red-900/20 border border-red-500/50 rounded-xl p-4 flex items-center gap-3 text-left">
                    <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                    <p className="text-sm text-red-200">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {isAndroid ? (
                     <button 
                        onClick={initializeExplorer}
                        className="flex flex-col items-center justify-center gap-4 bg-slate-900 border border-slate-700 hover:border-emerald-500 hover:bg-slate-800 p-8 rounded-2xl transition-all group shadow-xl"
                     >
                         <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
                             <FolderOpen className="w-10 h-10" />
                         </div>
                         <div className="text-center">
                             <h3 className="text-xl font-bold text-white mb-1">{t.browse_device}</h3>
                             <p className="text-sm text-slate-500">{t.search_internal}</p>
                         </div>
                     </button>
                ) : (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-4 bg-slate-900 border border-slate-700 hover:border-emerald-500 hover:bg-slate-800 p-8 rounded-2xl transition-all group shadow-xl cursor-pointer"
                    >
                         <input 
                            type="file" 
                            multiple 
                            ref={fileInputRef}
                            onChange={handleWebFileSelect}
                            accept={pickerMode ? "audio/*,.mp3,.wav,.ogg,.m4a" : ".txt,.mp3,.wav,.ogg,.m4a,.flac"}
                            className="hidden" 
                         />
                         <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
                             <FolderOpen className="w-10 h-10" />
                         </div>
                         <div className="text-center">
                             <h3 className="text-xl font-bold text-white mb-1">{t.load_file}</h3>
                             <p className="text-sm text-slate-500">
                                 {pickerMode ? t.select_audio_title : t.select_playlist_title}
                             </p>
                         </div>
                    </div>
                )}

                {/* Restore the "Nuova Playlist" button as requested, but disable/change it if in picker mode */}
                {!pickerMode && (
                    <button 
                        onClick={() => { onPlaylistLoaded([], new Array(6).fill(undefined)); }}
                        className="flex flex-col items-center justify-center gap-4 bg-slate-900 border border-slate-700 hover:border-indigo-500 hover:bg-slate-800 p-8 rounded-2xl transition-all group shadow-xl"
                    >
                        <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition-transform">
                            <FilePlus className="w-10 h-10" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-white mb-1">{t.new_playlist}</h3>
                            <p className="text-sm text-slate-500">{t.start_scratch}</p>
                        </div>
                    </button>
                )}
            </div>

            <button onClick={onOpenInfo} className="text-slate-500 hover:text-white flex items-center gap-2 text-sm font-bold uppercase tracking-wider mt-4">
                <Info className="w-4 h-4" /> {t.info_credits}
            </button>
        </div>
    </div>
  );
};

export default FileLoader;