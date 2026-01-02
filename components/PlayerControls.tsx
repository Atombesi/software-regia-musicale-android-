import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Wind, Square } from 'lucide-react';
import { PlayerState, AppMode, Language } from '../types';
import { translations } from '../translations';

interface PlayerControlsProps {
  state: PlayerState;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onStop: () => void; // New prop
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onFade: () => void;
  title: string;
  startTime: number;
  endTime: number;
  appMode?: AppMode; // Optional to keep backward compatibility if needed, but App provides it
  language: Language;
  readOnly?: boolean; // NEW: Controls locked state
}

const formatTime = (time: number) => {
  if (isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const PlayerControls: React.FC<PlayerControlsProps> = ({
  state,
  onPlayPause,
  onNext,
  onPrev,
  onStop,
  onSeek,
  onVolumeChange,
  onFade,
  title,
  startTime,
  endTime,
  appMode = 'editing',
  language,
  readOnly = false
}) => {
  // Safe defaults if props are missing/zero
  const minVal = startTime || 0;
  const maxVal = (endTime && endTime > 0) ? endTime : (state.duration || 100);
  const t = translations[language];

  // Calculate width percentage relative to the custom range
  const duration = maxVal - minVal;
  const progress = Math.max(0, Math.min(duration, state.currentTime - minVal));
  const widthPct = duration > 0 ? (progress / duration) * 100 : 0;
  
  // Calculate remaining time relative to the Cut End
  const remaining = Math.max(0, maxVal - state.currentTime);

  const isLive = appMode === 'presentation';

  return (
    <div className={`h-full w-full flex items-center px-4 md:px-8 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] ${readOnly ? 'pointer-events-none grayscale opacity-50' : ''}`}>
      
      {/* STOP BUTTON (Leftmost) - REDUCED SIZE */}
      <div className="mr-4 shrink-0">
          <button
            onClick={onStop}
            disabled={readOnly}
            className="flex items-center justify-center text-white rounded-full p-3 shadow-lg bg-red-600 hover:bg-red-500 shadow-red-900/50 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t.stop_reset_tooltip}
          >
              <Square className="w-5 h-5 fill-current" />
          </button>
      </div>

      {/* Current Song Info (Left) */}
      <div className="w-1/4 hidden md:flex flex-col border-l border-slate-800 pl-4">
        <span className={`font-semibold truncate text-lg transition-colors ${state.isPlaying ? 'text-emerald-400' : 'text-orange-400'}`}>
            {title}
        </span>
        <span className="text-slate-400 text-sm">
            {state.isPlaying ? t.now_playing : t.waiting}
        </span>
      </div>

      {/* Main Controls (Center) */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 max-w-3xl mx-auto w-full px-2">
        
        {/* Buttons */}
        <div className="flex items-center gap-6">
          <button 
            onClick={onPrev}
            disabled={isLive || readOnly}
            className={`text-slate-400 transition-colors p-2 rounded-full active:scale-95 ${isLive || readOnly ? 'opacity-20 cursor-not-allowed' : 'hover:text-white hover:bg-slate-800'}`}
          >
            <SkipBack className="w-8 h-8" />
          </button>
          
          {/* PLAY BUTTON - NARROWER */}
          <button 
            onClick={onPlayPause}
            disabled={readOnly}
            className={`text-white rounded-full w-48 py-2.5 shadow-lg transition-all transform active:scale-95 flex items-center justify-between px-4 disabled:opacity-50 disabled:cursor-not-allowed ${
                state.isPlaying 
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/50' 
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/50'
            }`}
          >
            {/* Elapsed Time - BIGGER FONT */}
            <span className="text-sm font-mono font-bold opacity-90 w-12 text-right tracking-tight">
                {formatTime(state.currentTime)}
            </span>

            {/* Icon */}
            {state.isPlaying ? (
              <Pause className="w-8 h-8 fill-current mx-auto" />
            ) : (
              <Play className="w-8 h-8 fill-current ml-1 mx-auto" />
            )}

            {/* Remaining Time - BIGGER FONT */}
            <span className="text-sm font-mono font-bold opacity-90 w-12 text-left tracking-tight">
                -{formatTime(remaining)}
            </span>
          </button>

          <button 
            onClick={onNext}
            disabled={readOnly}
            className="text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-slate-800 active:scale-95 disabled:opacity-20"
          >
            <SkipForward className="w-8 h-8" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full flex items-center gap-3 text-xs font-mono text-slate-400">
          <span>{formatTime(state.currentTime)}</span>
          <div className={`flex-1 h-1.5 bg-slate-700 rounded-full cursor-pointer group relative ${readOnly ? 'pointer-events-none' : ''}`}>
             {/* Hit area for easier seeking */}
            <input 
              type="range"
              min={minVal}
              max={maxVal}
              value={state.currentTime}
              onChange={(e) => onSeek(Number(e.target.value))}
              disabled={readOnly}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
            />
            {/* Visual Bar uses calculated percentage relative to the cut */}
            <div 
              className={`h-full rounded-full relative transition-colors ${state.isPlaying ? 'bg-emerald-500' : 'bg-orange-500'}`}
              style={{ width: `${widthPct}%` }}
            >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          {/* Display End Time = MaxVal (Cut End) */}
          <span>{formatTime(maxVal)}</span>
        </div>
      </div>

      {/* Volume & Extras (Right) */}
      <div className="w-1/4 hidden md:flex justify-end items-center gap-4 pl-2">
        
        {/* Fade Button */}
        <button 
            onClick={onFade}
            disabled={!state.isPlaying || readOnly}
            className="flex flex-col items-center gap-1 group disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            title={t.fade_pause_tooltip}
        >
            <div className="p-2 rounded-full bg-slate-800 border border-slate-700 group-hover:border-emerald-500 group-hover:text-emerald-400 transition-all">
                <Wind className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-emerald-400">{t.fade_btn}</span>
        </button>

        <div className="h-8 w-px bg-slate-800 mx-1"></div>

        {/* Volume - More compact but usable */}
        <div className="flex items-center gap-2 flex-1 max-w-[120px]">
            <button className="text-slate-400 shrink-0" disabled={readOnly}>
                {state.volume === 0 ? <VolumeX className="w-5 h-5"/> : <Volume2 className="w-5 h-5" />}
            </button>
            <input 
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                disabled={readOnly}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full disabled:cursor-not-allowed"
            />
        </div>
      </div>
    </div>
  );
};

export default PlayerControls;