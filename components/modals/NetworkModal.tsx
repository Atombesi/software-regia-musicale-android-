import React, { useState, useEffect } from 'react';
import { Wifi, Server, Smartphone, Monitor, CheckCircle2, XCircle, Loader2, Network, X, History, DownloadCloud, Lock, UserCircle } from 'lucide-react';
import { RemoteSyncHook } from '../../hooks/useRemoteSync';
import { isAndroidPlatform, extractFileName } from '../../utils/platformUtils';
import { Song, SfxItem } from '../../types';
import { checkLocalAsset, saveDownloadedAsset, ASSETS_FOLDER } from '../../utils/androidFileUtils';
import { writeTextFile } from '../../utils/filesystemUtils';
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
    onAssetsUpdated?: () => void;
    
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
        
        const allItems = [...songs, ...sfx.filter(s => s && s.url)];
        // Add 1 step for playlist file if available
        const total = allItems.length + (masterFilePath ? 1 : 0);
        
        if (total === 0) {
            setDownloadStatusText("Nessun file da scaricare.");
            setIsDownloading(false);
            return;
        }

        let completed = 0;
        const errors: string[] = [];

        // 1. DOWNLOAD PLAYLIST FILE (.txt)
        if (masterFilePath) {
            const playlistName = extractFileName(masterFilePath);
            setDownloadStatusText(`Scaricamento Playlist: ${playlistName}`);
            try {
                const masterUrl = `http://${sync.connectedIP}:8081/stream?path=${encodeURIComponent(masterFilePath)}`;
                const response = await fetch(masterUrl);
                if (!response.ok) throw new Error("Server response " + response.status);
                
                const textContent = await response.text();
                
                // === MODIFIED: SAVE TO ASSETS FOLDER ===
                await writeTextFile(`${ASSETS_FOLDER}/${playlistName}`, playlistName, textContent, Directory.External);
                
            } catch (e: any) {
                console.error(`Error downloading playlist ${playlistName}`, e);
                errors.push(playlistName);
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
                // 1. Check if exists locally
                const exists = await checkLocalAsset(fileName);
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

                    // 3. Save to Assets
                    await saveDownloadedAsset(fileName, base64);
                }
            } catch (e: any) {
                console.error(`Error downloading ${fileName}`, e);
                errors.push(fileName);
            }

            completed++;
            setDownloadProgress(Math.round((completed / total) * 100));
        }

        setIsDownloading(false);
        if (errors.length > 0) {
             setDownloadStatusText(`${t.download_error}: ${errors.length} files failed.`);
        } else {
             setDownloadStatusText(t.download_complete);
             // Trigger App refresh
             if (onAssetsUpdated) onAssetsUpdated();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[190] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-md w-full flex flex-col overflow-hidden max-h-[90vh]">
                
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
                                    <div className="text-xs text-slate-400">
                                        Indirizzi IP rilevati (connetti il Tablet a uno di questi):
                                    </div>
                                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                                        {sync.serverIPs.map((ipObj, idx) => (
                                            <div key={idx} className="bg-slate-800 rounded-lg p-2 border border-slate-700 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Network className="w-3 h-3 text-slate-500" />
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{ipObj.name}</span>
                                                </div>
                                                <div className="text-sm font-mono font-bold text-emerald-400 tracking-wide select-all">
                                                    {ipObj.address}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="mt-1 pt-2 border-t border-slate-700 flex justify-between items-center">
                                        <span className="text-xs text-slate-300">{t.clients_connected}</span>
                                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-bold">{sync.clientCount}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-16 bg-slate-800/30 rounded-xl border border-dashed border-slate-700 flex items-center justify-center">
                                    <span className="text-slate-600 font-bold uppercase text-xs">Server Offline</span>
                                </div>
                            )}

                            {sync.status === 'connected' && sync.role === 'master' ? (
                                <button onClick={sync.stopServer} className="w-full py-2.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900 rounded-xl font-bold transition-all text-sm">
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
                                              {downloadStatusText && !isDownloading && <p className="text-[10px] text-emerald-400 mt-2 font-bold">{downloadStatusText}</p>}
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