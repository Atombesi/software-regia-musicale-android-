import React, { useState } from 'react';
import { Globe, Settings, Check, X, Bell, Wifi, Clock, MessageSquare, Lock, User, Shield } from 'lucide-react';
import { Language } from '../../types';
import { translations } from '../../translations';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentLang: Language;
    onSelectLang: (lang: Language) => void;
    // Settings
    enableNetwork: boolean;
    onToggleNetwork: (val: boolean) => void;
    enableBeep: boolean;
    onToggleBeep: (val: boolean) => void;
    callTimeout: number;
    onChangeTimeout: (val: number) => void;
    // NEW SECURITY PROPS
    serverPin?: string;
    onChangeServerPin?: (val: string) => void;
    clientName?: string;
    onChangeClientName?: (val: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, currentLang, onSelectLang,
    enableNetwork, onToggleNetwork,
    enableBeep, onToggleBeep,
    callTimeout, onChangeTimeout,
    serverPin = "", onChangeServerPin,
    clientName = "", onChangeClientName
}) => {
    const [activeTab, setActiveTab] = useState<'lang' | 'opts'>('opts');
    const t = translations[currentLang];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[180] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-white font-bold">
                        <Settings className="w-5 h-5 text-indigo-400" />
                        {t.settings_title}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-700 bg-slate-900 shrink-0">
                    <button 
                        onClick={() => setActiveTab('opts')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'opts' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Settings className="w-4 h-4" /> {t.tab_options}
                    </button>
                    <button 
                        onClick={() => setActiveTab('lang')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'lang' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Globe className="w-4 h-4" /> {t.tab_language}
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto bg-slate-900/50 custom-scrollbar">
                    
                    {/* OPTIONS TAB */}
                    {activeTab === 'opts' && (
                        <div className="flex flex-col gap-6">
                            
                            {/* 1. Network Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${enableNetwork ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                                        <Wifi className="w-5 h-5" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-300">{t.opt_network_mode}</span>
                                </div>
                                <button 
                                    onClick={() => onToggleNetwork(!enableNetwork)}
                                    className={`w-12 h-6 rounded-full relative transition-colors ${enableNetwork ? 'bg-emerald-600' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${enableNetwork ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>

                            {/* --- SECURITY SECTION (Only if Network is Enabled) --- */}
                            {enableNetwork && (
                                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 flex flex-col gap-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Shield className="w-4 h-4 text-emerald-400" />
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Sicurezza & Identità</span>
                                    </div>

                                    {/* SERVER PIN */}
                                    <div>
                                        <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block pl-1">{t.opt_server_pin}</label>
                                        <div className="relative">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                                <Lock className="w-4 h-4" />
                                            </div>
                                            <input 
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                autoComplete="off"
                                                value={serverPin}
                                                onChange={(e) => onChangeServerPin && onChangeServerPin(e.target.value)}
                                                placeholder="ex. 1234"
                                                className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-10 pr-3 py-2 text-sm text-white font-mono tracking-widest focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* CLIENT NAME */}
                                    <div>
                                        <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block pl-1">{t.opt_device_name}</label>
                                        <div className="relative">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <input 
                                                type="text"
                                                value={clientName}
                                                onChange={(e) => onChangeClientName && onChangeClientName(e.target.value)}
                                                placeholder="Tablet Palco..."
                                                className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-10 pr-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <hr className="border-slate-800" />

                            {/* 2. Beep Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${enableBeep ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                                        <Bell className="w-5 h-5" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-300">{t.opt_call_beep}</span>
                                </div>
                                <button 
                                    onClick={() => onToggleBeep(!enableBeep)}
                                    className={`w-12 h-6 rounded-full relative transition-colors ${enableBeep ? 'bg-amber-600' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${enableBeep ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>

                             {/* 3. Timeout */}
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-slate-800 text-indigo-400">
                                        <Clock className="w-5 h-5" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-300">{t.opt_call_timeout}</span>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-800 rounded-lg border border-slate-700 p-1">
                                    <button onClick={() => onChangeTimeout(Math.max(5, callTimeout - 5))} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white">-</button>
                                    <span className="w-6 text-center text-sm font-mono text-white">{callTimeout}</span>
                                    <button onClick={() => onChangeTimeout(Math.min(60, callTimeout + 5))} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white">+</button>
                                </div>
                            </div>

                            <div className="text-[10px] text-slate-600 text-center mt-4">
                                {t.app_name} - Configurazione salvata localmente
                            </div>
                        </div>
                    )}

                    {/* LANGUAGE TAB */}
                    {activeTab === 'lang' && (
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={() => onSelectLang('it')}
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
                                onClick={() => onSelectLang('en')}
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
                    )}
                </div>

                <div className="p-4 bg-slate-800 border-t border-slate-700 shrink-0">
                    <button onClick={onClose} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg">
                        {t.btn_close || "Chiudi"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;