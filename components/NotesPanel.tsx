import React, { useEffect, useState } from 'react';
import { StickyNote, Save } from 'lucide-react';
import { Song, SfxItem } from '../types';

interface NotesPanelProps {
    targetItem: Song | SfxItem | null;
    isSfx: boolean;
    onUpdateNote: (note: string) => void;
    readOnly: boolean;
    onClose: () => void;
}

const NotesPanel: React.FC<NotesPanelProps> = ({ targetItem, isSfx, onUpdateNote, readOnly, onClose }) => {
    // Local state to handle typing without aggressive re-renders, 
    // though we sync on blur or periodically if needed.
    const [text, setText] = useState("");

    useEffect(() => {
        if (targetItem) {
            // SFX don't have notes in standard type, but assuming potential future support or Song target
            if (!isSfx) {
                setText((targetItem as Song).note || "");
            } else {
                setText(""); // SFX currently don't have notes in data structure
            }
        } else {
            setText("");
        }
    }, [targetItem, isSfx]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        if (!readOnly) {
            onUpdateNote(e.target.value);
        }
    };

    if (!targetItem || isSfx) {
        return (
            <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
                <div className="p-3 bg-slate-800 flex items-center gap-2 text-slate-500 border-b border-slate-700">
                    <StickyNote className="w-5 h-5" />
                    <span className="font-bold text-xs uppercase">Note di Regia</span>
                </div>
                <div className="flex-1 flex items-center justify-center text-slate-600 text-sm italic p-6 text-center">
                    Seleziona una traccia audio per visualizzare o modificare le note.
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 shadow-xl">
            {/* Header */}
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-amber-400">
                    <StickyNote className="w-5 h-5" />
                    <span className="font-bold text-xs uppercase tracking-wider">Note: {(targetItem as Song).title}</span>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    title="Chiudi pannello note"
                >
                    <span className="font-bold text-xs">CHIUDI</span>
                </button>
            </div>

            {/* Editor */}
            <div className="flex-1 relative bg-slate-900">
                <textarea 
                    value={text}
                    onChange={handleChange}
                    readOnly={readOnly}
                    className={`w-full h-full bg-transparent p-4 text-lg leading-relaxed resize-none focus:outline-none custom-scrollbar
                        ${readOnly ? 'text-slate-400 cursor-default' : 'text-amber-100 placeholder-slate-700'}`}
                    placeholder="Scrivi qui le note di regia per questo brano..."
                    spellCheck={false}
                />
            </div>
            
            {/* Footer Status */}
            {!readOnly && (
                <div className="p-2 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 text-right">
                    Salvataggio automatico
                </div>
            )}
        </div>
    );
};

export default NotesPanel;