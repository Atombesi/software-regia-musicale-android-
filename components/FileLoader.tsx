
import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, FolderOpen, FileText, Monitor, ChevronRight, Folder, Music, AlertTriangle, ArrowUpCircle, FilePlus, Info, X, Save, AlertOctagon, History, Clock, MapPin, Database, Trash, CheckCircle2, LogOut, FileSignature, FolderSearch, ArrowLeft, HardDrive, Settings, Star, Plus, Trash2 } from 'lucide-react';
import { Song, SfxItem, Language } from '../types';
import { Filesystem, Directory, Encoding, FileInfo } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { translations } from '../translations';
import { extractFileName, removeExtension, isAndroidPlatform, isElectron, cleanAndroidPath } from '../utils/platformUtils';
import { readTextFile, writeTextFile, addPlaylistToHistory, HISTORY_FILENAME, LOCAL_STORAGE_KEY, HistoryItem } from '../utils/filesystemUtils'; 
import { AppGlobals } from '../globals'; 

interface FileLoaderProps {
  onPlaylistLoaded: (songs: Song[], sfx: SfxItem[], sourceFileName?: string, sourcePath?: string, sourceDirectory?: Directory, scriptPath?: string | null) => void;
  onOpenInfo: () => void;
  onClose?: () => void;
  pickerMode?: boolean;
  onFileSelect?: (file: FileInfo, resolvedUrl: string, fullPath: string) => void;
  initialPath?: string;
  onPathChange?: (path: string) => void;
  language?: Language;
  saveMode?: boolean;
  defaultFileName?: string;
  onSave?: (fileName: string, fullPath: string, directory: Directory) => void;
  onSettingsRequest?: () => void; 
  appVersion?: string; // NEW PROP
}

interface Bookmark {
    name: string;
    path: string;
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
    onSave,
    onSettingsRequest,
    appVersion
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const t = translations[language];
  
  const [isAndroid, setIsAndroid] = useState(false);
  
  // "Playlistpath": Contiene SOLO il percorso della cartella
  const [currentPath, setCurrentPath] = useState<string>(initialPath || "");
  
  // State per l'input manuale del percorso (Android)
  const [manualPathInput, setManualPathInput] = useState<string>("");

  // "Playlistfilename": Contiene SOLO il nome del file
  const [saveFileName, setSaveFileName] = useState(defaultFileName || "");

  const [rootDirectory, setRootDirectory] = useState<Directory>(Directory.ExternalStorage);
  const [dirContents, setDirContents] = useState<FileInfo[]>([]);
  const [explorerInitialized, setExplorerInitialized] = useState(false);
  
  // STATE PER LA VIEW (Desktop Save): true = Modale 3 Pulsanti, false = Explorer
  const [showSaveOptions, setShowSaveOptions] = useState(saveMode && !isAndroidPlatform());

  const [debugStatus, setDebugStatus] = useState<string>(""); 

  // Missing files tracking
  const [missingFiles, setMissingFiles] = useState<Set<string>>(new Set());

  // Modals
  const [pathFixModal, setPathFixModal] = useState<{isOpen: boolean, data: any | null}>({isOpen: false, data: null});
  const [debugModal, setDebugModal] = useState<{isOpen: boolean, content: string, path: string}>({isOpen: false, content: '', path: ''});
  const [loadConfirmModal, setLoadConfirmModal] = useState<{isOpen: boolean, item: HistoryItem | null}>({isOpen: false, item: null});
  const [historyRemoveModal, setHistoryRemoveModal] = useState<{
      isOpen: boolean, 
      item: HistoryItem | null, 
      debugPath?: string,
      configPath?: string 
  }>({isOpen: false, item: null});
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  
  // --- SMART RELINK STATE ---
  const [pendingRelink, setPendingRelink] = useState<{parsed: any, fileName: string, path: string, directory: Directory} | null>(null);
  const [relinkMode, setRelinkMode] = useState(false); 

  // --- BOOKMARKS STATE (Android) ---
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [userBookmarks, setUserBookmarks] = useState<Bookmark[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [recentPlaylists, setRecentPlaylists] = useState<HistoryItem[]>([]);

  // 3. Helper per calcolare Fullname in tempo reale
  const getFullname = (overridePath?: string) => {
      // FIX: Use current state directly, avoiding AppGlobals
      let p = overridePath || currentPath;
      let f = saveFileName;
      
      // Safety check: if path is missing, try fallback to initialPath or AppGlobals
      if (!p && initialPath) p = initialPath;
      if (!p && AppGlobals.Playlistpath) p = AppGlobals.Playlistpath;

      // Normalizzazione visuale
      if (p) p = p.replace(/\\/g, '/');
      
      if (p && !p.endsWith('/')) {
          p += '/';
      }
      return (p || "") + (f || "");
  };

  useEffect(() => {
    const android = isAndroidPlatform();
    setIsAndroid(android);
    
    // Load Bookmarks
    if (android) {
        try {
            const b = localStorage.getItem('regia_bookmarks');
            if (b) setUserBookmarks(JSON.parse(b));
        } catch(e) {}
    }
    
    // Sincronizzazione Rigorosa delle Variabili all'avvio
    if (defaultFileName) setSaveFileName(defaultFileName);
    
    // FORCE INITIALIZATION OF PATH
    if (initialPath) {
        setCurrentPath(initialPath);
    } else if (saveMode && AppGlobals.Playlistpath) {
        setCurrentPath(AppGlobals.Playlistpath);
    }

    // Only set default filename from globals if not provided by prop
    if (saveMode && AppGlobals.Playlistfilename && !defaultFileName) {
        setSaveFileName(AppGlobals.Playlistfilename);
    }

    if (android) {
        if (pickerMode || saveMode) {
             initializeExplorer();
        }
    } else {
        // DESKTOP/WINDOWS:
        if (pickerMode) {
             setTimeout(() => {
                 fileInputRef.current?.click();
             }, 200);
        }

        if (initialPath && !initialPath.startsWith('blob:') && !initialPath.startsWith('http')) {
             // Path is already set above
             if (saveMode) {
                  setExplorerInitialized(true);
                  loadAndroidDir(initialPath, Directory.ExternalStorage);
             }
        } else if (!AppGlobals.Playlistpath && !initialPath) {
            detectWindowsPath();
        }
    }
    
    loadHistory();
  }, [pickerMode, saveMode]);

  // Sync quando le prop cambiano
  useEffect(() => {
      if (initialPath && !initialPath.startsWith('blob:') && !initialPath.startsWith('http')) {
          setCurrentPath(initialPath);
      }
  }, [initialPath]);

  useEffect(() => {
      // FIX: Aggiorna l'input manuale quando cambia il path, pulendo se Android
      const displayPath = isAndroid ? cleanAndroidPath(currentPath) : currentPath;
      setManualPathInput(displayPath);
  }, [currentPath, isAndroid]);

  useEffect(() => {
      if (defaultFileName) setSaveFileName(defaultFileName);
  }, [defaultFileName]);


  const detectWindowsPath = async () => {
      if (currentPath && currentPath.length > 3) return;

      try {
          const res = await Filesystem.getUri({ path: '', directory: Directory.ExternalStorage });
          let path = res.uri;
          if (path.startsWith('file:///')) path = path.substring(8);
          else if (path.startsWith('file://')) path = path.substring(7);
          try { path = decodeURIComponent(path); } catch(e){}
          path = path.replace(/\//g, '\\');
          if (path.startsWith('\\') && path.indexOf(':') === 2) path = path.substring(1);
          
          setCurrentPath(path);
          if (onPathChange) onPathChange(path); 
          
          if (saveMode) {
              setExplorerInitialized(true);
              loadAndroidDir(path, Directory.ExternalStorage);
          }
      } catch (e) {
          console.error("Detect path failed", e);
      }
  };

  // --- BOOKMARKS MANAGAMENT ---
  const addCurrentToBookmarks = () => {
      if (!currentPath) return;
      
      let usePath = currentPath;
      if (isAndroid) usePath = cleanAndroidPath(currentPath);

      // Create name from last folder segment
      let name = usePath;
      if (usePath.endsWith('/')) name = name.slice(0, -1);
      const parts = name.split('/');
      name = parts[parts.length - 1] || "Root";
      if (usePath === '' || usePath === '.') name = "Memoria Interna";
      if (usePath.includes('storage') && !usePath.includes('emulated')) name = "Unità Esterna";

      const newBookmark = { name, path: usePath };
      const updated = [...userBookmarks, newBookmark].slice(0, 5); 
      setUserBookmarks(updated);
      localStorage.setItem('regia_bookmarks', JSON.stringify(updated));
      setShowBookmarks(false);
  };

  const removeBookmark = (index: number) => {
      const updated = [...userBookmarks];
      updated.splice(index, 1);
      setUserBookmarks(updated);
      localStorage.setItem('regia_bookmarks', JSON.stringify(updated));
  };

  // --- HISTORY MANAGEMENT ---
  const checkFilesExistence = async (items: HistoryItem[]) => {
      const missing = new Set<string>();
      
      const checkPromises = items.map(async (item) => {
          try {
              let exists = false;
              if (isAndroidPlatform()) {
                  // FIX: Puliamo il path per il controllo stat
                  const cleanP = cleanAndroidPath(item.path);
                  try {
                       await Filesystem.stat({ path: cleanP, directory: Directory.ExternalStorage }); 
                       exists = true;
                  } catch {
                       // Fallback
                       exists = false;
                  }
              } else {
                  if (window.electronAPI && window.electronAPI.exists) {
                      exists = await window.electronAPI.exists(item.path);
                  } else {
                      exists = true; 
                  }
              }
              
              if (!exists) {
                  missing.add(item.path);
              }
          } catch (e) {
              missing.add(item.path);
          }
      });

      await Promise.all(checkPromises);
      setMissingFiles(missing);
  };

  const loadHistory = async () => {
      const isAndroid = isAndroidPlatform();
      const dir = isAndroid ? Directory.External : Directory.Documents; 
      
      let loadedItems: HistoryItem[] = [];
      let source = "";

      try {
          const ls = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (ls) {
              const parsed = JSON.parse(ls);
              if (Array.isArray(parsed)) {
                  loadedItems = parsed;
                  source = "DB";
              }
          }
      } catch (e) {}

      try {
          const fileData = await readTextFile(HISTORY_FILENAME, HISTORY_FILENAME, dir);
          if (fileData) {
              const parsed = JSON.parse(fileData);
              if (Array.isArray(parsed) && parsed.length > 0) {
                  loadedItems = parsed;
                  source = isAndroid ? "ExtFile" : "DocFile";
              }
          }
      } catch (e) {}

      // FIX: Puliamo eventuali vecchi path nello storico se siamo su Android
      if (isAndroid && loadedItems.length > 0) {
          loadedItems = loadedItems.map(i => ({...i, path: cleanAndroidPath(i.path)}));
      }

      setRecentPlaylists(loadedItems);
      if (loadedItems.length > 0) {
          setDebugStatus(`Loaded ${loadedItems.length} items from ${source}`);
          checkFilesExistence(loadedItems);
      } else {
          setDebugStatus(`History empty`);
      }
  };

  const saveHistory = async (newHistory: HistoryItem[]) => {
      const isAndroid = isAndroidPlatform();
      const dir = isAndroid ? Directory.External : Directory.Documents;

      try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newHistory));
      } catch (e) { console.error("LS Save fail", e); }
      
      setRecentPlaylists(newHistory);

      try {
          await writeTextFile(HISTORY_FILENAME, HISTORY_FILENAME, JSON.stringify(newHistory, null, 2), dir);
          setDebugStatus(`Saved to DB & Documents`);
      } catch (e: any) {
          console.warn("File Save Failed (Permissions?)", e);
          setDebugStatus(`Saved to DB only (File Error: ${e.message})`);
      }
  };

  // UPDATED: Use shared utility
  const addToHistory = (name: string, path: string) => {
      addPlaylistToHistory(name, path).then(() => {
          // Reload from LS to update UI
          try {
              const ls = localStorage.getItem(LOCAL_STORAGE_KEY);
              if(ls) setRecentPlaylists(JSON.parse(ls));
          } catch(e){}
      });
  };

  const forceTestWrite = async () => {
      const isAndroid = isAndroidPlatform();
      const dir = isAndroid ? Directory.External : Directory.Documents;
      const testContent = JSON.stringify([{name: "TEST FILE CREATED", path: "TEST", date: Date.now()}], null, 2);
      
      try {
          localStorage.setItem(LOCAL_STORAGE_KEY, testContent);
          await writeTextFile(HISTORY_FILENAME, HISTORY_FILENAME, testContent, dir);
          alert("Successo! File scritto in Documenti e Database.");
          loadHistory(); 
          setDebugModal(prev => ({...prev, isOpen: false}));
      } catch(e:any) {
          alert("ATTENZIONE: Scrittura File fallita, ma Database aggiornato.\n" + e.message);
          loadHistory();
      }
  };

  const handleDebugClick = async () => {
      if (isAndroid) return;
      const dir = Directory.Documents;
      let content = `Target: Documents/${HISTORY_FILENAME}\n`;
      content += `DB Key: ${LOCAL_STORAGE_KEY}\n\n`;
      content += "--- DATABASE (LocalStorage) ---\n";
      content += localStorage.getItem(LOCAL_STORAGE_KEY) || "Empty";
      content += "\n\n";
      content += "--- FILE SYSTEM (Documents) ---\n";
      try {
          const fileData = await readTextFile(HISTORY_FILENAME, HISTORY_FILENAME, dir);
          content += fileData;
      } catch(e:any) {
          content += "File Error: " + e.message;
      }
      setDebugModal({
          isOpen: true,
          content: content,
          path: `Documents/${HISTORY_FILENAME}`
      });
  };

  const forceDeleteConfig = async () => {
      try {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
          const isAndroid = isAndroidPlatform();
          const dir = isAndroid ? Directory.External : Directory.Documents;
          await Filesystem.deleteFile({ path: HISTORY_FILENAME, directory: dir }).catch(() => {});
          
          setRecentPlaylists([]);
          setDebugModal({ isOpen: false, content: 'Storico eliminato.', path: '' });
          setDebugStatus("History Deleted");
      } catch (e:any) {
          alert("Errore reset: " + e.message);
      }
  };

  const removeFromHistory = (path: string) => {
      const safePathToRemove = path.replace(/\\/g, '/');
      const updated = recentPlaylists.filter(item => item.path.replace(/\\/g, '/') !== safePathToRemove);
      saveHistory(updated); 
      setHistoryRemoveModal(prev => ({...prev, isOpen: false, item: null}));
      setLoadConfirmModal(prev => ({...prev, isOpen: false, item: null}));
      setConfirmRemoveOpen(false);
  };

  const initializeExplorer = () => {
      setExplorerInitialized(true);
      const startPath = currentPath || 'Download';
      loadAndroidDir(startPath, Directory.ExternalStorage);
  };

  const getDirectoryPath = (fullPath: string): string => {
      if (!fullPath) return "";
      const normalized = fullPath.replace(/\\/g, '/');
      const lastSlash = normalized.lastIndexOf('/');
      if (lastSlash === -1) return "";
      return normalized.substring(0, lastSlash);
  };

  const isAudioFile = (name: string): boolean => {
      return /\.(mp3|wav|ogg|m4a|flac|aac|wma|aiff|alac|3gp|mp4|amr|mid)$/i.test(name);
  };

  const parsePlaylistContent = (content: string): { songs: Song[], sfx: SfxItem[], scriptPath: string | null } => {
      const lines = content.split('\n');
      const songs: Song[] = [];
      const sfx: SfxItem[] = new Array(6).fill(undefined);
      let scriptPath: string | null = null;
      let isParsingNotes = false;
      let currentNotePointer: string | null = null;
      let currentNoteContent: string[] = [];
      const notesMap: Record<string, string> = {}; 

      lines.forEach((line, index) => {
          const trimmed = line.trim();
          
          if (trimmed.startsWith('SCRIPT_PATH;')) {
              scriptPath = trimmed.substring(12).trim();
              return;
          }

          if (trimmed.startsWith('[NOTE_')) {
              if (currentNotePointer) {
                  notesMap[currentNotePointer] = currentNoteContent.join('\n');
              }
              isParsingNotes = true;
              currentNotePointer = trimmed;
              currentNoteContent = [];
              return;
          }

          if (isParsingNotes && currentNotePointer) {
              currentNoteContent.push(trimmed);
              return;
          }

          if (!trimmed) return;
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

      if (currentNotePointer) {
          notesMap[currentNotePointer] = currentNoteContent.join('\n');
      }

      // Apply notes to songs
      songs.forEach(song => {
          if (song.note && song.note.startsWith('[NOTE_')) {
              song.note = notesMap[song.note] || '';
          }
      });

      return { songs, sfx, scriptPath };
  };

  const resolvePathsForLoad = async (parsed: { songs: Song[], sfx: SfxItem[], scriptPath?: string | null }, currentDir: string, rootDir: Directory) => {
      const resolvePath = async (filenameOrPath: string) => {
            if (!filenameOrPath) return "";
            
            // WINDOWS ABSOLUTE PATH HANDLING
            if (!isAndroid && (filenameOrPath.includes(':') || filenameOrPath.startsWith('/'))) {
                let checkPath = filenameOrPath.replace(/\\/g, '/');
                if (checkPath.startsWith('file:///')) checkPath = checkPath.substring(8);
                if (checkPath.startsWith('file://')) checkPath = checkPath.substring(7);
                
                let exists = false;
                
                if (window.electronAPI && window.electronAPI.exists) {
                    try {
                        exists = await window.electronAPI.exists(checkPath);
                    } catch (e) {}
                }

                if (!exists && currentDir) {
                    const cleanName = extractFileName(checkPath);
                    const separator = currentDir.endsWith('/') ? '' : '/';
                    const localPath = `${currentDir}${separator}${cleanName}`;
                    
                    if (window.electronAPI && window.electronAPI.exists) {
                        try {
                            const localExists = await window.electronAPI.exists(localPath);
                            if (localExists) {
                                checkPath = localPath;
                                exists = true;
                            }
                        } catch (e) {}
                    }
                }

                if (exists) {
                    return checkPath.startsWith('file:') ? checkPath : `file:///${checkPath}`;
                } else {
                    return filenameOrPath;
                }
            }

            // ANDROID / RELATIVE PATH HANDLING
            try {
                if (filenameOrPath.startsWith('file://')) {
                     return Capacitor.convertFileSrc(filenameOrPath);
                }

                const uriResult = await Filesystem.getUri({
                    path: filenameOrPath,
                    directory: rootDir
                });
                return Capacitor.convertFileSrc(uriResult.uri);
            } catch (e) {
                const cleanName = extractFileName(filenameOrPath);
                const fallbackPath = currentDir ? `${currentDir}/${cleanName}` : cleanName;
                if (fallbackPath === filenameOrPath) return filenameOrPath; 
                try {
                    const uriResult = await Filesystem.getUri({
                        path: fallbackPath,
                        directory: rootDir
                    });
                    return Capacitor.convertFileSrc(uriResult.uri);
                } catch (e2) {
                    return filenameOrPath; 
                }
            }
      };

      const resolvedSongs = await Promise.all(parsed.songs.map(async s => {
          if (s.type === 'separator') return s; // Skip separators
          return {
              ...s,
              url: await resolvePath(s.path || s.url) || s.url 
          };
      }));

      const resolvedSfx = await Promise.all(parsed.sfx.map(async s => {
          if (!s) return s;
          return {
              ...s,
              url: await resolvePath(s.path || s.url) || s.url
          };
      }));

      return { resolvedSongs, resolvedSfx };
  };

  // --- SMART RELINK HELPER ---
  const checkFirstSongAndLoad = async (parsed: { songs: Song[], sfx: SfxItem[], scriptPath?: string | null }, fileName: string, path: string, directory: Directory) => {
      
      const playlistDir = getDirectoryPath(path);
      
      // 1. Resolve paths normally
      const { resolvedSongs, resolvedSfx } = await resolvePathsForLoad(parsed, playlistDir, directory);
      
      // 2. Check if first song exists
      // Skip separators when checking for validity
      const firstAudioSong = resolvedSongs.find(s => s.type !== 'separator');
      
      let isValid = true;
      if (firstAudioSong) {
          isValid = firstAudioSong.url.startsWith('blob:') || firstAudioSong.url.startsWith('http') || firstAudioSong.url.startsWith('file:');
      }
      
      if (!isValid && resolvedSongs.length > 0) {
          // 3. First song missing: Trigger Smart Relink Modal
          setPendingRelink({ parsed, fileName, path, directory });
      } else {
          // 4. Normal Load
          finishLoading(resolvedSongs, resolvedSfx, fileName, path, directory, parsed.scriptPath);
      }
  };

  const finishLoading = (resolvedSongs: Song[], resolvedSfx: SfxItem[], fileName: string, path: string, directory: Directory, scriptPath?: string | null) => {
      let historyPath = path;
      // FIX: SU ANDROID NON RISOLVIAMO URI ASSOLUTI PER LO STORICO, USIAMO IL PATH RELATIVO
      if (!isAndroid) {
          try {
              if(directory) {
                   Filesystem.getUri({ path: path, directory: directory }).then(uri => {
                       if (uri.uri.startsWith('file://')) historyPath = uri.uri;
                       addToHistory(fileName, historyPath);
                   }).catch(() => addToHistory(fileName, historyPath));
              } else {
                   addToHistory(fileName, historyPath);
              }
          } catch(e) {
              addToHistory(fileName, historyPath);
          }
      } else {
          // Android: Salva il path "pulito" (es. Download/playlist.txt)
          addToHistory(fileName, cleanAndroidPath(historyPath));
      }
      
      setSaveFileName(fileName);
      // Imposta currentPath pulito
      setCurrentPath(isAndroid ? cleanAndroidPath(getDirectoryPath(path)) : getDirectoryPath(path));

      onPlaylistLoaded(resolvedSongs, resolvedSfx, fileName, path, directory, scriptPath);
  };

  const handleRelinkSelect = async (file: FileInfo, fullPath: string) => {
      if (!pendingRelink) return;

      // 1. Get Directory of selected file
      const newDir = getDirectoryPath(fullPath);
      console.log("Smart Relink: New Base Dir detected:", newDir);

      // 2. Update Paths in Parsed Data
      const updatedSongs = pendingRelink.parsed.songs.map((s: Song) => {
          if (s.type === 'separator') return s;
          return {
              ...s,
              path: newDir ? `${newDir}/${s.originalFileName || extractFileName(s.path || "")}` : s.originalFileName
          };
      });

      const updatedSfx = pendingRelink.parsed.sfx.map((s: SfxItem) => {
          if (!s) return s;
          return {
              ...s,
              path: newDir ? `${newDir}/${s.originalFileName || extractFileName(s.path || "")}` : s.originalFileName
          };
      });

      // 3. Resolve with new paths
      const { resolvedSongs, resolvedSfx } = await resolvePathsForLoad(
          { songs: updatedSongs, sfx: updatedSfx }, 
          newDir, 
          pendingRelink.directory
      );

      // 4. Finish
      finishLoading(resolvedSongs, resolvedSfx, pendingRelink.fileName, pendingRelink.path, pendingRelink.directory, pendingRelink.parsed.scriptPath);
      
      // 5. Cleanup
      setPendingRelink(null);
      setRelinkMode(false);
  };

  const loadFromPath = async (fullPath: string, fileName: string) => {
      try {
          setIsProcessing(true);
          setError(null);

          let pathForFs = fullPath;
          // Android: Pulisce file:// e storage root se presenti nello storico
          if (isAndroid) {
              pathForFs = cleanAndroidPath(pathForFs);
          } else {
              pathForFs = pathForFs.replace(/\\/g, '/');
          }

          const contentStr = await readTextFile(pathForFs, fileName);
          const parsed = parsePlaylistContent(contentStr);
          
          // Estrazione sicura della directory
          const directory = getDirectoryPath(fullPath);
          const dirEnum = Directory.ExternalStorage; 

          // === USE SMART CHECK INSTEAD OF DIRECT RESOLVE ===
          await checkFirstSongAndLoad(parsed, fileName, fullPath, dirEnum);

      } catch (e: any) {
          console.error("Load failed", e);
          setHistoryRemoveModal({ 
              isOpen: true, 
              item: { name: fileName, path: fullPath, date: Date.now() },
              debugPath: fullPath, 
              configPath: "Check Debug Info"
          });
      } finally {
          setIsProcessing(false);
          setLoadConfirmModal({isOpen: false, item: null});
      }
  };

  const loadAndroidDir = async (path: string, directory: Directory) => {
      try {
          setIsProcessing(true);
          setError(null);
          try {
             const perm = await Filesystem.checkPermissions();
             if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
          } catch (e) {}

          let options: any = { path: path, directory: directory };
          // Se path assoluto (file:// o /storage), togli directory
          if (path.startsWith('file://') || path.startsWith('/')) {
              options = { path: path }; 
          }

          const result = await Filesystem.readdir(options);
          
          const sorted = result.files.sort((a, b) => {
               const aTxt = a.name.toLowerCase().endsWith('.txt');
               const bTxt = b.name.toLowerCase().endsWith('.txt');
               const aAudio = isAudioFile(a.name);
               const bAudio = isAudioFile(b.name);
               if (a.type === 'directory' && b.type !== 'directory') return -1;
               if (a.type !== 'directory' && b.type === 'directory') return 1;
               if (pickerMode || relinkMode) { 
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
          
          if (!path.startsWith('file://') && !path.startsWith('/')) {
              setRootDirectory(directory);
          }
          
          if (onPathChange) onPathChange(path);

      } catch (err: any) {
          if (path !== '') { 
              loadAndroidDir('', Directory.ExternalStorage); 
              return; 
          }
          setError(t.error_read_folder + ": " + (err.message || JSON.stringify(err)));
          setDirContents([]); 
      } finally {
          setIsProcessing(false);
      }
  };

  // Function to switch to Root / Storage selection
  const handleOpenStorageRoot = () => {
      loadAndroidDir('file:///storage', Directory.ExternalStorage);
  };

  const handleNavigateUp = () => {
      if (!currentPath || currentPath === '.') return;
      
      // Handle Absolute Paths (file:///...)
      if (currentPath.startsWith('file:///')) {
          const parts = currentPath.split('/');
          parts.pop(); 
          // If we are at file:///storage, allow going up to act as Close or root logic
          // But effectively staying at storage root is usually safer UI
          const newPath = parts.join('/');
          if (newPath.length < 'file:///storage'.length) return; 
          
          loadAndroidDir(newPath, rootDirectory);
          return;
      }

      const parts = currentPath.split('/');
      parts.pop();
      const newPath = parts.join('/') || ''; 
      loadAndroidDir(newPath, rootDirectory);
  };

  const resolveFileUrl = async (file: FileInfo, pathPrefix: string): Promise<string> => {
       if (pathPrefix.startsWith('file://')) {
           // Ensure separator exists
           const prefix = pathPrefix.endsWith('/') ? pathPrefix : pathPrefix + '/';
           return Capacitor.convertFileSrc(`${prefix}${file.name}`);
       }

       const filePath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
       try {
           const uriResult = await Filesystem.getUri({ path: filePath, directory: rootDirectory });
           return Capacitor.convertFileSrc(uriResult.uri);
       } catch (e) { return ""; }
  };

  const handleFileClick = async (file: FileInfo) => {
      if (file.type === 'directory') {
          // If current path is absolute, append
          if (currentPath.startsWith('file://') || currentPath.startsWith('/')) {
              // Fix: ensure separation
              const prefix = currentPath.endsWith('/') ? currentPath : currentPath + '/';
              const newPath = `${prefix}${file.name}`;
              loadAndroidDir(newPath, rootDirectory);
          } else {
              const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
              loadAndroidDir(newPath, rootDirectory);
          }
          return;
      } 
      if (saveMode) {
          if (file.type === 'file') setSaveFileName(file.name);
          return;
      }
      if (pickerMode || relinkMode) { 
          if (isAudioFile(file.name)) {
              let fullPath = "";
              if (currentPath.startsWith('file://')) {
                  const prefix = currentPath.endsWith('/') ? currentPath : currentPath + '/';
                  fullPath = `${prefix}${file.name}`;
              } else {
                  fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
              }
              
              if (relinkMode) {
                  handleRelinkSelect(file, fullPath);
              } else {
                  if (onFileSelect) {
                      const url = await resolveFileUrl(file, currentPath);
                      onFileSelect(file, url, fullPath);
                  }
                  if (onClose) onClose();
              }
          }
          return;
      }
      if (file.name.toLowerCase().endsWith('.txt')) {
          try {
              setIsProcessing(true);
              let filePath = "";
              let useAbs = false;
              
              if (currentPath.startsWith('file://')) {
                  const prefix = currentPath.endsWith('/') ? currentPath : currentPath + '/';
                  filePath = `${prefix}${file.name}`;
                  useAbs = true;
              } else {
                  filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
              }
              
              let contentsData = "";
              if (useAbs) {
                  const res = await Filesystem.readFile({ path: filePath }); 
                  contentsData = res.data as string;
              } else {
                  contentsData = await readTextFile(filePath, file.name, rootDirectory);
              }
              
              const parsed = parsePlaylistContent(contentsData);
              
              await checkFirstSongAndLoad(parsed, file.name, filePath, rootDirectory);

          } catch (e: any) {
              setError("Errore caricamento: " + e.message);
          } finally {
              setIsProcessing(false);
          }
      }
  };

  // NEW: HANDLE FOLDER PICKER FOR DESKTOP
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const files = Array.from(e.target.files);
          const firstFile = files[0] as any;
          let folderPath = "";
          
          if (firstFile.path) {
                const fullPath = firstFile.path.replace(/\\/g, '/');
                const lastSlash = fullPath.lastIndexOf('/');
                if (lastSlash > -1) {
                    folderPath = fullPath.substring(0, lastSlash);
                } else {
                    folderPath = fullPath;
                }
          } else {
              folderPath = "selected_folder";
          }

          const mappedFiles: FileInfo[] = files.map(f => ({
              name: f.name,
              type: 'file' as 'file', 
              size: f.size,
              mtime: f.lastModified,
              uri: ''
          })).sort((a,b) => {
              const aTxt = a.name.toLowerCase().endsWith('.txt');
              const bTxt = b.name.toLowerCase().endsWith('.txt');
              if (aTxt && !bTxt) return -1;
              if (!aTxt && bTxt) return 1;
              return a.name.localeCompare(b.name);
          });

          setDirContents(mappedFiles);
          setCurrentPath(folderPath);
          
          if (onPathChange) onPathChange(folderPath);
          
          if (folderInputRef.current) folderInputRef.current.value = "";
          
          setShowSaveOptions(false);
      }
  };


  const handleWebFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const files: File[] = Array.from(e.target.files);
          if (pickerMode || relinkMode) { 
              const file = files[0];
              const electronPath = (file as any).path;
              const fullPath = electronPath || file.name;
              
              if (relinkMode) {
                   handleRelinkSelect({
                       name: file.name,
                       type: 'file',
                       size: file.size,
                       mtime: file.lastModified,
                       uri: ''
                   }, fullPath);
              } else {
                   if (onFileSelect) {
                       const url = electronPath ? `file:///${electronPath.replace(/\\/g, '/')}` : URL.createObjectURL(file);
                       onFileSelect({
                           name: file.name,
                           type: 'file',
                           size: file.size,
                           mtime: file.lastModified,
                           uri: ''
                       }, url, fullPath);
                   }
                   if (onClose) onClose();
              }
              return;
          }
          const playlistFile = files.find(f => f.name.toLowerCase().endsWith('.txt'));
          if (playlistFile) {
              const reader = new FileReader();
              reader.onload = async (ev) => {
                  const content = ev.target?.result as string;
                  const parsed = parsePlaylistContent(content);
                  
                  let loadPath = (playlistFile as any).path || playlistFile.name;
                  const loadDirEnum = Directory.ExternalStorage; 

                  await checkFirstSongAndLoad(parsed, playlistFile.name, loadPath, loadDirEnum);
              };
              reader.readAsText(playlistFile);
          } else {
              const audioFiles = files.filter(f => isAudioFile(f.name)).sort((a,b) => a.name.localeCompare(b.name));
              if (audioFiles.length > 0) {
                  const songs: Song[] = audioFiles.map((f, i) => {
                      const electronPath = (f as any).path;
                      const url = electronPath ? `file:///${electronPath.replace(/\\/g, '/')}` : URL.createObjectURL(f);
                      return { 
                          id: `auto-${i}`, 
                          title: removeExtension(f.name), 
                          url: url, 
                          type: 'audio',
                          path: electronPath || f.name, 
                          originalFileName: f.name 
                      };
                  });
                  onPlaylistLoaded(songs, new Array(6).fill(undefined), undefined, undefined, undefined);
              } else {
                  setError("Nessun file trovato.");
              }
          }
      }
  };

  const performPathFix = async (fix: boolean) => {
      setPathFixModal({isOpen: false, data: null});
  };

  // --- SAVE HANDLERS ---
  const handleSaveClick = () => {
      if (!onSave) return;
      
      // FIX: Always respect the input field value first, falling back to globals only on init
      // Here, `saveFileName` is bound to the input, so it holds the TRUTH.
      let finalName = saveFileName;
      
      if (!finalName.toLowerCase().endsWith('.txt')) finalName += ".txt";
      
      // FIX: Construct the full path explicitly based on current browser location + typed name
      // This ignores any previous file loaded path logic when saving.
      let fullPath;
      if (isAndroid) {
          // Use current clean path from the explorer
          const cleanP = cleanAndroidPath(currentPath);
          const separator = cleanP.endsWith('/') ? '' : '/';
          // Force join: Folder + / + Name
          fullPath = `${cleanP}${separator}${finalName}`;
      } else {
          // Desktop Fallback: if currentPath is empty, check if we have a robust fallback from props
          // This fixes the "Save" (overwrite) case where UI didn't refresh currentPath in time.
          fullPath = getFullname(initialPath); 
      }
      
      onSave(finalName, fullPath, rootDirectory);
  };

  const enableSaveAs = async () => {
      console.log("Checking electronAPI:", (window as any).electronAPI); 
      if ((window as any).electronAPI) {
          const defaultName = saveFileName || 'playlist.txt';
          try {
              const fullPath = await (window as any).electronAPI.saveDialog(defaultName);
              if (fullPath && onSave) {
                   const fileName = extractFileName(fullPath);
                   onSave(fileName, fullPath, rootDirectory);
              }
          } catch (e) {
              console.error("Save Dialog Error", e);
          }
          return;
      }

      if (!isAndroid && folderInputRef.current) {
          folderInputRef.current.click();
      } else {
          setShowSaveOptions(false);
          if (!explorerInitialized && currentPath) {
              initializeExplorer();
          }
      }
  };

  // 1. DESKTOP "3 BUTTONS DIALOG"
  if (!isAndroid && saveMode && showSaveOptions) {
      return (
          <div className="flex flex-col h-full bg-slate-950 items-center justify-center p-6 relative">
              <input 
                 type="file" 
                 ref={folderInputRef}
                 onChange={handleFolderSelect}
                 className="hidden" 
                 {...({ webkitdirectory: "" } as any)} 
              />
              
              {onClose && <button onClick={onClose} className="absolute top-4 right-4 z-50 p-3 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-red-900/50 hover:border-red-500 border border-slate-700 transition-all shadow-lg"><X className="w-6 h-6" /></button>}
              <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
                  <div className="flex items-center gap-3 mb-8 text-emerald-400">
                      <Save className="w-8 h-8" />
                      <h2 className="text-2xl font-bold text-white tracking-tight">{t.save_playlist}</h2>
                  </div>
                  
                  <div className="flex flex-col gap-4">
                      <button 
                        onClick={handleSaveClick}
                        className="py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-95 flex items-center justify-center gap-3 group"
                      >
                          <Save className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                          <span className="text-sm uppercase tracking-wide">Save</span>
                      </button>

                      <div className="grid grid-cols-2 gap-4">
                          <button 
                            onClick={enableSaveAs}
                            className="py-5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 border border-slate-700 hover:border-indigo-500"
                          >
                              <FileSignature className="w-5 h-5" />
                              <span className="text-xs uppercase tracking-wide">Save As...</span>
                          </button>

                          <button 
                            onClick={onClose}
                            className="py-5 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-300 rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 border border-slate-700 hover:border-red-900/50"
                          >
                              <LogOut className="w-5 h-5" /> 
                              <span className="text-xs uppercase tracking-wide">Exit</span>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // 2. EXPLORER VIEW
  if ((isAndroid && explorerInitialized) || (!isAndroid && saveMode && !showSaveOptions) || (pickerMode && isAndroid) || (relinkMode && isAndroid)) {
       return (
          <div className="flex flex-col h-full bg-slate-950 text-slate-200 relative">
              
              <input 
                 type="file" 
                 ref={folderInputRef}
                 onChange={handleFolderSelect}
                 className="hidden" 
                 {...({ webkitdirectory: "" } as any)} 
              />
              
              <input 
                 type="file" 
                 multiple 
                 ref={fileInputRef}
                 onChange={handleWebFileSelect}
                 accept={pickerMode || relinkMode ? "audio/*,.mp3,.wav,.ogg,.m4a" : ".txt,.mp3,.wav,.ogg,.m4a,.flac"}
                 className="hidden" 
              />

              <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col shrink-0 gap-2">
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                          <button 
                              onClick={() => setExplorerInitialized(false)}
                              className="p-2 -ml-2 mr-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Indietro / Chiudi"
                          >
                              <ArrowLeft className="w-6 h-6" />
                          </button>

                          <FolderOpen className="w-6 h-6 text-emerald-500 shrink-0" />
                          
                          <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-xs text-slate-500 font-bold uppercase">{saveMode ? "Salva Playlist In..." : (relinkMode ? "CERCA PRIMO BRANO" : (pickerMode ? t.select_file : t.file_explorer))}</span>
                              
                              {/* EDITABLE PATH INPUT FOR ANDROID */}
                              {isAndroid ? (
                                  <input 
                                      type="text"
                                      value={manualPathInput}
                                      onChange={(e) => setManualPathInput(e.target.value)}
                                      onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                              loadAndroidDir(manualPathInput, Directory.ExternalStorage);
                                              (e.target as HTMLInputElement).blur();
                                          }
                                      }}
                                      className="text-sm font-mono text-white bg-transparent border-b border-transparent focus:border-emerald-500 outline-none w-full truncate placeholder-slate-600"
                                      placeholder="Digita percorso e premi invio..."
                                  />
                              ) : (
                                  <span className="text-sm font-mono truncate text-white">/{currentPath}</span>
                              )}
                          </div>
                      </div>
                      <div className="flex gap-2 relative">
                           {!isAndroid && (
                               <button 
                                  onClick={() => folderInputRef.current?.click()} 
                                  className="p-2 bg-slate-800 rounded-lg border border-slate-700 text-indigo-400 hover:text-white hover:border-indigo-500 transition-colors"
                                  title="Cambia Cartella"
                               >
                                  <FolderSearch className="w-6 h-6" />
                               </button>
                           )}

                           {/* NEW: ANDROID BOOKMARKS & UNITS */}
                           {isAndroid && (
                               <>
                                   {/* UNITS BUTTON (Storage Root) */}
                                   <button 
                                      onClick={() => { loadAndroidDir('file:///storage', Directory.ExternalStorage); }}
                                      className="p-2 rounded-lg border bg-slate-800 border-slate-700 text-indigo-400 hover:text-white hover:border-indigo-500 transition-colors shadow-lg"
                                      title="Tutte le Unità (USB/SD)"
                                   >
                                      <HardDrive className="w-6 h-6" />
                                   </button>

                                   {/* DYNAMIC BOOKMARKS MENU */}
                                   <button 
                                      onClick={() => setShowBookmarks(!showBookmarks)}
                                      className={`p-2 rounded-lg border transition-colors shadow-lg ${showBookmarks ? 'bg-amber-500 text-white border-amber-400' : 'bg-slate-800 border-slate-700 text-amber-400 hover:text-white hover:border-amber-500'}`}
                                      title="Segnalibri / Bookmarks"
                                   >
                                      <Star className="w-6 h-6" />
                                   </button>

                                   {showBookmarks && (
                                       <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                                           <div className="p-2 border-b border-slate-800 bg-slate-950/50">
                                               <span className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-2">Preferiti</span>
                                           </div>
                                           
                                           <div className="max-h-48 overflow-y-auto">
                                               {userBookmarks.length > 0 ? (
                                                   userBookmarks.map((bk, idx) => (
                                                       <div key={idx} className="flex items-center justify-between hover:bg-slate-800 border-b border-slate-800/50 last:border-0 group px-3 py-2">
                                                           <button 
                                                               onClick={() => { loadAndroidDir(bk.path, Directory.ExternalStorage); setShowBookmarks(false); }} 
                                                               className="flex-1 text-left text-white flex items-center gap-3 truncate"
                                                           >
                                                               <span className="text-amber-500 text-lg">★</span>
                                                               <div className="flex flex-col min-w-0">
                                                                   <span className="text-sm font-bold truncate">{bk.name}</span>
                                                                   <span className="text-[9px] text-slate-500 truncate font-mono">{bk.path}</span>
                                                               </div>
                                                           </button>
                                                           <button 
                                                               onClick={(e) => { e.stopPropagation(); removeBookmark(idx); }}
                                                               className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                                                           >
                                                               <Trash2 className="w-3 h-3" />
                                                           </button>
                                                       </div>
                                                   ))
                                               ) : (
                                                   <div className="p-4 text-center text-slate-600 text-xs italic">Nessun preferito salvato</div>
                                               )}
                                           </div>

                                           <button 
                                               onClick={addCurrentToBookmarks}
                                               className="m-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-colors"
                                           >
                                               <Plus className="w-3 h-3" /> Aggiungi Cartella Corrente
                                           </button>
                                       </div>
                                   )}
                                   
                                   {showBookmarks && (
                                       <div className="fixed inset-0 z-40" onClick={() => setShowBookmarks(false)}></div>
                                   )}
                               </>
                           )}

                           {currentPath && <button onClick={handleNavigateUp} className="p-2 bg-slate-800 rounded-lg border border-slate-700 hover:border-emerald-500 transition-colors"><ArrowUpCircle className="w-6 h-6" /></button>}
                           {onClose && <button onClick={onClose} className="p-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg border border-red-900/50 transition-colors"><X className="w-6 h-6" /></button>}
                      </div>
                  </div>
              </div>

              {relinkMode && (
                  <div className="m-2 p-3 bg-amber-900/30 border border-amber-500/50 rounded-xl flex items-center gap-3">
                      <FolderSearch className="w-6 h-6 text-amber-500 shrink-0" />
                      <div>
                          <p className="text-sm font-bold text-amber-200">Ricollegamento Intelligente</p>
                          <p className="text-xs text-amber-100/70">Seleziona il file <b>{pendingRelink?.parsed.songs[0]?.originalFileName}</b> nella nuova posizione.</p>
                      </div>
                  </div>
              )}

              {error && <div className="m-4 p-4 bg-red-900/20 border border-red-500/50 rounded-xl flex items-start gap-3"><AlertCircle className="w-6 h-6 text-red-500 shrink-0" /><p className="text-sm text-red-200">{error}</p></div>}
              
              <div className="flex-1 overflow-y-auto p-2 pb-24">
                  {isProcessing ? <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div></div> : (
                      <div className="grid grid-cols-1 gap-1">
                          {dirContents.map((file, idx) => {
                              const isDir = file.type === 'directory';
                              const isTxt = file.name.toLowerCase().endsWith('.txt');
                              const isAudio = isAudioFile(file.name);
                              let isDisabled = false;
                              if (saveMode) { if (!isDir && !isTxt) isDisabled = true; } 
                              else if (pickerMode || relinkMode) { if (!isDir && !isAudio) isDisabled = true; } 
                              else { if (!isDir && !isTxt && !isAudio) isDisabled = true; }
                              return (
                                  <button key={idx} onClick={() => !isDisabled && handleFileClick(file)} disabled={isDisabled} className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left group ${isDisabled ? 'opacity-30 border-transparent cursor-not-allowed' : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'}`}>
                                      <div className="shrink-0 text-slate-500 group-hover:text-emerald-400">{isDir ? <Folder className="w-8 h-8 fill-slate-800" /> : (isTxt ? <FileText className="w-8 h-8 text-amber-500" /> : <Music className="w-8 h-8" />)}</div>
                                      <div className="flex-1 min-w-0"><h4 className={`text-base font-medium truncate ${isDir ? 'text-white' : 'text-slate-300'}`}>{file.name}</h4>{file.type === 'file' && <p className="text-xs text-slate-500">{file.size ? (file.size/1024/1024).toFixed(2) + ' MB' : ''}</p>}</div>
                                      {!isDisabled && <ChevronRight className="w-5 h-5 text-slate-600" />}
                                  </button>
                              );
                          })}
                          {dirContents.length === 0 && <div className="text-center py-10 text-slate-600">{t.empty_folder}</div>}
                      </div>
                  )}
              </div>
              {saveMode && <div className="absolute bottom-0 left-0 w-full p-4 bg-slate-900 border-t border-slate-800 shrink-0 flex items-center gap-4 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
                  <div className="flex-1"><label className="block text-xs text-slate-500 font-bold uppercase mb-1">{t.file_name_label}</label><div className="relative"><input type="text" value={saveFileName} onChange={(e) => setSaveFileName(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg py-3 px-4 text-white font-mono focus:outline-none focus:border-emerald-500" placeholder="playlist.txt"/></div></div>
                  <button onClick={handleSaveClick} className="h-12 px-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95 mt-5"><Save className="w-5 h-5" /> {t.btn_save}</button>
              </div>}
          </div>
      );
  }

  // RENDER LANDING VIEW (DEFAULT)
  return (
    <div className="flex flex-col h-full bg-slate-950 items-center justify-center p-6 relative overflow-hidden">
        
        <input 
            type="file" 
            multiple 
            ref={fileInputRef}
            onChange={handleWebFileSelect}
            accept={pickerMode || relinkMode ? "audio/*,.mp3,.wav,.ogg,.m4a" : ".txt,.mp3,.wav,.ogg,.m4a,.flac"}
            className="hidden" 
        />
        {/* ... (Existing code for Modals remains unchanged but is omitted here for brevity as it was not changed) ... */}
        {/* Modals are unchanged */}
        
        {/* DEBUG MODAL */}
        {debugModal.isOpen && (
            <div className="absolute inset-0 z-[100] bg-black/90 flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full flex flex-col max-h-[90vh]">
                    <div className="flex items-center gap-2 mb-4 text-indigo-400">
                        <Database className="w-6 h-6" />
                        <h3 className="text-lg font-bold text-white">Configurazione ({HISTORY_FILENAME})</h3>
                    </div>
                    <div className="mb-4">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Target</p>
                        <code className="block bg-black/50 p-2 rounded text-xs font-mono text-emerald-400 break-all select-all">{debugModal.path}</code>
                    </div>
                    <div className="flex-1 min-h-0 mb-4 flex flex-col">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Contenuto (Raw)</p>
                        <textarea readOnly className="flex-1 w-full bg-black/50 p-3 rounded text-xs font-mono text-slate-300 resize-none focus:outline-none border border-slate-800" value={debugModal.content} />
                    </div>
                    <div className="flex gap-3 justify-end flex-wrap">
                        {/* MANUAL WRITE TRIGGER */}
                        <button onClick={forceTestWrite} className="px-4 py-2 bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 border border-amber-900 rounded-lg text-xs font-bold flex items-center gap-2 mr-auto">
                            <Save className="w-3 h-3" /> FORZA CREAZIONE FILE
                        </button>

                        <button onClick={forceDeleteConfig} className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900 rounded-lg text-xs font-bold flex items-center gap-2">
                            <Trash className="w-3 h-3" /> Reset Storico
                        </button>
                        <button onClick={() => setDebugModal({isOpen: false, content: '', path: ''})} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm">Chiudi</button>
                    </div>
                </div>
            </div>
        )}
        {/* PENDING RELINK MODAL */}
        {pendingRelink && (
            <div className="absolute inset-0 z-[150] bg-black/90 flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">File Mancante</h3>
                    <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                        Il primo brano della scaletta non è stato trovato:
                    </p>
                    <div className="bg-slate-800/50 p-2 rounded border border-slate-700 mb-4 font-mono text-xs text-amber-300 break-all">
                        {pendingRelink.parsed.songs[0]?.originalFileName || "Sconosciuto"}
                    </div>
                    <p className="text-slate-400 text-xs mb-6">
                        Vuoi cercarlo manualmente? Se lo selezioni, la posizione di tutti gli altri brani verrà aggiornata automaticamente.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button 
                            onClick={() => {
                                const songsWithRawPaths = pendingRelink.parsed.songs.map((s: Song) => ({
                                    ...s,
                                    url: s.path || s.originalFileName || ""
                                }));
                                const sfxWithRawPaths = pendingRelink.parsed.sfx.map((s: SfxItem) => {
                                    if(!s) return s;
                                    return {
                                        ...s,
                                        url: s.path || s.originalFileName || ""
                                    };
                                });

                                finishLoading(songsWithRawPaths, sfxWithRawPaths, pendingRelink.fileName, pendingRelink.path, pendingRelink.directory, pendingRelink.parsed.scriptPath);
                                setPendingRelink(null);
                            }}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold border border-slate-700"
                        >
                            No, ignora
                        </button>
                        <button 
                            onClick={() => {
                                setRelinkMode(true);
                                if (!isAndroid && fileInputRef.current) {
                                    fileInputRef.current.click();
                                } else {
                                    initializeExplorer();
                                }
                            }}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg"
                        >
                            Sì, Cerca
                        </button>
                    </div>
                </div>
            </div>
        )}
        {/* CONFIRM/ERROR MODALS... */}
        {pathFixModal.isOpen && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
                    <AlertOctagon className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">{language === 'it' ? "Discrepanza Percorso" : "Path Mismatch"}</h3>
                    <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                        {language === 'it' ? "La playlist sembra provenire da un'altra cartella. Vuoi aggiornare i percorsi?" : "The playlist seems to come from another folder. Do you want to update file paths?"}
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button onClick={() => performPathFix(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold border border-slate-700">No</button>
                        <button onClick={() => performPathFix(true)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg">Sì</button>
                    </div>
                </div>
            </div>
        )}

        {/* ERROR / DEBUG MODAL (Load Failed) */}
        {historyRemoveModal.isOpen && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full text-center shadow-2xl">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">{t.history_remove_title}</h3>
                    <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                        {t.history_remove_msg}
                    </p>
                    <div className="bg-black/40 rounded-lg p-3 mb-6 text-left border border-slate-800">
                         <div className="mb-2">
                             <span className="text-[10px] text-slate-500 font-bold uppercase block">{t.history_debug_path}</span>
                             <code className="text-[11px] text-red-300 font-mono break-all block">{historyRemoveModal.debugPath || historyRemoveModal.item?.path}</code>
                         </div>
                         <div>
                             <span className="text-[10px] text-slate-500 font-bold uppercase block">{t.history_debug_config}</span>
                             <code className="text-[11px] text-indigo-300 font-mono break-all block">{historyRemoveModal.configPath || "Loading..."}</code>
                         </div>
                    </div>
                    <div className="flex gap-3 justify-center">
                        <button onClick={() => setHistoryRemoveModal({isOpen: false, item: null})} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold border border-slate-700">{t.btn_cancel}</button>
                        <button onClick={() => historyRemoveModal.item && removeFromHistory(historyRemoveModal.item.path)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold shadow-lg">{t.btn_confirm}</button>
                    </div>
                </div>
            </div>
        )}

        {/* CONFIRM REMOVE EXISTING FILE MODAL */}
        {confirmRemoveOpen && loadConfirmModal.item && (
            <div className="absolute inset-0 z-[130] bg-black/80 flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
                    <Trash className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">{t.history_user_remove_title}</h3>
                    <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                        {t.history_user_remove_msg}
                    </p>
                    <div className="bg-slate-800/50 rounded-lg p-2 mb-6 border border-slate-700">
                        <div className="font-bold text-white text-sm">{loadConfirmModal.item.name}</div>
                    </div>
                    <div className="flex gap-3 justify-center">
                        <button onClick={() => setConfirmRemoveOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold border border-slate-700">{t.btn_cancel}</button>
                        <button onClick={() => removeFromHistory(loadConfirmModal.item!.path)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold shadow-lg">{t.btn_remove}</button>
                    </div>
                </div>
            </div>
        )}

        {/* LOAD CONFIRMATION MODAL */}
        {loadConfirmModal.isOpen && loadConfirmModal.item && !confirmRemoveOpen && (
            <div className="absolute inset-0 z-[120] bg-black/80 flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
                    <div className="flex items-center gap-3 mb-4">
                        {missingFiles.has(loadConfirmModal.item.path) ? (
                            <>
                                <AlertTriangle className="w-8 h-8 text-orange-500" />
                                <h3 className="text-xl font-bold text-orange-500">Playlist non trovata</h3>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                                <h3 className="text-xl font-bold text-white">Carica Playlist?</h3>
                            </>
                        )}
                    </div>
                    
                    <div className="mb-6 space-y-4">
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Nome Playlist</label>
                            <div className="text-white font-bold text-lg">{loadConfirmModal.item.name}</div>
                        </div>
                        
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Percorso Completo</label>
                            <div className="text-slate-300 font-mono text-xs break-all leading-relaxed">
                                {loadConfirmModal.item.path}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <button 
                            onClick={() => {
                                if (loadConfirmModal.item) {
                                    if (missingFiles.has(loadConfirmModal.item.path)) {
                                        removeFromHistory(loadConfirmModal.item.path);
                                    } else {
                                        setConfirmRemoveOpen(true);
                                    }
                                }
                            }}
                            className={`px-4 py-3 rounded-xl font-bold transition-colors border flex items-center gap-2 text-xs 
                                ${missingFiles.has(loadConfirmModal.item.path) 
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg' 
                                    : 'bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-white border-red-900/50'
                                }`}
                            title="Rimuovi dallo storico"
                        >
                            <Trash className="w-4 h-4" /> 
                            {t.btn_remove || "Rimuovi"}
                        </button>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setLoadConfirmModal({isOpen: false, item: null})} 
                                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700"
                            >
                                {t.btn_cancel}
                            </button>
                            <button 
                                onClick={() => {
                                    if (loadConfirmModal.item) {
                                        loadFromPath(loadConfirmModal.item.path, loadConfirmModal.item.name);
                                    }
                                }} 
                                disabled={missingFiles.has(loadConfirmModal.item.path)}
                                className={`px-6 py-3 rounded-xl font-bold transition-colors shadow-lg
                                    ${missingFiles.has(loadConfirmModal.item.path)
                                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    }`}
                            >
                                {t.btn_confirm}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {onClose && (
            <button onClick={onClose} className="absolute top-4 right-4 z-50 p-3 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-red-900/50 hover:border-red-500 border border-slate-700 transition-all shadow-lg">
                <X className="w-6 h-6" />
            </button>
        )}

        {!pickerMode && !relinkMode && !saveMode && onSettingsRequest && (
            <div className="absolute bottom-6 left-6 z-50 animate-in fade-in duration-500">
                <button 
                    onClick={onSettingsRequest}
                    className="p-3 rounded-full bg-slate-800 text-slate-400 hover:text-white border border-slate-700 hover:border-indigo-500 shadow-lg hover:shadow-indigo-500/20 transition-all active:scale-95"
                    title="Impostazioni"
                >
                    <Settings className="w-6 h-6" />
                </button>
            </div>
        )}

        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
            <div className="absolute top-1/2 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-5xl w-full flex flex-col gap-8">
            
            <div className="flex items-center justify-center gap-6 mb-4">
                 <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl flex items-center justify-center overflow-hidden shrink-0">
                    <img 
                        src="./icon.png" 
                        alt="App Icon" 
                        className="w-full h-full object-cover" 
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                    />
                </div>
                <div className="text-left flex flex-col justify-center">
                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none mb-1">Regia Musiche <span className="text-emerald-500">Attozero</span></h1>
                    <p className="text-slate-400 text-sm md:text-base">
                        {pickerMode || relinkMode ? t.select_audio_title : t.select_playlist_title}
                        {appVersion && !pickerMode && !relinkMode && <span className="opacity-50 ml-1">({appVersion})</span>}
                    </p>
                </div>
            </div>

            {error && (
                <div className="w-full bg-red-900/20 border border-red-500/50 rounded-xl p-4 flex items-center gap-3 text-left">
                    <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                    <p className="text-sm text-red-200">{error}</p>
                </div>
            )}

            <div className="flex flex-row items-stretch justify-center gap-6 h-64">
                
                {!pickerMode && !relinkMode && (
                    <button 
                        onClick={() => { onPlaylistLoaded([], new Array(6).fill(undefined), undefined, undefined, undefined); }}
                        className="flex-1 flex flex-col items-center justify-center gap-3 bg-slate-900 border border-slate-700 hover:border-indigo-500 hover:bg-slate-800 p-6 rounded-2xl transition-all group shadow-xl active:scale-95"
                    >
                        <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition-transform">
                            <FilePlus className="w-8 h-8" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-white mb-1">{t.new_playlist}</h3>
                            <p className="text-xs text-slate-500">{t.start_scratch}</p>
                        </div>
                    </button>
                )}

                {isAndroid ? (
                     <button 
                        onClick={initializeExplorer}
                        className="flex-1 flex flex-col items-center justify-center gap-3 bg-slate-900 border border-slate-700 hover:border-emerald-500 hover:bg-slate-800 p-6 rounded-2xl transition-all group shadow-xl active:scale-95"
                     >
                         <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
                             <FolderOpen className="w-8 h-8" />
                         </div>
                         <div className="text-center">
                             <h3 className="text-lg font-bold text-white mb-1">{t.browse_device}</h3>
                             <p className="text-xs text-slate-500">{t.search_internal}</p>
                         </div>
                     </button>
                ) : (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 flex flex-col items-center justify-center gap-3 bg-slate-900 border border-slate-700 hover:border-emerald-500 hover:bg-slate-800 p-6 rounded-2xl transition-all group shadow-xl cursor-pointer active:scale-95"
                    >
                         <input 
                            type="file" 
                            multiple 
                            ref={fileInputRef}
                            onChange={handleWebFileSelect}
                            accept={pickerMode || relinkMode ? "audio/*,.mp3,.wav,.ogg,.m4a" : ".txt,.mp3,.wav,.ogg,.m4a,.flac"}
                            className="hidden" 
                         />
                         <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
                             <FolderOpen className="w-8 h-8" />
                         </div>
                         <div className="text-center">
                             <h3 className="text-lg font-bold text-white mb-1">{t.load_file}</h3>
                             <p className="text-xs text-slate-500">
                                 {pickerMode || relinkMode ? t.select_audio_title : t.select_playlist_title}
                             </p>
                         </div>
                    </div>
                )}

                {!pickerMode && !relinkMode && (
                    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xl">
                        <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-amber-500" />
                                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">{t.recent_playlists}</h3>
                            </div>
                            {!isAndroid && (
                                <button 
                                    onClick={handleDebugClick}
                                    className="flex items-center gap-1 text-[9px] text-slate-500 font-mono border-t border-slate-700 pt-1 mt-1 truncate hover:text-white cursor-pointer transition-colors w-full text-left" 
                                    title="Clicca per localizzare il file di configurazione"
                                >
                                    <MapPin className="w-3 h-3 text-slate-600" />
                                    <span className="truncate">{currentPath} (Documents/DB)</span>
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                            {recentPlaylists.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                    {recentPlaylists.map((item, idx) => {
                                        const isMissing = missingFiles.has(item.path);
                                        return (
                                            <button 
                                                key={idx}
                                                onClick={() => setLoadConfirmModal({isOpen: true, item})}
                                                className="text-left p-2 rounded-lg hover:bg-slate-800 transition-colors group border border-transparent hover:border-slate-700 w-full"
                                            >
                                                <div className={`font-bold text-xs truncate ${isMissing ? 'text-orange-500 group-hover:text-orange-400' : 'text-slate-300 group-hover:text-emerald-400'}`}>
                                                    {item.name} {isMissing && "(File Mancante)"}
                                                </div>
                                                <div className="flex items-center justify-between mt-0.5">
                                                    <div className={`text-[9px] font-mono truncate max-w-[150px] ${isMissing ? 'text-orange-800' : 'text-slate-600'}`} title={item.path}>{item.path}</div>
                                                    <div className="flex items-center gap-1 text-[9px] text-slate-700">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {new Date(item.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                                    <Clock className="w-8 h-8 mb-2" />
                                    <span className="text-xs font-bold uppercase">{t.recent_empty}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-2 text-center">
                <span className="text-[9px] text-slate-600 font-mono">{debugStatus}</span>
            </div>

            <button onClick={onOpenInfo} className="text-slate-500 hover:text-white flex items-center gap-2 text-sm font-bold uppercase tracking-wider mt-1 mx-auto">
                <Info className="w-4 h-4" /> {t.info_credits}
            </button>
        </div>
    </div>
  );
};

export default FileLoader;
