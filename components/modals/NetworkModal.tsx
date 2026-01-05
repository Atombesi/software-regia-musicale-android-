import React, { useState, useEffect } from 'react';
import { Wifi, Server, Smartphone, Monitor, CheckCircle2, XCircle, Loader2, Network, X, History, DownloadCloud, Lock, UserCircle, Trash2, Power, MessageSquare, AlertTriangle, FileWarning } from 'lucide-react';
import { RemoteSyncHook } from '../../hooks/useRemoteSync';
import { isAndroidPlatform, extractFileName } from '../../utils/platformUtils';
import { Song, SfxItem } from '../../types';
import { checkLocalAsset, ASSETS_FOLDER } from '../../utils/androidFileUtils';
import { writeTextFile, saveDownloadedAssetUniversal } from '../../utils/filesystemUtils';
import { Directory } from '@capacitor/filesystem';

interface NetworkModalProps {
    isOpen: boolean;
    onClose: () => void;
    sync: RemoteSyncHook;
    t: any;
    // NEW PROPS FOR DOWNLOAD
    songs?: Song[];
    sfx?: SfxItem[];
    masterFilePath?: string; // PATH OF THE PLAYLIST FILE ON MASTER
    onAssetsUpdated?: (songs?: Song[], sfx?: SfxItem[]) => void; // MODIFIED SIGNATURE
    
    // SECURITY PROPS
    clientPin?: string;
    onChangeClientPin?: (val: string) => void;
    serverPin?: string; // For starting server
    clientName?: string; // For connecting
}

const NetworkModal: React.FC<NetworkModalProps> = ({ 
    isOpen, onClose, sync, t, songs = [], sfx = [], masterFilePath, onAssetsUpdated,
    clientPin = "", onChangeClientPin, serverPin = "", clientName = ""
}) => {
    const [activeTab, setActiveTab] = useState<'server' | 'client'>(isAndroidPlatform() ? 'client' : 'server');
    const [inputIP, setInputIP] = useState("");
    const [savedIPs, setSavedIPs] = useState<string[]>([]);
    
    // Download State
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0); // 0-100
    const [downloadStatusText, setDownloadStatusText] = useState("");
    
    // Error Reporting State
    const [errorDetails, setErrorDetails] = useState<string[]>([]);
    const [showErrorDialog, setShowErrorDialog] = useState(false);

    useEffect(() => {
        // Load IP history
        const loaded = localStorage.getItem('regia_ip_history');
        if (loaded) {
            try { setSavedIPs(JSON.parse(loaded)); } catch (e) {}
        }
        
        // Reset input IP if connected
        if (sync.status === 'connected' && sync.role === 'slave' && sync.connectedIP) {
            setInputIP(sync.connectedIP);
        }
    }, [sync.status, sync.role, sync.connectedIP, isOpen]);

    // Save IP on successful connection
    useEffect(() => {
        if (sync.status === 'connected' && sync.role === 'slave' && sync.connectedIP) {
            const newHistory = [sync.connectedIP, ...savedIPs.filter(ip => ip !== sync.connectedIP)].slice(0, 3);
            setSavedIPs(newHistory);
            localStorage.setItem('regia_ip_history', JSON.stringify(newHistory));
        }
    }, [sync.status, sync.role, sync.connectedIP]);

    const handleDownloadMedia = async () => {
        if (!sync.connectedIP) return;
        setIsDownloading(true);
        setDownloadProgress(0);
        setErrorDetails([]); // Reset errors
        setShowErrorDialog(false);
        
        const allItems = [...songs, ...sfx.filter(s => s && s.url)];
        const total = allItems.length + (masterFilePath ? 1 : 0);
        
        if (total === 0) {
            setDownloadStatusText("Nessun file da scaricare.");
            setIsDownloading(false);
            return;
        }

        let completed = 0;
        const errors: string[] = [];

        // --- WINDOWS SPECIFIC LOGIC ---
        if (!isAndroidPlatform()) {
            const electron = (window as any).electronAPI;
            if (electron) {
                try {
                    // 1. Determine Target Path: Downloads/RegiaMusiche_Client
                    const downloadDir = await electron.getPath('downloads');
                    // Force using forward slashes for internal consistency in JS, Electron/Node handles OS path seps
                    const targetDir = `${downloadDir.replace(/\\/g, '/')}/RegiaMusiche_Client`;
                    
                    // 2. Create Directory
                    await electron.createDir(targetDir);
                    
                    // Arrays to hold the remapped items
                    const remappedSongs = songs.map(s => ({...s})); // Clone
                    const remappedSfx = sfx.map(s => s ? {...s} : undefined); // Clone

                    // 3. Loop and Download
                    for (const item of allItems) {
                        if (!item || !item.originalFileName) continue;
                        const fileName = item.originalFileName;
                        
                        // Path on local disk
                        const localFullPath = `${targetDir}/${fileName}`;
                        
                        setDownloadStatusText(`${t.download_progress} ${fileName}`);

                        let masterUrl = ""; // Init here for scope visibility in catch

                        try {
                            // Download from Master
                            masterUrl = `http://${sync.connectedIP}:8081/stream?path=${encodeURIComponent(item.path || "")}`;
                            const response = await fetch(masterUrl);
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            const blob = await response.blob();
                            
                            // Convert to Base64
                            const base64 = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });

                            // Write to Disk
                            await electron.writeBinary(localFullPath, base64);

                            // REMAP IN MEMORY
                            // Update Song references
                            remappedSongs.forEach(s => {
                                if (s.id === item.id) {
                                    s.path = localFullPath; // Real absolute path on Windows
                                    s.url = `file:///${localFullPath}`; // URL for Audio Player
                                }
                            });
                            // Update SFX references
                            remappedSfx.forEach(s => {
                                if (s && s.id === item.id) {
                                    s.path = localFullPath;
                                    s.url = `file:///${localFullPath}`;
                                }
                            });

                        } catch (e: any) {
                            console.error(`Error downloading ${fileName}`, e);
                            // ENHANCED DEBUG LOGGING
                            errors.push(`FILE: ${fileName}\nURL: ${masterUrl}\nORIG_PATH: ${item.path}\nDEST: ${localFullPath}\nERR: ${e.message}`);
                        }
                        
                        completed++;
                        setDownloadProgress(Math.round((completed / total) * 100));
                    }

                    // Download Playlist File (Optional/Backup)
                    if (masterFilePath) {
                        try {
                            const playlistName = extractFileName(masterFilePath);
                            const masterUrl = `http://${sync.connectedIP}:8081/stream?path=${encodeURIComponent(masterFilePath)}`;
                            const response = await fetch(masterUrl);
                            if (response.ok) {
                                const text = await response.text();
                                await electron.writeFile(`${targetDir}/${playlistName}`, text);
                            }
                        } catch (e) {}
                        completed++;
                        setDownloadProgress(Math.round((completed / total) * 100));
                    }

                    setIsDownloading(false);
                    if (errors.length > 0) {
                        setDownloadStatusText(`${t.download_error}: ${errors.length} files failed.`);
                        setErrorDetails([`TARGET FOLDER: ${targetDir}`, ...errors]);
                        setShowErrorDialog(true);
                    } else {
                        setDownloadStatusText(t.download_complete);
                        // TRIGGER REMAP IN APP
                        if (onAssetsUpdated) onAssetsUpdated(remappedSongs, remappedSfx as SfxItem[]);
                    }
                    return; // EXIT FUNCTION FOR WINDOWS

                } catch (mainErr: any) {
                    setIsDownloading(false);
                    setErrorDetails([`INIT ERROR: ${mainErr.message}`]);
                    setShowErrorDialog(true);
                    return;
                }
            }
        }

        // --- ANDROID LOGIC (EXISTING) ---
        // 1. DOWNLOAD PLAYLIST FILE (.txt)
        if (masterFilePath) {
            const playlistName = extractFileName(masterFilePath);
            setDownloadStatusText(`Scaricamento Playlist: ${playlistName}`);
            try {
                const masterUrl = `http://${sync.connectedIP}:8081/stream?path=${encodeURIComponent(masterFilePath)}`;
                const response = await fetch(masterUrl);
                if (!response.ok) throw new Error("Server response " + response.status);
                
                const textContent = await response.text();
                
                if(isAndroidPlatform()) {
                     await writeTextFile(`${ASSETS_FOLDER}/${playlistName}`, playlistName, textContent, Directory.External);
                } 
                
            } catch (e: any) {
                console.error(`Error downloading playlist ${playlistName}`, e);
                errors.push(`PLAYLIST: ${playlistName}\nPATH: ${masterFilePath}\nERR: ${e.message}`);
            }
            completed++;
            setDownloadProgress(Math.round((completed / total) * 100));
        }

        // 2. DOWNLOAD MEDIA ASSETS
        for (const item of allItems) {
            if (!item || !item.originalFileName) continue;
            
            const fileName = item.originalFileName;
            setDownloadStatusText(`${t.download_progress} ${fileName}`);

            try {
                // 1. Check if exists locally (Optimization for Android)
                let exists = false;
                if(isAndroidPlatform()) {
                    exists = (await checkLocalAsset(fileName)) !== null;
                }
                
                if (exists) {
                    // Skip download
                } else {
                    // 2. Download from Master HTTP Server (Port 8081)
                    const masterUrl = `http://${sync.connectedIP}:8081/stream?path=${encodeURIComponent(item.path || "")}`;
                    
                    const response = await fetch(masterUrl);
                    if (!response.ok) throw new Error("Server response " + response.status);
                    
                    const blob = await response.blob();
                    
                    // Convert to Base64
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const res = reader.result as string;
                            const base64Raw = res.split(',')[1];
                            resolve(base64Raw);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });

                    // 3. Save to Assets (Universal)
                    await saveDownloadedAssetUniversal(fileName, base64);
                }
            } catch (e: any) {
                console.error(`Error downloading ${fileName}`, e);
                errors.push(`FILE: ${fileName}\nREMOTE PATH: ${item.path}\nERR: ${e.message}`);
            }

            completed++;
            setDownloadProgress(Math.round((completed / total) * 100));
        }

        setIsDownloading(false);
        if (errors.length > 0) {
             setDownloadStatusText(`${t.download_error}: ${errors.length} files failed.`);
             setErrorDetails(errors);
             setShowErrorDialog(true);
        } else {
             setDownloadStatusText(t.download_complete);
             // Trigger App refresh
             if (onAssetsUpdated) onAssetsUpdated();
        }
    };

    const handleKick = (clientId: string, clientName: string) => {
        if (window.confirm(`Sei sicuro di voler disconnettere ${clientName}?`)) {
            sync.kickClient(clientId);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[190] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-md w-full flex flex-col overflow-hidden max-h-[90vh] relative">
                
                {/* --- ERROR DETAIL OVERLAY --- */}
                {showErrorDialog && (
                    <div className="absolute inset-0 z-[200] bg-slate-950 flex flex-col animate-in fade-in slide-in-from-bottom-10">
                        <div className="p-4 border-b border-slate-800 bg-red-900/20 flex items-center gap-3 shrink-0">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                            <h3 className="font-bold text-white text-lg">Report Errori Download</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <p className="text-slate-400 text-xs mb-4">
                                I seguenti file non sono stati scaricati correttamente. Verifica i percorsi sul PC Master o i permessi di scrittura locale.
                            </p>
                            <div className="flex flex-col gap-2">
                                {errorDetails.map((err, idx) => (
                                    <div key={idx} className="bg-slate-900 border border-slate-700 p-3 rounded-lg">
                                        <textarea
                                            readOnly
                                            value={err}
                                            className="w-full h-24 bg-black/30 border border-slate-800 rounded p-2 text-[10px] font-mono text-red-300 resize-none focus:outline-none focus:border-red-500"
                                            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 shrink-0">
                            <button 
                                onClick={() => setShowErrorDialog(false)}
                                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors border border-slate-600"
                            >
                                Chiudi Report
                            </button>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-full text-indigo-400">
                            <Wifi className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white leading-tight">{t.network_title}</h2>
                            <div className="flex items-center gap-2">
                                {sync.status === 'connected' ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                        <CheckCircle2 className="w-3 h-3" /> {t.status_connected} ({sync.role})
                                    </span>
                                ) : sync.status === 'connecting' ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                                        <Loader2 className="w-3 h-3 animate-spin" /> {t.status_connecting}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        <XCircle className="w-3 h-3" /> {t.status_disconnected}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full transition-colors border border-slate-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800 shrink-0">
                    <button 
                        onClick={() => setActiveTab('server')}
                        className={`flex-1 py-3 font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 
                        ${activeTab === 'server' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Monitor className="w-4 h-4" /> {t.role_server}
                    </button>
                    <button 
                        onClick={() => setActiveTab('client')}
                        className={`flex-1 py-3 font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 
                        ${activeTab === 'client' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Smartphone className="w-4 h-4" /> {t.role_client}
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 flex-1 bg-slate-900/50 overflow-y-auto custom-scrollbar">
                    
                    {/* SERVER TAB */}
                    {activeTab === 'server' && (
                        <div className="flex flex-col gap-4 items-center text-center">
                            {sync.status === 'connected' && sync.role === 'master' ? (
                                <div className="w-full flex flex-col gap-2">
                                    <div className="text-xs text-slate-400 text-left mb-1">
                                        Indirizzi IP (Regia):
                                    </div>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {sync.serverIPs.map((ipObj, idx) => (
                                            <div key={idx} className="bg-slate-800 rounded-lg p-2 border border-slate-700 flex items-center gap-2">
                                                <Network className="w-3 h-3 text-emerald-400" />
                                                <span className="text-sm font-mono font-bold text-white select-all">
                                                    {ipObj.address}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="text-xs text-slate-400 text-left mb-1 border-t border-slate-800 pt-2 flex justify-between items-center">
                                        <span>Dispositivi Connessi ({sync.clientCount})</span>
                                    </div>

                                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                        {sync.clients.map((client, idx) => (
                                            <div key={client.id} className="bg-slate-800/80 rounded-xl p-3 border border-slate-700 flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${client.locked ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                                            <Smartphone className="w-4 h-4" />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="text-sm font-bold text-white truncate max-w-[120px]">{client.name}</div>
                                                            <div className="text-[10px] font-mono text-slate-500">{client.ip}</div>
                                                        </div>
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={() => handleKick(client.id, client.name)}
                                                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                                        title="Disconnetti (Kick)"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                {/* Permission Toggle Row */}
                                                <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-2 px-3">
                                                    <span className="text-[10px] font-bold uppercase text-slate-400">Permessi Regia</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[9px] font-bold ${client.locked ? 'text-indigo-400' : 'text-emerald-400'}`}>
                                                            {client.locked ? 'SOLO CHAT' : 'COMPLETI'}
                                                        </span>
                                                        <button 
                                                            onClick={() => sync.setClientPermission(client.id, !client.locked)}
                                                            className={`w-10 h-5 rounded-full relative transition-colors ${!client.locked ? 'bg-emerald-600' : 'bg-slate-700'}`}
                                                            title={client.locked ? "Sblocca Comandi" : "Blocca Comandi (Solo Chat)"}
                                                        >
                                                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${!client.locked ? 'left-5.5' : 'left-0.5'}`} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {sync.clientCount === 0 && (
                                            <div className="p-4 text-center text-slate-600 italic text-xs">
                                                In attesa di connessioni...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-16 bg-slate-800/30 rounded-xl border border-dashed border-slate-700 flex items-center justify-center">
                                    <span className="text-slate-600 font-bold uppercase text-xs">Server Offline</span>
                                </div>
                            )}

                            {sync.status === 'connected' && sync.role === 'master' ? (
                                <button onClick={sync.stopServer} className="w-full py-2.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900 rounded-xl font-bold transition-all text-sm mt-4">
                                    {t.server_stop}
                                </button>
                            ) : (
                                <button onClick={() => sync.startServer(serverPin)} disabled={isAndroidPlatform()} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                                    {t.server_start}
                                </button>
                            )}
                            {isAndroidPlatform() && <p className="text-[10px] text-red-400/50 mt-[-5px]">Non disponibile su Android</p>}
                        </div>
                    )}

                    {/* CLIENT TAB */}
                    {activeTab === 'client' && (
                        <div className="flex flex-col gap-4 items-center text-center">
                             <div className="flex items-center justify-center w-12 h-12 bg-slate-800 rounded-full mb-1">
                                <Smartphone className="w-6 h-6 text-slate-500" />
                             </div>
                             
                             <div className="w-full space-y-3">
                                 <div>
                                     <label className="block text-left text-[10px] text-slate-500 font-bold uppercase mb-1.5">{t.client_ip_label}</label>
                                     <input 
                                        type="text" 
                                        value={inputIP}
                                        onChange={(e) => setInputIP(e.target.value)}
                                        placeholder="192.168.1.xxx"
                                        className="w-full bg-slate-800 border-2 border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white font-mono text-base text-center tracking-wide outline-none transition-colors"
                                        disabled={sync.status === 'connected'}
                                     />
                                 </div>
                                 
                                 {/* PIN INPUT FOR CLIENT */}
                                 {sync.status !== 'connected' && (
                                     <div>
                                         <label className="block text-left text-[10px] text-slate-500 font-bold uppercase mb-1.5">{t.client_pin_label}</label>
                                         <div className="relative">
                                             <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                                 <Lock className="w-4 h-4" />
                                             </div>
                                             <input 
                                                type="text"
                                                inputMode="numeric" 
                                                pattern="[0-9]*"
                                                autoComplete="off"
                                                value={clientPin}
                                                onChange={(e) => onChangeClientPin && onChangeClientPin(e.target.value)}
                                                placeholder="****"
                                                className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl pl-10 pr-3 py-2 text-white font-mono text-base tracking-widest outline-none transition-colors"
                                             />
                                         </div>
                                     </div>
                                 )}
                             </div>
                             
                             {/* SAVED IPS */}
                             {!sync.connectedIP && savedIPs.length > 0 && (
                                 <div className="w-full flex flex-wrap gap-2 justify-center">
                                     {savedIPs.map((ip, i) => (
                                         <button 
                                            key={i}
                                            onClick={() => setInputIP(ip)}
                                            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-md text-[10px] text-slate-400 hover:text-white hover:border-indigo-500 transition-colors flex items-center gap-1"
                                         >
                                             <History className="w-3 h-3" /> {ip}
                                         </button>
                                     ))}
                                 </div>
                             )}

                             {sync.status === 'connected' && sync.role === 'slave' ? (
                                 <div className="w-full flex flex-col gap-3">
                                     {/* DEVICE NAME INFO */}
                                     <div className="bg-slate-800/30 rounded-lg p-2 border border-slate-700/50 flex items-center justify-center gap-2">
                                          <UserCircle className="w-4 h-4 text-emerald-400" />
                                          <span className="text-xs text-slate-300">Connesso come: <b>{clientName}</b></span>
                                     </div>

                                     {/* READ ONLY STATUS INDICATOR */}
                                     {sync.isReadOnly && (
                                         <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-lg p-2 flex items-center justify-center gap-2">
                                             <MessageSquare className="w-4 h-4 text-indigo-400" />
                                             <span className="text-xs font-bold text-indigo-300 uppercase">Modalità Solo Chat Attiva</span>
                                         </div>
                                     )}

                                     {/* DOWNLOAD SECTION (Only if tracks present) */}
                                     {songs.length > 0 && (
                                         <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                                              <p className="text-[10px] text-slate-500 mb-2 leading-tight">{t.download_info}</p>
                                              
                                              {isDownloading ? (
                                                  <div className="w-full">
                                                      <div className="flex justify-between text-[10px] text-emerald-400 font-bold uppercase mb-1">
                                                          <span>{downloadStatusText || t.download_progress}</span>
                                                          <span>{downloadProgress}%</span>
                                                      </div>
                                                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                                          <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
                                                      </div>
                                                  </div>
                                              ) : (
                                                  <button 
                                                    onClick={handleDownloadMedia}
                                                    className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-indigo-300 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border border-slate-600 hover:border-indigo-500 transition-colors"
                                                  >
                                                      <DownloadCloud className="w-4 h-4" /> {t.btn_download_media}
                                                  </button>
                                              )}
                                              {downloadStatusText && !isDownloading && <p className={`text-[10px] mt-2 font-bold ${errorDetails.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{downloadStatusText}</p>}
                                              
                                              {errorDetails.length > 0 && !isDownloading && (
                                                  <button 
                                                      onClick={() => setShowErrorDialog(true)}
                                                      className="mt-2 text-[10px] text-red-300 underline hover:text-white"
                                                  >
                                                      Visualizza Dettagli Errori ({errorDetails.length})
                                                  </button>
                                              )}
                                         </div>
                                     )}

                                     <div className="flex gap-2 w-full mt-2">
                                         <button onClick={sync.disconnectFromMaster} className="flex-1 py-3 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900 rounded-xl font-bold transition-all text-sm">
                                             {t.btn_disconnect}
                                         </button>
                                         <button onClick={onClose} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700 text-sm">
                                             {t.btn_close}
                                         </button>
                                     </div>
                                 </div>
                             ) : (
                                 <button onClick={() => sync.connectToMaster(inputIP, clientPin, clientName)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 text-sm mt-2">
                                     {sync.status === 'connecting' && <Loader2 className="w-4 h-4 animate-spin" />}
                                     {t.btn_connect}
                                 </button>
                             )}
                             
                             {sync.status === 'error' && (
                                 <p className="text-xs text-red-400 font-bold animate-pulse">
                                     {t.sync_error} / {t.status_disconnected}
                                 </p>
                             )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NetworkModal;