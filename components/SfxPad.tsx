import React, { useState, useEffect, useRef } from 'react';
import { SfxItem, PlayerState, Language } from '../types';
import { Volume2, X } from 'lucide-react';
import { translations } from '../translations';
import { formatTimeDetail } from '../utils/platformUtils';

interface SfxPadProps {
    sfxItems: SfxItem[];
    activeSfxIndices: Set<number>;
    requestSfxPlay: (index: number) => void;
    sfxMasterVolume: number;
    onSfxMasterVolumeChange: (vol: number) => void;
    language: Language;
    isControlsDisabled: boolean;
    onClose: () => void;
    isAndroid: boolean;
    isPadForced?: boolean;
    getSfxProgress?: (index: number) => number;
    sfxDurations?: { [index: number]: number };
}

const padColors = [
    // Row 1
    'bg-yellow-400 text-slate-900',
    'bg-orange-500 text-white',
    'bg-rose-500 text-white',
    // Row 2
    'bg-cyan-400 text-slate-900',
    'bg-blue-500 text-white',
    'bg-fuchsia-500 text-white',
    // Row 3
    'bg-emerald-400 text-slate-900',
    'bg-green-500 text-white',
    'bg-amber-600 text-white'
];

// Configurazione opacità dei tasti del PAD (puoi modificare questi valori)
const PAD_OPACITY = {
    active: 'opacity-100',       // Opacità tasto in esecuzione
    inactiveReady: 'opacity-70', // Opacità tasto con effetto caricato ma fermo (es: opacity-50)
    inactiveEmpty: 'opacity-10', // Opacità tasto vuoto
};

export const SfxPad: React.FC<SfxPadProps> = ({
    sfxItems,
    activeSfxIndices,
    requestSfxPlay,
    sfxMasterVolume,
    onSfxMasterVolumeChange,
    language,
    isControlsDisabled,
    onClose,
    isAndroid,
    isPadForced,
    getSfxProgress,
    sfxDurations = {}
}) => {
    const t = translations[language];
    
    // We can run an internal requestAnimationFrame to smoothly update progress bars
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let frame: number;
        const loop = () => {
            if (activeSfxIndices.size > 0) {
                setTick(prev => prev + 1);
            }
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
    }, [activeSfxIndices.size]);

    const [sliderLength, setSliderLength] = useState(200);
    const sliderContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!sliderContainerRef.current) return;
        const resizeOp = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setSliderLength(entry.contentRect.height);
            }
        });
        resizeOp.observe(sliderContainerRef.current);
        return () => resizeOp.disconnect();
    }, []);

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-2 md:p-4 overflow-hidden w-full h-[100dvh]">
            <div className={`flex w-full max-w-6xl gap-2 md:gap-4 flex-row flex-1 min-h-0 relative h-full ${isPadForced ? 'pt-8' : ''}`}>
                {/* 3x3 Grid */}
                <div className="flex-1 grid grid-cols-3 grid-rows-3 gap-2 md:gap-4 h-full min-h-0">
                    {Array.from({ length: 9 }).map((_, idx) => {
                        const sfx = sfxItems[idx];
                        const isPlaying = activeSfxIndices.has(idx);
                        
                        const hasUrl = !!(sfx && sfx.url);
                        const hasLabel = !!(sfx && sfx.label);
                        const colorClass = hasUrl ? padColors[idx % padColors.length] : 'bg-slate-800 text-slate-600';
                        const activeStyle = isPlaying ? `${PAD_OPACITY.active} border-4 border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]` : `${PAD_OPACITY.inactiveReady} border-2 border-transparent hover:opacity-100 hover:border-white/20`;
                        const emptyStyle = (!hasUrl) ? (hasLabel ? 'opacity-40 border-slate-700 bg-slate-900 border-2 border-dashed' : `${PAD_OPACITY.inactiveEmpty} border-transparent hover:opacity-20 hover:border-transparent`) : '';
                        
                        let progressMsg = '';
                        let progressPct = 0;
                        if (isPlaying && getSfxProgress && sfxDurations[idx]) {
                            const prog = getSfxProgress(idx);
                            const dur = sfxDurations[idx];
                            if (dur > 0) {
                                progressPct = Math.min(100, Math.max(0, ((dur - prog) / dur) * 100));
                                const left = dur - prog;
                                progressMsg = '-' + formatTimeDetail(Math.max(0, left));
                            }
                        }

                        return (
                            <button
                                key={idx}
                                disabled={isControlsDisabled || !sfx || !sfx.url}
                                onClick={() => requestSfxPlay(idx)}
                                className={`w-full h-full rounded-xl md:rounded-2xl flex flex-col items-center justify-center 
                                    transition-all relative overflow-hidden min-h-0 ${
                                        isPlaying 
                                            ? 'scale-[0.97] animate-pulse z-30' 
                                            : 'hover:scale-[1.02]'
                                    } ${colorClass} ${emptyStyle || activeStyle} ${isControlsDisabled ? 'cursor-not-allowed' : ''}`}
                            >
                                <span className="text-xs md:text-sm font-bold text-white absolute top-1 left-2 md:top-2 md:left-3 z-20">
                                    {idx + 1}
                                </span>
                                {(sfx && sfx.url && sfxDurations[idx]) ? (
                                    <span className="text-[10px] md:text-xs font-mono text-white/70 absolute top-1 right-2 md:top-2 md:right-3 z-20">
                                        {isPlaying && progressMsg ? progressMsg : formatTimeDetail(sfxDurations[idx])}
                                    </span>
                                ) : null}
                                <span className={`font-bold text-sm sm:text-lg md:text-2xl text-center px-1 md:px-4 z-10 break-words leading-tight ${isPlaying ? 'drop-shadow-md text-white' : (hasUrl ? 'text-current' : 'text-slate-300')}`}>
                                    {sfx && sfx.label ? sfx.label : `SFX ${idx + 1}`}
                                </span>
                                {isPlaying && (
                                    <>
                                        <div 
                                            className="absolute bottom-0 left-0 h-1 md:h-2 bg-white/50 transition-all duration-75" 
                                            style={{ width: `${progressPct}%` }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none scale-150">
                                            <Volume2 className="w-24 h-24 text-white" />
                                        </div>
                                        <div className="absolute bottom-2 md:bottom-4 inset-x-0 mx-auto flex justify-center animate-pulse text-white z-20">
                                            <Volume2 className="w-5 h-5 md:w-6 md:h-6 drop-shadow-md" />
                                        </div>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
                
                {/* Volume Slider & Close Button - Vertical */}
                <div className="relative w-16 sm:w-20 md:w-24 bg-slate-800 rounded-xl md:rounded-2xl py-6 flex flex-col items-center justify-between shadow-xl border border-slate-700 h-full min-h-0 shrink-0">
                    {!isPadForced && (
                        <button 
                            onClick={onClose}
                            className="absolute top-1 right-1 md:top-2 md:right-2 p-1 rounded bg-slate-900 border border-transparent text-rose-500 hover:text-rose-400 hover:border-slate-700 transition-colors shadow-sm active:scale-95"
                            title={language === 'en' ? 'Close Pad' : 'Chiudi Pad'}
                        >
                            <X className="w-4 h-4 md:w-5 md:h-5 font-bold" />
                        </button>
                    )}

                    <Volume2 className="w-6 h-6 md:w-8 md:h-8 text-slate-300 mt-6 mb-2 shrink-0" />
                    <div className="relative flex-1 w-full flex items-center justify-center min-h-0 py-4">
                        <div className="absolute inset-y-8 inset-x-0 mx-auto w-full flex items-center justify-center pointer-events-none" ref={sliderContainerRef}>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={sfxMasterVolume}
                                onChange={(e) => onSfxMasterVolumeChange(parseFloat(e.target.value))}
                                disabled={isControlsDisabled}
                                className="appearance-none bg-slate-600 outline-none cursor-pointer accent-indigo-500 rounded-lg pointer-events-auto"
                                style={{
                                    height: '8px',
                                    width: `${sliderLength}px`,
                                    transform: 'rotate(-90deg)',
                                    transformOrigin: 'center center'
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
