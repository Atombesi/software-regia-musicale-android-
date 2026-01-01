import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../translations';

interface WaveformProps {
  url: string;
  isPlaying: boolean;
  volume: number;
  trimStart?: number;
  trimEnd?: number;
  isEditing: boolean;
  onReady: (duration: number) => void;
  onFinish: () => void;
  onTimeUpdate: (time: number) => void;
  onRegionChange: (start: number, end: number) => void;
  onCursorMove: (time: number) => void; 
  seekRequest: number | null;
  syncTime: number | null; // Used for Master/Slave sync AND Standalone playback sync
  language?: Language;
  hasFadeOut?: boolean; 
}

const Waveform: React.FC<WaveformProps> = ({ 
  url, 
  isPlaying, 
  volume, 
  trimStart,
  trimEnd,
  isEditing,
  onReady, 
  onFinish, 
  onTimeUpdate,
  onRegionChange,
  onCursorMove,
  seekRequest,
  syncTime,
  language = 'it',
  hasFadeOut = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null); 
  const activeRegionRef = useRef<any>(null); 
  const [isReady, setIsReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(50); 
  const [duration, setDuration] = useState(0);
  const [displayTime, setDisplayTime] = useState("0:00.00");
  const [timeColor, setTimeColor] = useState('text-white'); 
  const t = translations[language];

  const trimEndRef = useRef(trimEnd);
  
  useEffect(() => {
      trimEndRef.current = trimEnd;
  }, [trimEnd]);

  // --- TOUCH ZOOM STATE ---
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);

  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onRegionChangeRef = useRef(onRegionChange);
  const onFinishRef = useRef(onFinish);
  const onCursorMoveRef = useRef(onCursorMove);
  const onReadyRef = useRef(onReady);

  const formatTime = (time: number) => {
      const m = Math.floor(time / 60);
      const s = Math.floor(time % 60);
      const ms = Math.floor((time % 1) * 100);
      return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
    onRegionChangeRef.current = onRegionChange;
    onFinishRef.current = onFinish;
    onCursorMoveRef.current = onCursorMove;
    onReadyRef.current = onReady;
  }, [onTimeUpdate, onRegionChange, onFinish, onCursorMove, onReady]);

  // Helper to determine color based on remaining time
  const updateTimeColor = (currentTime: number, playing: boolean) => {
      // Use duration from wavesurfer OR the latest known duration
      const d = wavesurfer.current?.getDuration() || duration;
      const currentTrimEnd = trimEndRef.current;
      const end = (currentTrimEnd && currentTrimEnd > 0) ? currentTrimEnd : d;
      const remaining = end - currentTime;

      if (remaining <= 5) { 
          setTimeColor('text-red-500 font-bold'); 
      } else if (remaining <= 10) {
          setTimeColor('text-amber-500');
      } else {
          setTimeColor(playing ? 'text-emerald-400' : 'text-white');
      }
  };

  // --- MAIN TIME UPDATE EFFECT ---
  useEffect(() => {
      // CRITICAL FIX: Always prefer syncTime if available (HTML5 Player Active), otherwise fallback to WaveSurfer internal time
      const t = syncTime !== null ? syncTime : (wavesurfer.current?.getCurrentTime() || 0);
      updateTimeColor(t, isPlaying);
      
      // Update display text if syncing externally
      if (syncTime !== null) {
          setDisplayTime(formatTime(syncTime));
      }
  }, [isPlaying, hasFadeOut, trimEnd, duration, syncTime]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const wsRegions = RegionsPlugin.create();
    regionsRef.current = wsRegions;

    wavesurfer.current = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#e2e8f0', 
      progressColor: 'rgba(255, 255, 255, 0.5)',
      cursorColor: '#ffffff',
      cursorWidth: 2,
      barWidth: 3,
      barGap: 3,
      barRadius: 3,
      height: containerRef.current.clientHeight || 150, 
      normalize: true,
      minPxPerSec: zoomLevel,
      hideScrollbar: false,
      interact: true, 
      plugins: [wsRegions],
    });

    wavesurfer.current.on('ready', () => {
      setIsReady(true);
      const d = wavesurfer.current?.getDuration() || 0;
      setDuration(d);
      if (onReadyRef.current) onReadyRef.current(d);
    });

    wavesurfer.current.on('finish', () => {
      if (onFinishRef.current) onFinishRef.current();
    });

    wavesurfer.current.on('audioprocess', (currentTime) => {
      // Only update from internal process if NOT syncing externally
      if (syncTime === null) {
          setDisplayTime(formatTime(currentTime));
          if (onTimeUpdateRef.current) onTimeUpdateRef.current(currentTime);
          updateTimeColor(currentTime, true);
      }
    });

    wavesurfer.current.on('interaction', (newTime) => {
      if (onTimeUpdateRef.current) onTimeUpdateRef.current(newTime);
      updateTimeColor(newTime, isPlaying);
    });

    wavesurfer.current.on('seeking', (currentTime) => {
      if (syncTime === null) {
          setDisplayTime(formatTime(currentTime));
      }
      if (onTimeUpdateRef.current) onTimeUpdateRef.current(currentTime);
      updateTimeColor(currentTime, isPlaying);
    });

    wsRegions.on('region-updated', (region: any) => {
       if (onRegionChangeRef.current) onRegionChangeRef.current(region.start, region.end);
    });
    
    const handleResize = () => {
        if(wavesurfer.current) {
            setTimeout(() => {
                 // @ts-ignore
                 wavesurfer.current?.setOptions({ height: containerRef.current?.clientHeight || 150 });
            }, 100);
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      wavesurfer.current?.destroy();
    };
  }, []); 

  // Handle Zoom
  useEffect(() => {
      if (wavesurfer.current && isReady) {
          wavesurfer.current.zoom(Math.max(10, zoomLevel));
      }
  }, [zoomLevel, isReady]);

  // Handle Height/Mode Change
  useEffect(() => {
      if (wavesurfer.current && containerRef.current) {
          const timeout = setTimeout(() => {
              if (containerRef.current && wavesurfer.current) {
                  // @ts-ignore
                  wavesurfer.current.setOptions({ height: containerRef.current.clientHeight });
              }
          }, 300);
          return () => clearTimeout(timeout);
      }
  }, [isEditing]);

  // Load new URL
  useEffect(() => {
    if (wavesurfer.current && url) {
      setIsReady(false);
      setZoomLevel(isEditing ? 50 : 10); 
      wavesurfer.current.load(url);
    }
  }, [url, isEditing]);

  // --- LIVE MODE FIT TO REGION LOGIC ---
  useEffect(() => {
      if (!isEditing && isReady && containerRef.current && wavesurfer.current) {
          const start = trimStart || 0;
          const end = (trimEnd && trimEnd > 0) ? trimEnd : duration;
          const regionDuration = end - start;
          const containerWidth = containerRef.current.clientWidth;
          
          if (regionDuration > 0 && containerWidth > 0) {
              const fitZoom = containerWidth / regionDuration;
              setZoomLevel(Math.max(10, fitZoom)); 
          }
      }
  }, [isEditing, isReady, trimStart, trimEnd, duration]);

  // Sync Regions
  useEffect(() => {
      if (!isReady || !wavesurfer.current) return;
      const d = wavesurfer.current.getDuration() || duration;
      
      if (activeRegionRef.current) {
          const r = activeRegionRef.current;
          const targetStart = trimStart || 0;
          const targetEnd = (trimEnd && trimEnd > 0) ? trimEnd : d;
          if (Math.abs(r.start - targetStart) < 0.05 && Math.abs(r.end - targetEnd) < 0.05) {
              return;
          }
      }
      updateRegionVisuals(d, trimStart, trimEnd);
  }, [trimStart, trimEnd, isEditing, isReady, duration]);


  const updateRegionVisuals = (currentDuration: number, tStart?: number, tEnd?: number) => {
      if (!regionsRef.current) return;
      regionsRef.current.clearRegions();
      const start = tStart || 0;
      const end = (tEnd && tEnd > 0) ? tEnd : currentDuration;

      activeRegionRef.current = regionsRef.current.addRegion({
          start: start,
          end: end,
          color: 'rgba(16, 185, 129, 0.2)', 
          drag: false, 
          resize: false, 
          minLength: 0.1,
      });
  };

  // --- PLAYBACK LOGIC ---
  useEffect(() => {
    if (!wavesurfer.current || !isReady) return;
    
    if (isEditing) {
        if (isPlaying) {
            wavesurfer.current.play().catch(e => console.error("Waveform play error", e));
        } else {
            wavesurfer.current.pause();
        }
    } 
    else {
        // IN LIVE MODE: WaveSurfer is visualization only, mute it and let syncTime drive cursor
        wavesurfer.current.setVolume(0); 
        wavesurfer.current.pause(); 
    }
  }, [isPlaying, isReady, isEditing]);

  // --- SYNC EXTERNAL TIME (CRITICAL FOR LIVE MODE) ---
  useEffect(() => {
      if (syncTime !== null && wavesurfer.current && isReady) {
          const d = wavesurfer.current.getDuration();
          if (d > 0) {
              const progress = Math.min(Math.max(0, syncTime / d), 1);
              wavesurfer.current.seekTo(progress);
          }
      }
  }, [syncTime, isReady]);

  // --- EDITING VOLUME ---
  useEffect(() => {
    if (wavesurfer.current && isEditing) {
      wavesurfer.current.setVolume(volume);
    }
  }, [volume, isEditing]);

  useEffect(() => {
    if (wavesurfer.current && isReady && seekRequest !== null) {
      const d = wavesurfer.current.getDuration();
      if (d > 0) {
        const progress = Math.min(Math.max(0, seekRequest / d), 1);
        wavesurfer.current.seekTo(progress);
      }
    }
  }, [seekRequest, isReady]);

  const calculateTimeFromEvent = (e: React.MouseEvent) => {
      if (!containerRef.current || duration === 0) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const wrapper = containerRef.current.querySelector('div'); 
      if (!wrapper) return 0;
      const scrollLeft = wrapper.scrollLeft;
      const scrollWidth = wrapper.scrollWidth;
      const x = (e.clientX - rect.left) + scrollLeft;
      const pct = x / scrollWidth;
      return pct * duration;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isEditing || duration === 0) return;
      const time = calculateTimeFromEvent(e);
      if (onCursorMoveRef.current) onCursorMoveRef.current(time);
  };

  // --- TOUCH HANDLERS FOR ZOOM ---
  const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          setLastTouchDistance(dist);
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDistance !== null) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          
          const delta = dist - lastTouchDistance;
          const sensitivity = 0.5;
          
          if (Math.abs(delta) > 5) {
               setZoomLevel(prev => Math.max(10, Math.min(500, prev + (delta * sensitivity))));
               setLastTouchDistance(dist);
          }
      }
  };

  const handleTouchEnd = () => {
      setLastTouchDistance(null);
  };

  const showTimeOverlay = isReady || syncTime !== null;

  return (
    <div className="w-full h-full flex flex-col relative group select-none overflow-hidden">
      
      {showTimeOverlay && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 shadow-lg pointer-events-none">
              <span className={`font-mono font-bold text-lg tracking-wider ${timeColor}`}>
                  {displayTime}
              </span>
          </div>
      )}

      <div 
        className="relative w-full h-full touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
         <div 
            ref={containerRef} 
            onMouseMove={handleMouseMove}
            className="w-full h-full absolute inset-0 flex items-center z-0 cursor-crosshair"
         />
      </div>
      
      {!isReady && !syncTime && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center text-xs text-emerald-400 mt-2 animate-pulse font-mono bg-slate-900/80 px-3 py-1 rounded-full border border-emerald-500/30">
            {t.waveform_loading}
            </div>
        </div>
      )}

      <style>{`
        .wavesurfer-region {
            z-index: 4 !important;
            border-left: 2px solid #10b981 !important; 
            border-right: 2px solid #ef4444 !important; 
            pointer-events: none !important; 
        }
        .wavesurfer-region-handle { display: none !important; }
      `}</style>

      {isReady && (
          <div className="absolute bottom-2 right-2 z-20 flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-lg border border-slate-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => setZoomLevel(prev => Math.max(10, prev - 5))}
                className="p-1 text-slate-400 hover:text-white transition-colors active:scale-95"
              >
                  <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-[9px] font-mono text-slate-500 min-w-[3ch] text-center">{Math.round(zoomLevel)}</span>
              <button 
                onClick={() => setZoomLevel(prev => Math.min(200, prev + 5))}
                className="p-1 text-slate-400 hover:text-white transition-colors active:scale-95"
              >
                  <ZoomIn className="w-3 h-3" />
              </button>
          </div>
      )}
    </div>
  );
};

export default Waveform;