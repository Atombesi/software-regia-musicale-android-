import { useState, useEffect, useCallback, useRef } from 'react';
import { Song, SfxItem } from '../types';
import { isAndroidPlatform } from '../utils/platformUtils';

export type SyncRole = 'master' | 'slave' | 'none';
export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RemoteSyncHook {
    role: SyncRole;
    status: SyncStatus;
    serverIPs: {name: string, address: string}[]; 
    connectedIP: string | null; 
    clientCount: number;
    startServer: (pin?: string) => Promise<void>;
    stopServer: () => Promise<void>;
    connectToMaster: (ip: string, pin?: string, deviceName?: string) => void;
    disconnectFromMaster: () => void;
    sendMasterCommand: (cmd: any) => void;
    broadcastState: (state: any) => void;
    sendPlaylist: (songs: Song[], sfx: SfxItem[], masterPath?: string) => void; 
    sendChatCommand: (type: 'CALL_REQ' | 'CALL_ACC' | 'CALL_END' | 'CHAT_MSG', payload?: any) => void;
}

export const useRemoteSync = (
    onCommandReceived: (cmd: any) => void,
    onPlaylistReceived: (songs: Song[], sfx: SfxItem[], masterPath?: string) => void, 
    onStateReceived: (state: any) => void,
    onChatReceived: (type: string, payload?: any, sender?: string) => void 
): RemoteSyncHook => {
    const [role, setRole] = useState<SyncRole>('none');
    const [status, setStatus] = useState<SyncStatus>('disconnected');
    const [serverIPs, setServerIPs] = useState<{name: string, address: string}[]>([]);
    const [connectedIP, setConnectedIP] = useState<string | null>(null);
    const [clientCount, setClientCount] = useState(0);
    
    const wsRef = useRef<WebSocket | null>(null);
    const connectionTimeoutRef = useRef<any>(null);
    const heartbeatIntervalRef = useRef<any>(null);

    // --- REFS FOR CALLBACKS (Prevents Stale Closures) ---
    const onCommandReceivedRef = useRef(onCommandReceived);
    const onPlaylistReceivedRef = useRef(onPlaylistReceived);
    const onStateReceivedRef = useRef(onStateReceived);
    const onChatReceivedRef = useRef(onChatReceived);

    useEffect(() => { onCommandReceivedRef.current = onCommandReceived; }, [onCommandReceived]);
    useEffect(() => { onPlaylistReceivedRef.current = onPlaylistReceived; }, [onPlaylistReceived]);
    useEffect(() => { onStateReceivedRef.current = onStateReceived; }, [onStateReceived]);
    useEffect(() => { onChatReceivedRef.current = onChatReceived; }, [onChatReceived]);


    // --- MASTER LOGIC (Electron) ---
    const startServer = useCallback(async (pin?: string) => {
        if (!window.electronAPI?.server) return;
        try {
            // Pass PIN to server (empty string = no pin)
            const res = await window.electronAPI.server.start(pin || "");
            if (res) {
                setRole('master');
                setStatus('connected');
                setServerIPs(res.ips);
                
                // Listener uses Ref to always get fresh logic
                window.electronAPI.server.onClientMessage((data: any) => {
                    // SEPARATE CHAT COMMANDS
                    if (data.type && data.type.startsWith('CHAT_')) {
                        if (onChatReceivedRef.current) {
                            // Data payload might have senderName injected by Main process
                            onChatReceivedRef.current(data.type, data.payload, data.senderName);
                        }
                    } else if (onCommandReceivedRef.current) {
                        onCommandReceivedRef.current(data);
                    }
                });

                window.electronAPI.server.onClientStatus((count: number) => {
                    setClientCount(count);
                });
            }
        } catch (e) {
            console.error("Failed to start server", e);
            setStatus('error');
        }
    }, []); 

    const stopServer = useCallback(async () => {
        if (!window.electronAPI?.server) return;
        await window.electronAPI.server.stop();
        setRole('none');
        setStatus('disconnected');
        setServerIPs([]);
        setClientCount(0);
    }, []);

    const broadcastState = useCallback((state: any) => {
        if (role === 'master' && window.electronAPI?.server) {
            window.electronAPI.server.send({ type: 'SYNC_STATE', payload: state });
        }
    }, [role]);

    const sendPlaylist = useCallback((songs: Song[], sfx: SfxItem[], masterPath?: string) => {
        if (role === 'master' && window.electronAPI?.server) {
            window.electronAPI.server.send({ type: 'SYNC_PLAYLIST', songs, sfx, masterPath });
        }
    }, [role]);

    // NEW: Generic send for Chat/Call
    const sendChatCommand = useCallback((type: string, payload?: any) => {
        const msg = { type: `CHAT_${type}`, payload, senderName: "Regia" }; // Master is always "Regia"
        if (role === 'master' && window.electronAPI?.server) {
            // Master broadcasts to Slave
            window.electronAPI.server.send(msg);
        } else if (role === 'slave' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // Slave sends to Master (Name is injected in Handshake/or payload)
            // Note: Slave name was sent in Handshake, Main process injects it into 'senderName' before passing to Renderer
            wsRef.current.send(JSON.stringify(msg));
        }
    }, [role]);


    // --- SLAVE LOGIC (WebSocket) ---
    const connectToMaster = useCallback((ip: string, pin?: string, deviceName?: string) => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

        if (!ip) {
            if(isAndroidPlatform()) alert("Inserisci un IP valido");
            setStatus('error');
            return;
        }

        try {
            setStatus('connecting');
            
            const cleanIp = ip.trim();
            const wsUrl = `ws://${cleanIp}:8080`;
            console.log("[Slave] Attempting connection to:", wsUrl);

            const ws = new WebSocket(wsUrl);
            
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.error("[Slave] Connection timed out");
                    if(isAndroidPlatform()) alert(`Timeout connessione verso ${cleanIp}. Verifica firewall PC e IP.`);
                    ws.close();
                    setStatus('error');
                }
            }, 5000); 

            ws.onopen = () => {
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                console.log("[Slave] Socket Open, sending Handshake...");
                
                // SEND HANDSHAKE WITH PIN AND NAME
                ws.send(JSON.stringify({ 
                    type: 'HANDSHAKE', 
                    device: deviceName || 'Tablet Remoto',
                    pin: pin || "" 
                }));

                // Wait for Handshake response logic inside onmessage...
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // --- HANDSHAKE RESPONSE ---
                    if (data.type === 'HANDSHAKE_OK') {
                        console.log("[Slave] Handshake Success");
                        setRole('slave');
                        setStatus('connected');
                        setConnectedIP(cleanIp);
                        
                        // Start Heartbeat only after auth
                        heartbeatIntervalRef.current = setInterval(() => {
                            if (ws.readyState !== WebSocket.OPEN) {
                                console.warn("[Slave] Heartbeat failed - Socket not open");
                                ws.close();
                            }
                        }, 3000);
                        return;
                    } 
                    
                    if (data.type === 'HANDSHAKE_FAIL') {
                        console.error("[Slave] Handshake Failed (Wrong PIN)");
                        alert("PIN Errato! Connessione rifiutata.");
                        ws.close();
                        setStatus('error'); // Will show red status
                        setRole('none');
                        return;
                    }

                    // --- NORMAL MESSAGES ---
                    if (data.type === 'SYNC_PLAYLIST') {
                        if (onPlaylistReceivedRef.current) {
                            onPlaylistReceivedRef.current(data.songs, data.sfx, data.masterPath);
                        }
                    } else if (data.type === 'SYNC_STATE') {
                        if (onStateReceivedRef.current) {
                            onStateReceivedRef.current(data.payload);
                        }
                    } else if (data.type && data.type.startsWith('CHAT_')) {
                        if (onChatReceivedRef.current) {
                            onChatReceivedRef.current(data.type, data.payload, data.senderName);
                        }
                    }
                } catch (e) {}
            };

            ws.onerror = (e) => {
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                console.error("[Slave] WebSocket Error:", e);
                // Don't alert if we just failed handshake (already alerted)
                if (status !== 'error') {
                   // Generic error
                }
                setStatus('error');
            };

            ws.onclose = (e) => {
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
                console.log(`[Slave] Disconnected (Code: ${e.code})`);
                setStatus('disconnected');
                setRole('none');
                setConnectedIP(null);
            };

            wsRef.current = ws;

        } catch (e: any) {
            console.error("WS Init Error", e);
            if(isAndroidPlatform()) alert("Errore Inizializzazione: " + e.message);
            setStatus('error');
        }
    }, [status]); 

    const disconnectFromMaster = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        setRole('none');
        setStatus('disconnected');
        setConnectedIP(null);
    }, []);

    const sendMasterCommand = useCallback((cmd: any) => {
        if (role === 'slave' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(cmd));
        } else if (role === 'slave') {
            console.warn("[Slave] Cannot send command: Socket not open");
            setStatus('disconnected'); 
            if(isAndroidPlatform()) alert("Connessione persa. Riconnettiti.");
        }
    }, [role]);

    useEffect(() => {
        return () => {
            if (wsRef.current) wsRef.current.close();
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        };
    }, []);

    return {
        role,
        status,
        serverIPs,
        connectedIP,
        clientCount,
        startServer,
        stopServer,
        connectToMaster,
        disconnectFromMaster,
        sendMasterCommand,
        broadcastState,
        sendPlaylist,
        sendChatCommand // EXPORTED
    };
};