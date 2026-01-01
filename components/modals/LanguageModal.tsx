import React from 'react';
import { Globe, Check } from 'lucide-react';
import { Language } from '../../types';
import { translations } from '../../translations';

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

export default LanguageModal;