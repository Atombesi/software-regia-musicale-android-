import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, FolderOpen, FileText, Monitor, ChevronRight, Folder, Music, AlertTriangle, ArrowUpCircle, FilePlus, Info, X, Save, AlertOctagon } from 'lucide-react';
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

  // PATH FIX MODAL STATE
  const [pathFixModal, setPathFixModal] = useState<{isOpen: boolean, data: any | null}>({isOpen: false, data: null});

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

  const getDirectoryPath = (fullPath: string): string => {
      if (!fullPath) return "";
      const normalized = fullPath.replace(/\\/g, '/');
      const lastSlash = normalized.lastIndexOf('/');
      if (lastSlash === -1) return "";
      return normalized.substring(0, lastSlash);
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

  // --- PATH RESOLVER HELPER ---
  const resolvePathsForLoad = async (parsed: { songs: Song[], sfx: SfxItem[] }, currentDir: string, rootDir: Directory) => {
      // --- HYBRID PATH RESOLUTION ---
      const resolvePath = async (filenameOrPath: string) => {
            if (!filenameOrPath) return "";

            // FIX FOR ELECTRON/WINDOWS ABSOLUTE PATHS
            if (!isAndroid && (filenameOrPath.includes(':\\') || filenameOrPath.startsWith('/'))) {
                const cleanPath = filenameOrPath.replace(/\\/g, '/');
                return cleanPath.startsWith('file:') ? cleanPath : `file:///${cleanPath}`;
            }
            
            // 1. Try path AS IS (Absolute/Stored Path)
            try {
                const uriResult = await Filesystem.getUri({
                    path: filenameOrPath,
                    directory: rootDir
                });
                return Capacitor.convertFileSrc(uriResult.uri);
            } catch (e) {
                // 2. Fallback: Try Relative to Current Playlist Folder
                const cleanName = extractFileName(filenameOrPath);
                const fallbackPath = currentDir ? `${currentDir}/${cleanName}` : cleanName;
                
                // Avoid re-trying if they are identical
                if (fallbackPath === filenameOrPath) return "";

                try {
                    const uriResult = await Filesystem.getUri({
                        path: fallbackPath,
                        directory: rootDir
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

      return { resolvedSongs, resolvedSfx };
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

              // --- SMART PATH RELINK CHECK (Android) ---
              // Check if first song's path matches current directory
              if (parsed.songs.length > 0) {
                  const firstSong = parsed.songs[0];
                  // Use raw path from text file to extract directory
                  const storedDir = getDirectoryPath(firstSong.path || firstSong.url); 
                  const currentDir = currentPath;

                  // Normalize slashes for comparison
                  const normalizedStored = storedDir.replace(/\\/g, '/');
                  const normalizedCurrent = currentDir.replace(/\\/g, '/');
                  
                  // Simple check: if path contains folders and they don't match end-to-end (rough check)
                  // Or if absolute paths differ
                  const isMismatch = normalizedStored && normalizedCurrent && !normalizedStored.endsWith(normalizedCurrent) && normalizedStored !== normalizedCurrent;

                  if (isMismatch) {
                      setPathFixModal({
                          isOpen: true,
                          data: { parsed, currentDir, rootDir: rootDirectory, fileName: file.name, currentPath }
                      });
                      setIsProcessing(false);
                      return; // Stop here, wait for modal
                  }
              }
              
              // Proceed if no mismatch or user accepted
              const { resolvedSongs, resolvedSfx } = await resolvePathsForLoad(parsed, currentPath, rootDirectory);
              onPlaylistLoaded(resolvedSongs, resolvedSfx, file.name, currentPath, rootDirectory);

          } catch (e: any) {
              setError("Errore caricamento playlist: " + e.message);
          } finally {
              setIsProcessing(false);
          }
      }
  };

  // ==========================================
  // WEB INPUT (WINDOWS/ELECTRON FIX)
  // ==========================================
  const handleWebFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const files: File[] = Array.from(e.target.files);
          
          // PICKER MODE WEB
          if (pickerMode) {
              const file = files[0];
              if (onFileSelect) {
                   // ELECTRON FIX: Use 'path' property if available (it exists in Electron's File object)
                   // Fallback to name if in pure browser.
                   const electronPath = (file as any).path || file.name;

                   onFileSelect({
                       name: file.name,
                       type: 'file',
                       size: file.size,
                       mtime: file.lastModified,
                       uri: ''
                   }, URL.createObjectURL(file), electronPath); // PASS FULL PATH HERE
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

                  // --- SMART PATH RELINK CHECK (Windows/Electron) ---
                  if (!isAndroid && (playlistFile as any).path && parsed.songs.length > 0) {
                      const fullPlaylistPath = (playlistFile as any).path as string;
                      const currentDir = getDirectoryPath(fullPlaylistPath);
                      const firstSong = parsed.songs[0];
                      const storedPath = firstSong.path || firstSong.url;
                      
                      const storedDir = getDirectoryPath(storedPath);

                      // Normalize for comparison
                      const normStored = storedDir.replace(/\\/g, '/');
                      const normCurrent = currentDir.replace(/\\/g, '/');

                      if (normStored !== normCurrent) {
                          setPathFixModal({
                              isOpen: true,
                              data: { parsed, currentDir, rootDir: undefined, fileName: playlistFile.name, currentPath: currentDir, webFiles: files }
                          });
                          return;
                      }
                  }
                  
                  const resolveBlob = (nameOrPath: string) => {
                      // FIX FOR ELECTRON/WINDOWS ABSOLUTE PATHS FROM TXT
                      // If absolute path found in TXT, convert to file:/// immediately
                      if (!isAndroid && (nameOrPath.includes(':\\') || nameOrPath.startsWith('/'))) {
                           const cleanPath = nameOrPath.replace(/\\/g, '/');
                           return cleanPath.startsWith('file:') ? cleanPath : `file:///${cleanPath}`;
                      }

                      const clean = extractFileName(nameOrPath);
                      // Try to match by filename in the selected list (Blob fallback)
                      const match = files.find(f => f.name === clean);
                      // Return Blob if found, otherwise return the original path so Electron can try to load it
                      return match ? URL.createObjectURL(match) : nameOrPath;
                  };

                  const songs = parsed.songs.map(s => ({
                      ...s,
                      // If it's a blob, it works. If it's a path, App.tsx will try to load it (Electron allows file://)
                      url: resolveBlob(s.path || s.originalFileName || s.url)
                  }));

                  const sfx = parsed.sfx.map(s => {
                      if(!s) return s;
                      return { ...s, url: resolveBlob(s.path || s.originalFileName || s.url) };
                  });

                  onPlaylistLoaded(songs, sfx, playlistFile.name);
              };
              reader.readAsText(playlistFile);
          } else {
              // ... existing web fallback ...
              const audioFiles = files.filter(f => isAudioFile(f.name)).sort((a,b) => a.name.localeCompare(b.name));
              if (audioFiles.length > 0) {
                  const songs: Song[] = audioFiles.map((f, i) => {
                      const electronPath = (f as any).path || f.name;
                      return {
                        id: `auto-${i}`,
                        title: removeExtension(f.name),
                        url: URL.createObjectURL(f),
                        path: electronPath, // Store Full Path
                        originalFileName: f.name
                      };
                  });
                  onPlaylistLoaded(songs, new Array(6).fill(undefined));
              } else {
                  setError("Nessun file playlist (.txt) o audio trovato.");
              }
          }
      }
  };

  const performPathFix = async (fix: boolean) => {
      if (!pathFixModal.data) return;
      
      const { parsed, currentDir, rootDir, fileName, currentPath, webFiles } = pathFixModal.data;
      let finalParsed = parsed;

      if (fix) {
          // UPDATE ALL PATHS TO NEW DIRECTORY
          const separator = isAndroid ? '/' : '\\'; // Use correct separator for visual cleanliness, though / usually works
          
          // FIX: Normalize directory path for Windows
          let dirPrefix = currentDir;
          if (!isAndroid) {
              // Ensure we replace ALL slashes with backslashes for the prefix
              dirPrefix = dirPrefix.split('/').join('\\');
          }

          finalParsed.songs = parsed.songs.map((s: Song) => ({
              ...s,
              path: dirPrefix + separator + s.originalFileName,
              url: dirPrefix + separator + s.originalFileName
          }));

          finalParsed.sfx = parsed.sfx.map((s: SfxItem) => {
              if(!s) return s;
              return {
                  ...s,
                  path: dirPrefix + separator + s.originalFileName,
                  url: dirPrefix + separator + s.originalFileName
              }
          });
      }

      setPathFixModal({isOpen: false, data: null});

      if (isAndroid) {
          const { resolvedSongs, resolvedSfx } = await resolvePathsForLoad(finalParsed, currentPath, rootDir);
          onPlaylistLoaded(resolvedSongs, resolvedSfx, fileName, currentPath, rootDir);
      } else {
          // Windows / Web Logic Re-run with fixed paths
          const resolveBlob = (nameOrPath: string) => {
                if (!isAndroid && (nameOrPath.includes(':\\') || nameOrPath.startsWith('/'))) {
                    const cleanPath = nameOrPath.replace(/\\/g, '/');
                    return cleanPath.startsWith('file:') ? cleanPath : `file:///${cleanPath}`;
                }
                const clean = extractFileName(nameOrPath);
                const match = webFiles?.find((f: File) => f.name === clean);
                return match ? URL.createObjectURL(match) : nameOrPath;
          };

          const songs = finalParsed.songs.map((s: Song) => ({
                ...s,
                url: resolveBlob(s.path || s.originalFileName || s.url)
          }));

          const sfx = finalParsed.sfx.map((s: SfxItem) => {
                if(!s) return s;
                return { ...s, url: resolveBlob(s.path || s.originalFileName || s.url) };
          });

          onPlaylistLoaded(songs, sfx, fileName);
      }
  };

  // RENDER EXPLORER VIEW (Android Initialized)
  if (isAndroid && explorerInitialized) {
      return (
          <div className="flex flex-col h-full bg-slate-950 text-slate-200 relative">
              {/* PATH FIX MODAL (ANDROID) */}
              {pathFixModal.isOpen && (
                  <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
                      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
                          <AlertOctagon className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                          <h3 className="text-xl font-bold text-white mb-2">{language === 'it' ? "Discrepanza Percorso" : "Path Mismatch"}</h3>
                          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                              {language === 'it' 
                                  ? "La playlist sembra provenire da un'altra cartella o dispositivo. Vuoi aggiornare i percorsi dei file alla cartella corrente?"
                                  : "The playlist seems to come from another folder. Do you want to update file paths to current folder?"}
                          </p>
                          <div className="flex gap-3 justify-center">
                              <button onClick={() => performPathFix(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold border border-slate-700">No</button>
                              <button onClick={() => performPathFix(true)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg">Sì</button>
                          </div>
                      </div>
                  </div>
              )}

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
                          
                          {/* ANDROID PERMISSION HINT BOX */}
                          {isAndroid && !saveMode && !pickerMode && (
                            <div className="mx-2 mt-6 p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl flex items-start gap-3">
                                <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                                <div className="text-sm text-indigo-200">
                                    <strong className="block mb-1 text-indigo-300">{t.android_permission_hint_title}</strong>
                                    <p className="opacity-90 text-xs leading-relaxed">{t.android_permission_hint_text}</p>
                                </div>
                            </div>
                          )}
                      </div>
                  )}
              </div>

              {/* SAVE AS FOOTER (ANDROID) */}
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

  // --- NEW: RENDER WEB/DESKTOP SAVE UI (Electron/Browser) ---
  if (!isAndroid && saveMode) {
      return (
          <div className="flex flex-col h-full bg-slate-950 items-center justify-center p-6 relative">
              {/* Close Button */}
              {onClose && (
                <button 
                    onClick={onClose} 
                    className="absolute top-4 right-4 z-50 p-3 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-red-900/50 hover:border-red-500 border border-slate-700 transition-all shadow-lg"
                    title={t.btn_close}
                >
                    <X className="w-6 h-6" />
                </button>
              )}

              <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
                  
                  <div className="flex items-center gap-3 mb-8 text-emerald-400">
                      <Save className="w-8 h-8" />
                      <h2 className="text-2xl font-bold text-white tracking-tight">{t.save_playlist}</h2>
                  </div>
                  
                  <div className="mb-8">
                      <label className="block text-xs text-slate-500 font-bold uppercase mb-2 tracking-wider">{t.file_name_label}</label>
                      <div className="relative">
                        <input 
                            type="text" 
                            value={saveFileName}
                            onChange={(e) => setSaveFileName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    if(onSave) {
                                        let finalName = saveFileName;
                                        if(!finalName.toLowerCase().endsWith('.txt')) finalName += ".txt";
                                        // On desktop web/electron, path is irrelevant for 'blob' download, but we pass filename
                                        onSave(finalName, finalName, rootDirectory);
                                    }
                                }
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl py-4 px-4 text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-700"
                            placeholder="playlist.txt"
                            autoFocus
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 text-sm font-bold pointer-events-none select-none">
                            .txt
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-3 flex items-center gap-1.5">
                          <Info className="w-3 h-3" />
                          {language === 'it' ? 'Il file verrà scaricato nella cartella Download.' : 'File will be downloaded to your Downloads folder.'}
                      </p>
                  </div>

                  <button 
                      onClick={() => {
                          if(onSave) {
                              let finalName = saveFileName;
                              if(!finalName.toLowerCase().endsWith('.txt')) finalName += ".txt";
                              onSave(finalName, finalName, rootDirectory);
                          }
                      }}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-95 flex items-center justify-center gap-2 group"
                  >
                      <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      {t.btn_save}
                  </button>
              </div>
          </div>
      );
  }

  // RENDER LANDING VIEW (DEFAULT WEB LOAD)
  return (
    <div className="flex flex-col h-full bg-slate-950 items-center justify-center p-6 relative overflow-hidden">
        
        {/* PATH FIX MODAL (WEB/WINDOWS) */}
        {pathFixModal.isOpen && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
                    <AlertOctagon className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">{language === 'it' ? "Discrepanza Percorso" : "Path Mismatch"}</h3>
                    <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                        {language === 'it' 
                            ? "La playlist sembra provenire da un'altra cartella. Vuoi aggiornare i percorsi dei file alla cartella corrente?"
                            : "The playlist seems to come from another folder. Do you want to update file paths to current folder?"}
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button onClick={() => performPathFix(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold border border-slate-700">No</button>
                        <button onClick={() => performPathFix(true)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg">Sì</button>
                    </div>
                </div>
            </div>
        )}

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