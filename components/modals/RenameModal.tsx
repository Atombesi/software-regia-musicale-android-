import React, { useState, useEffect, useRef } from 'react';
import { Edit3, Save } from 'lucide-react';

interface RenameModalProps {
    isOpen: boolean;
    initialValue: string;
    onSave: (val: string) => void;
    onClose: () => void;
    t: any;
}

const RenameModal: React.FC<RenameModalProps> = ({ isOpen, initialValue, onSave, onClose, t }) => {
    const [val, setVal] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setVal(initialValue || "");
            // Focus e selezione automatica del testo
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.select();
                }
            }, 100);
        }
    }, [isOpen, initialValue]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSave(val);
            onClose();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
                <div className="flex items-center gap-3 mb-4 text-emerald-400">
                    <Edit3 className="w-6 h-6" />
                    <h3 className="text-xl font-bold text-white">Rinomina Traccia</h3>
                </div>
                
                <div className="mb-6">
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Nuovo Titolo</label>
                    <input 
                        ref={inputRef}
                        type="text"
                        value={val}
                        onChange={e => setVal(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-slate-800 border-2 border-slate-600 focus:border-emerald-500 rounded-xl p-3 text-white text-lg font-bold outline-none transition-colors"
                        placeholder="Titolo brano..."
                    />
                </div>

                <div className="flex gap-3 justify-end">
                    <button onClick={onClose} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700">
                        {t.btn_cancel}
                    </button>
                    <button 
                        onClick={() => { onSave(val); onClose(); }} 
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-lg flex items-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        {t.btn_confirm}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RenameModal;