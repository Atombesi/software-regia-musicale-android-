import React, { useState, useEffect } from 'react';
import { StickyNote, Save } from 'lucide-react';

interface NoteModalProps {
    isOpen: boolean;
    initialValue: string;
    onSave: (val: string) => void;
    onClose: () => void;
    t: any;
}

const NoteModal: React.FC<NoteModalProps> = ({ isOpen, initialValue, onSave, onClose, t }) => {
    const [val, setVal] = useState(initialValue);
    
    useEffect(() => {
        if(isOpen) setVal(initialValue || "");
    }, [isOpen, initialValue]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full p-6 transform scale-100">
                <div className="flex items-center gap-3 mb-4 text-amber-400">
                    <StickyNote className="w-8 h-8" />
                    <h3 className="text-2xl font-bold text-white">{t.director_note}</h3>
                </div>
                
                <textarea 
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    className="w-full h-40 bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-lg resize-none focus:outline-none focus:border-amber-500 placeholder-slate-600 mb-6"
                    placeholder={t.no_note_placeholder}
                    autoFocus
                />

                <div className="flex gap-3 justify-end">
                    <button onClick={onClose} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700">{t.btn_cancel}</button>
                    <button 
                        onClick={() => { onSave(val); onClose(); }} 
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-lg flex items-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        {t.btn_save}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NoteModal;