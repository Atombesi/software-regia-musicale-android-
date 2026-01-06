
import React, { useState, useEffect, useRef } from 'react';
import { Send, PhoneOff, MessageSquare, Move, Pin, PinOff, X, PhoneIncoming, PhoneCall } from 'lucide-react';
import { isAndroidPlatform } from '../../utils/platformUtils';

interface ChatModalProps {
    isOpen: boolean;
    messages: { text: string, sender?: string, isMe: boolean, time: number }[];
    onSendMessage: (text: string) => void;
    onEndCall: () => void;
    onCloseWindow?: () => void; // NEW PROP
    t: any;
    isPinned?: boolean;
    onTogglePin?: (val: boolean) => void;
    displayMode?: 'floating' | 'docked';
    connectedStatus?: 'idle' | 'calling' | 'ringing' | 'connected';
    onAnswerCall?: () => void;
}

const ChatModal: React.FC<ChatModalProps> = ({ 
    isOpen, messages, onSendMessage, onEndCall, onCloseWindow, t, 
    isPinned = false, onTogglePin, displayMode = 'floating', connectedStatus = 'connected', onAnswerCall 
}) => {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const isAndroid = isAndroidPlatform();

    // Draggable State
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    
    useEffect(() => {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    // DRAG HANDLERS
    const handleMouseDown = (e: React.MouseEvent) => {
        if (displayMode === 'docked' || isPinned) return;
        
        if (modalRef.current) {
            setIsDragging(true);
            const rect = modalRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);


    // TOUCH HANDLERS (Android)
    const handleTouchStart = (e: React.TouchEvent) => {
        if (displayMode === 'docked' || isPinned) return;

        if (modalRef.current) {
            setIsDragging(true);
            const rect = modalRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            });
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isDragging) {
            setPosition({
                x: e.touches[0].clientX - dragOffset.x,
                y: e.touches[0].clientY - dragOffset.y
            });
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
    };


    if (!isOpen) return null;

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (input.trim()) {
            onSendMessage(input);
            setInput("");
            
            // Close keyboard on Android by removing focus
            if (isAndroid && inputRef.current) {
                inputRef.current.blur();
            }
        }
    };

    const isFloating = displayMode === 'floating';

    // CSS Logic
    const floatingStyle: React.CSSProperties = position.x !== 0 || position.y !== 0 
        ? { left: position.x, top: position.y, bottom: 'auto', right: 'auto' } 
        : {}; 

    const containerClasses = isFloating 
        ? `fixed z-[200] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-5 duration-300 overflow-hidden
           ${isAndroid ? 'w-72 h-[350px]' : 'w-96 h-[450px] resize'}
           ${isDragging ? 'opacity-90 cursor-grabbing' : ''}
           ${isPinned ? 'border-emerald-500/50 shadow-emerald-900/20' : ''}`
        : `w-full h-full flex flex-col bg-slate-900/50 overflow-hidden`; 

    // --- OVERLAY LOGIC FOR RINGING/CALLING ---
    const showRingingOverlay = connectedStatus === 'ringing';
    const showCallingOverlay = connectedStatus === 'calling';
    const isOverlayActive = showRingingOverlay || showCallingOverlay;

    return (
        <div 
            ref={modalRef}
            style={isFloating ? floatingStyle : {}}
            className={containerClasses}
        >
            {/* HEADER */}
            <div 
                className={`p-2 flex items-center justify-between border-b shrink-0 select-none transition-colors
                    ${isFloating ? (isPinned ? 'bg-slate-800/80 border-emerald-500/30 cursor-default' : 'bg-slate-800 border-slate-700 cursor-grab active:cursor-grabbing') : 'bg-slate-900 border-slate-800 p-3'}`}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="flex flex-col pl-1">
                    <div className="flex items-center gap-2 text-white font-bold">
                        <MessageSquare className={`${isAndroid ? 'w-4 h-4' : 'w-5 h-5'} ${isPinned ? 'text-emerald-400' : 'text-slate-400'}`} />
                        <span className={isAndroid ? 'text-xs' : 'text-sm'}>{t.chat_title}</span>
                    </div>
                    {connectedStatus !== 'connected' && !isOverlayActive && (
                        <span className="text-[10px] text-red-400 font-bold uppercase ml-7">Disconnesso</span>
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    {!isAndroid && onTogglePin && (
                        <button
                            onClick={() => onTogglePin(!isPinned)}
                            className={`p-1.5 rounded-lg transition-colors border ${
                                isPinned 
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' 
                                : 'bg-slate-700/50 text-slate-500 hover:text-white border-transparent'
                            }`}
                            title={isPinned ? "Sgancia" : "Fissa"}
                            onMouseDown={(e) => e.stopPropagation()} 
                        >
                            {isPinned ? <Pin className="w-4 h-4 fill-current" /> : <PinOff className="w-4 h-4" />}
                        </button>
                    )}

                    {(!isPinned || connectedStatus === 'connected') && (
                        <div className="flex gap-2">
                            {/* HANGUP BUTTON */}
                            {connectedStatus === 'connected' && (
                                <button 
                                    onClick={onEndCall}
                                    className="p-1.5 bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white rounded-lg transition-colors border border-red-900 flex items-center justify-center"
                                    title={t.call_end}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <PhoneOff className={`${isAndroid ? 'w-3 h-3' : 'w-4 h-4'}`} />
                                </button>
                            )}
                            
                            {/* CLOSE WINDOW BUTTON */}
                            <button 
                                onClick={onCloseWindow || onEndCall} // Fallback to end call if prop missing
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-700 flex items-center justify-center"
                                title="Chiudi Finestra"
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                            >
                                <X className={`${isAndroid ? 'w-3 h-3' : 'w-4 h-4'}`} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* CONTENT AREA: CHAT or OVERLAY */}
            <div className={`flex-1 relative flex flex-col overflow-hidden bg-slate-900/90`}>
                
                {/* --- CALL OVERLAYS --- */}
                {showRingingOverlay && (
                    <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center gap-6 p-4 animate-in fade-in zoom-in">
                        <div className="p-6 bg-amber-500/20 rounded-full animate-pulse border-2 border-amber-500">
                            <PhoneIncoming className="w-12 h-12 text-amber-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-wider animate-pulse text-center">
                            {t.call_incoming}
                        </h3>
                        <div className="flex gap-6 w-full justify-center mt-4">
                            <button 
                                onClick={onEndCall}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className="p-4 bg-red-600 rounded-full shadow-lg group-hover:bg-red-500 transition-transform group-active:scale-95 border-4 border-slate-900 group-hover:border-red-900">
                                    <PhoneOff className="w-8 h-8 text-white" />
                                </div>
                                <span className="text-xs font-bold text-red-400 uppercase">Rifiuta</span>
                            </button>

                            <button 
                                onClick={onAnswerCall}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className="p-4 bg-emerald-600 rounded-full shadow-lg group-hover:bg-emerald-500 transition-transform group-active:scale-95 animate-bounce border-4 border-slate-900 group-hover:border-emerald-900">
                                    <PhoneIncoming className="w-8 h-8 text-white" />
                                </div>
                                <span className="text-xs font-bold text-emerald-400 uppercase">Rispondi</span>
                            </button>
                        </div>
                    </div>
                )}

                {showCallingOverlay && (
                    <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center gap-6 p-4 animate-in fade-in">
                        <div className="p-6 bg-emerald-500/20 rounded-full border-2 border-emerald-500">
                            <PhoneCall className="w-12 h-12 text-emerald-400 animate-pulse" />
                        </div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-wider text-center">
                            {t.call_calling}
                        </h3>
                        <button 
                            onClick={onEndCall}
                            className="mt-4 px-8 py-3 bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white rounded-full font-bold border border-red-800 transition-all flex items-center gap-2"
                        >
                            <PhoneOff className="w-5 h-5" />
                            {t.btn_cancel || "Annulla"}
                        </button>
                    </div>
                )}

                {/* --- INPUT AREA (MOVED TO TOP) --- */}
                {!isOverlayActive && (
                    <form onSubmit={handleSend} className="p-2 bg-slate-800 border-b border-slate-700 flex gap-2 shrink-0 shadow-lg z-10">
                        <input 
                            ref={inputRef}
                            type="text" 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t.chat_placeholder}
                            disabled={connectedStatus !== 'connected'}
                            className={`flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed ${isAndroid ? 'text-xs' : 'text-sm'}`}
                            autoFocus={isFloating} 
                            onMouseDown={(e) => e.stopPropagation()} 
                        />
                        <button 
                            type="submit"
                            disabled={!input.trim() || connectedStatus !== 'connected'}
                            className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <Send className={`${isAndroid ? 'w-4 h-4' : 'w-5 h-5'}`} />
                        </button>
                    </form>
                )}

                {/* --- CHAT HISTORY (Hidden if overlay active or disconnected) --- */}
                {!isOverlayActive && (
                    <div className={`flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar ${isAndroid ? 'text-xs' : 'text-sm'} ${connectedStatus !== 'connected' ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                        {messages.length === 0 && (
                            <div className="text-center text-slate-600 text-xs italic mt-8">
                                {connectedStatus === 'connected' ? `${t.status_connected}...` : "Nessun messaggio."}
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                                {/* INCOMING MESSAGES: Header with Time - Name */}
                                {!msg.isMe && msg.sender && (
                                    <div className="flex items-baseline gap-1 ml-2 mb-0.5 opacity-70">
                                        <span className="text-[9px] text-slate-500 font-mono">
                                            {new Date(msg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                        <span className="text-[9px] text-slate-600">-</span>
                                        <span className="text-[10px] text-slate-400 font-bold">{msg.sender}</span>
                                    </div>
                                )}
                                <div className={`max-w-[85%] rounded-xl px-3 py-1.5 shadow-md ${
                                    msg.isMe 
                                        ? 'bg-emerald-600 text-white rounded-tr-none' 
                                        : 'bg-slate-700 text-slate-200 rounded-tl-none'
                                }`}>
                                    {/* OUTGOING or NO SENDER: Time inline at start */}
                                    {(msg.isMe || !msg.sender) && (
                                        <span className={`text-[9px] font-mono mr-2 opacity-60 ${msg.isMe ? 'text-emerald-200' : 'text-slate-400'}`}>
                                            {new Date(msg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                    )}
                                    <span className="break-words">{msg.text}</span>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>
            
            {/* Resize Handle (Floating Only) */}
            {!isAndroid && isFloating && !isPinned && (
                <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 opacity-50 hover:opacity-100 pointer-events-none">
                    <div className="w-0 h-0 border-r-[6px] border-b-[6px] border-transparent border-r-slate-400 border-b-slate-400"></div>
                </div>
            )}
        </div>
    );
};

export default ChatModal;
