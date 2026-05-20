import { useState, useEffect, useCallback, useRef } from 'react';
import { Song, SfxItem } from '../types';
import { isAndroidPlatform } from '../utils/platformUtils';

export type SyncRole = 'master' | 'slave' | 'none';
export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectedClient {
    id: string;
    name: string;
    ip: string;
    locked?: boolean; // Legacy
    permissionMode?: 'full' | 'chat' | 'pad'; // NEW Local state tracking for Master UI
}

export interface RemoteSyncHook {
    role: SyncRole;
    status: SyncStatus;
    serverIPs: {name: string, address: string}[]; 
    connectedIP: string | null; 
    
    clients: ConnectedClient[]; // NEW: Full client list
    clientCount: number;
    
    // SLAVE STATE
    myClientId: string | null;
    isReadOnly: boolean;
    clientPermissionMode: 'full' | 'chat' | 'pad';

    startServer: (pin?: string) => Promise<void>;
    stopServer: () => Promise<void>;
    connectToMaster: (ip: string, pin?: string, deviceName?: string) => void;
    disconnectFromMaster: () => void;
    
    kickClient: (clientId: string) => Promise<void>; // NEW
    setClientPermission: (clientId: string, mode: 'full' | 'chat' | 'pad') => void; // UPDATED

    sendMasterCommand: (cmd: any) => void;
    broadcastCommand: (cmd: any) => void; // NEW
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
    
    // MASTER STATE
    const [clients, setClients] = useState<ConnectedClient[]>([]);

    // SLAVE STATE
    const [myClientId, setMyClientId] = useState<string | null>(null);
    
    // FIX: Default to FALSE (Full Permissions) so Standalone mode works.
    // It only becomes TRUE when connecting as a Slave.
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [clientPermissionMode, setClientPermissionMode] = useState<'full'|'chat'|'pad'>('full');

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
                setIsReadOnly(false); // Master is always FULL CONTROL
                
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

                window.electronAPI.server.onClientStatus((clientList: any[]) => {
                    // Merging logic to preserve 'locked' state if React has newer state,
                    // BUT priority goes to the server list if it provides the locked state.
                    setClients(prev => {
                        return clientList.map(newItem => {
                            // Check if server sent locked state (it should now)
                            if (newItem.locked !== undefined) {
                                return newItem;
                            }
                            // Fallback (shouldn't happen with new server logic)
                            const existing = prev.find(p => p.id === newItem.id);
                            return {
                                ...newItem,
                                locked: existing ? existing.locked : true // Default true for new clients
                            };
                        });
                    });
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
        setClients([]);
        setIsReadOnly(false); // Ensure full control when server stops
    }, []);

    const kickClient = useCallback(async (clientId: string) => {
        if (role === 'master' && window.electronAPI?.server) {
             await window.electronAPI.server.kick(clientId);
        }
    }, [role]);

    const setClientPermission = useCallback((clientId: string, mode: 'full' | 'chat' | 'pad') => {
        if (role === 'master' && window.electronAPI?.server) {
            // 1. Broadcast command to all (client checks ID)
            // Server also intercepts this to update its RAM state
            window.electronAPI.server.send({ 
                type: 'SET_PERMISSION', 
                targetId: clientId, 
                locked: mode !== 'full', // Legacy support
                permissionMode: mode
            });

            // 2. Update local state immediately for UI responsiveness
            setClients(prev => prev.map(c => c.id === clientId ? { ...c, locked: mode !== 'full', permissionMode: mode } : c));
        }
    }, [role]);

    const broadcastCommand = useCallback((cmd: any) => {
        if (role === 'master' && window.electronAPI?.server) {
            window.electronAPI.server.send(cmd);
        }
    }, [role]);

    const broadcastState = useCallback((state: any) => {
        if (role === 'master' && window.electronAPI?.server) {
            try {
                window.electronAPI.server.send({ type: 'SYNC_STATE', payload: state });
            } catch (e) {
                console.error("Failed to broadcast state:", e);
            }
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
            // FIX: When connecting as slave, DEFAULT to Locked (Solo Chat) until verified.
            setIsReadOnly(true); 
            
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
                        console.log("[Slave] Handshake Success. ID:", data.clientId);
                        setRole('slave');
                        setStatus('connected');
                        setConnectedIP(cleanIp);
                        setMyClientId(data.clientId || null);
                        
                        // APPLY INITIAL PERMISSION FROM SERVER
                        // Server defaults to True (Locked) for new clients, but sends it explicitly.
                        if (data.locked !== undefined) {
                            setIsReadOnly(data.locked);
                            setClientPermissionMode(data.permissionMode || (data.locked ? 'chat' : 'full'));
                            console.log(`[Slave] Initial Permission: ReadOnly = ${data.locked}, Mode = ${data.permissionMode}`);
                        }
                        
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
                        setIsReadOnly(false); // Revert to standalone mode
                        return;
                    }

                    // --- PERMISSION COMMAND ---
                    if (data.type === 'SET_PERMISSION') {
                        // Ensure we target this client
                        if (data.targetId === myClientId || !myClientId) { // fallback if myClientId not set yet
                             // Update local state based on command
                             setIsReadOnly(data.locked);
                             setClientPermissionMode(data.permissionMode || (data.locked ? 'chat' : 'full'));
                             console.log(`[Slave] Permission Updated: ReadOnly = ${data.locked}, Mode = ${data.permissionMode}`);
                        }
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
                    } else if (data.type && data.type !== 'HANDSHAKE_OK' && data.type !== 'HANDSHAKE_FAIL' && data.type !== 'SET_PERMISSION') {
                        if (onCommandReceivedRef.current) {
                             onCommandReceivedRef.current(data);
                        }
                    }
                } catch (e) {}
            };

            ws.onerror = (e) => {
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                console.error("[Slave] WebSocket Error:", e);
                setStatus('error');
            };

            ws.onclose = (e) => {
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
                console.log(`[Slave] Disconnected (Code: ${e.code})`);
                setStatus('disconnected');
                setRole('none');
                setConnectedIP(null);
                setMyClientId(null);
                // FIX: Revert to Full Control when disconnected (Standalone Mode)
                setIsReadOnly(false);
            };

            wsRef.current = ws;

        } catch (e: any) {
            console.error("WS Init Error", e);
            if(isAndroidPlatform()) alert("Errore Inizializzazione: " + e.message);
            setStatus('error');
            setIsReadOnly(false); // Revert on error
        }
    }, [status, myClientId]); // dependency on myClientId ensures listener has correct ID

    const disconnectFromMaster = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        setRole('none');
        setStatus('disconnected');
        setConnectedIP(null);
        setMyClientId(null);
        // FIX: Revert to Full Control (Standalone Mode)
        setIsReadOnly(false);
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
        
        clients,
        clientCount: clients.length,
        
        myClientId,
        isReadOnly,
        clientPermissionMode,

        startServer,
        stopServer,
        connectToMaster,
        disconnectFromMaster,
        
        kickClient,
        setClientPermission,

        sendMasterCommand,
        broadcastCommand,
        broadcastState,
        sendPlaylist,
        sendChatCommand
    };
};