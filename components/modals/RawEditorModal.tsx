import React, { useState, useEffect } from 'react';
import { FileSignature, Save, FileText } from 'lucide-react';

interface RawEditorModalProps {
    isOpen: boolean;
    initialContent: string;
    onSave: (content: string) => void;
    onClose: () => void;
    t: any;
    readOnly?: boolean; // NEW
    title?: string; // NEW
}

const RawEditorModal: React.FC<RawEditorModalProps> = ({ isOpen, initialContent, onSave, onClose, t, readOnly = false, title }) => {
    const [content, setContent] = useState(initialContent);

    useEffect(() => {
        if(isOpen) setContent(initialContent);
    }, [isOpen, initialContent]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[135] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col p-6">
                <div className="flex items-center gap-3 mb-4 text-indigo-400 shrink-0">
                    {readOnly ? <FileText className="w-8 h-8" /> : <FileSignature className="w-8 h-8" />}
                    <h3 className="text-2xl font-bold text-white">{title || "Editor Testuale Playlist"}</h3>
                </div>
                
                <div className="flex-1 min-h-0 mb-6 bg-black/50 rounded-xl border border-slate-800 p-4">
                    <textarea 
                        value={content}
                        onChange={e => !readOnly && setContent(e.target.value)}
                        readOnly={readOnly}
                        className={`w-full h-full bg-transparent font-mono resize-none focus:outline-none custom-scrollbar leading-relaxed 
                            ${readOnly ? 'text-white text-xs cursor-default' : 'text-slate-300 text-sm'}`}
                        spellCheck={false}
                    />
                </div>

                <div className="flex gap-3 justify-end shrink-0">
                    <button onClick={onClose} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700">{t.btn_close || "Chiudi"}</button>
                    {!readOnly && (
                        <button 
                            onClick={() => onSave(content)} 
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-lg flex items-center gap-2"
                        >
                            <Save className="w-5 h-5" />
                            {t.btn_apply || "Applica"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RawEditorModal;