import React from 'react';
import { Clapperboard, User } from 'lucide-react';

interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    t: any;
    appVersion: string; // NEW PROP
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, t, appVersion }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[160] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full h-[90vh] flex flex-col relative overflow-hidden">
                {/* Background Decor */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                
                {/* Top Section: Header + Author - Fixed */}
                <div className="p-8 pb-4 shrink-0 relative z-10">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-6 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 overflow-hidden relative shrink-0">
                                <Clapperboard className="w-6 h-6 text-emerald-400 absolute z-0" />
                                <img 
                                    src="./icon.png" 
                                    className="w-full h-full object-cover relative z-10" 
                                    alt="Icon"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                                />
                            </div>
                            <h2 className="text-3xl font-black text-white tracking-tight">Regia Musiche Attozero</h2>
                        </div>
                        
                        <div className="mt-2 text-right">
                            <span className="text-emerald-400 font-mono font-bold text-sm">{appVersion}</span>
                        </div>
                    </div>

                    {/* Author Section */}
                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="w-32 h-32 md:w-40 md:h-40 shrink-0 rounded-2xl bg-slate-800 border-2 border-slate-700 overflow-hidden shadow-xl flex items-center justify-center relative">
                            <User className="w-20 h-20 text-slate-600 absolute z-0" />
                            <img 
                                src="./foto_andrea.jpg" 
                                className="w-full h-full object-cover relative z-10" 
                                alt="Andrea Tombesi"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                            />
                        </div>

                        <div className="flex-1 flex flex-col justify-center">
                            <div className="grid grid-cols-[100px_1fr] gap-y-4 text-sm items-center">
                                <div className="text-slate-500 font-bold uppercase tracking-wider text-right pr-4">Author</div>
                                <div className="text-lg font-bold text-white">Andrea Tombesi</div>

                                <div className="text-slate-500 font-bold uppercase tracking-wider text-right pr-4">E-mail</div>
                                <div className="text-base text-emerald-400 font-mono select-all">Brz.modena@gmail.com</div>

                                <div className="text-slate-500 font-bold uppercase tracking-wider text-right pr-4">Web Page</div>
                                <div className="truncate">
                                    <a href="https://andreatombesi.wordpress.com" target="_blank" rel="noopener noreferrer" className="text-base text-indigo-400 hover:text-indigo-300 underline font-mono">
                                        andreatombesi.wordpress.com
                                    </a>
                                </div>

                                <div className="text-slate-500 font-bold uppercase tracking-wider text-right pr-4">Country</div>
                                <div className="text-base text-slate-300">Modena - Italy</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Section: License Title + Box + Button */}
                <div className="flex-1 min-h-0 flex flex-col px-8 pb-8 relative z-10">
                    <strong className="block text-white mb-2 uppercase tracking-wider text-sm shrink-0 pl-1">{t.license_title}</strong>
                    
                    <div className="flex-1 min-h-0 flex gap-4">
                         {/* Text Box (Narrower, Scrollable) */}
                         <div className="flex-1 bg-slate-900/50 rounded-xl p-4 border border-slate-800 text-[11px] text-slate-300 leading-tight shadow-inner overflow-y-auto custom-scrollbar">
                              <p className="mb-2">
                                  <strong>{t.license_freeware_title}</strong> {t.license_freeware_text}
                              </p>
                              <p className="mb-2">
                                  <strong>{t.license_asis_title}</strong> {t.license_asis_text}
                              </p>
                              <p className="mb-4">
                                  {t.license_liability_text}
                              </p>
                              <p className="text-amber-500/90 font-bold border border-amber-500/30 p-2 rounded bg-amber-500/10 mb-4">
                                  {t.license_warning_text}
                              </p>
                              
                              <div className="w-full h-px bg-slate-700/50 my-4" />

                              <strong className="block text-slate-400 mb-2 uppercase text-xs">{t.credits_opensource}</strong>
                              <div className="text-slate-400">
                                  <p className="mb-2">{t.credits_libs}</p>
                                  <ul className="list-disc pl-4 space-y-1">
                                      <li>React, Capacitor, Wavesurfer.js, Lucide React, Tailwind CSS, Vite.</li>
                                  </ul>
                              </div>
                         </div>

                         {/* Close Button Container - Aligned Bottom Right */}
                         <div className="flex flex-col justify-end shrink-0">
                             <button onClick={onClose} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors border border-slate-700 hover:border-slate-500 shadow-lg whitespace-nowrap">
                                 {t.btn_close}
                             </button>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default InfoModal;