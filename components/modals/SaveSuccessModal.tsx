import React from 'react';
import { Check } from 'lucide-react';

interface SaveSuccessModalProps {
    isOpen: boolean;
    fileName: string;
    location: string;
    onClose: () => void;
    title: string;
    msgFileUpdated: string;
}

const SaveSuccessModal: React.FC<SaveSuccessModalProps> = ({ isOpen, fileName, location, onClose, title, msgFileUpdated }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.2)] max-w-sm w-full p-8 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-emerald-500/50">
                    <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">{title}</h3>
                <div className="bg-slate-800/50 rounded-xl p-4 w-full mb-6 border border-slate-700">
                    <div className="mb-3">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">{msgFileUpdated}</span>
                        <span className="text-emerald-400 font-mono text-sm font-bold break-all">{fileName}</span>
                    </div>
                </div>
                <button onClick={onClose} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg active:scale-95">OK</button>
            </div>
        </div>
    );
};

export default SaveSuccessModal;