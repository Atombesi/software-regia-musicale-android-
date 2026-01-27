
import React, { useState, useEffect, useRef } from 'react';
import { Clock, Wind } from 'lucide-react';
import { formatTimeDetail, parseManualTime } from '../../utils/platformUtils';

interface TimeEditModalProps {
    isOpen: boolean;
    type: 'start' | 'end' | 'duration' | 'fade_auto' | 'fade_manual' | null;
    initialValue: number;
    onSave: (val: number) => void;
    onClose: () => void;
    t: any;
}

const TimeEditModal: React.FC<TimeEditModalProps> = ({ isOpen, type, initialValue, onSave, onClose, t }) => {
    const [valStr, setValStr] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const isFade = type === 'fade_auto' || type === 'fade_manual';

    useEffect(() => {
        if (isOpen) {
            // If it's a fade setting, show just the integer number. Otherwise show formatted time.
            if (isFade) {
                setValStr(Math.round(initialValue).toString());
            } else {
                setValStr(formatTimeDetail(initialValue));
            }
            setTimeout(() => inputRef.current?.select(), 100);
        }
    }, [isOpen, initialValue, isFade]);

    if (!isOpen || !type) return null;

    const handleSave = () => {
        let num = 0;
        if (isFade) {
            // Parse as integer for fade
            num = parseInt(valStr, 10);
            if (isNaN(num) || num < 0) num = 0;
        } else {
            // Parse as time string for others
            num = parseManualTime(valStr);
        }
        onSave(num);
        onClose();
    };

    const titleMap: {[key: string]: string} = {
        'start': t.time_start,
        'end': t.time_end,
        'duration': t.time_duration,
        'fade_auto': "Fade Out Automatico (sec)",
        'fade_manual': "Fade Out Manuale (sec)"
    };

    return (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
                {isFade ? (
                    <Wind className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                ) : (
                    <Clock className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
                )}
                
                <h3 className="text-xl font-bold text-white mb-4">{titleMap[type] || "Valore"}</h3>
                
                <input 
                    ref={inputRef}
                    type={isFade ? "number" : "text"}
                    inputMode={isFade ? "numeric" : "text"}
                    pattern={isFade ? "[0-9]*" : undefined}
                    value={valStr} 
                    onChange={(e) => setValStr(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="w-full bg-slate-800 border-2 border-indigo-500/50 rounded-xl py-4 text-3xl font-mono text-center text-white font-bold mb-6 focus:outline-none focus:border-indigo-400"
                    placeholder={isFade ? "Secondi" : "0:00.00"}
                />

                <div className="grid grid-cols-2 gap-3">
                    <button onClick={onClose} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors border border-slate-700">{t.btn_cancel}</button>
                    <button onClick={handleSave} className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors shadow-lg">{t.btn_apply}</button>
                </div>
            </div>
        </div>
    );
};

export default TimeEditModal;
