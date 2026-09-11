import React, { useState } from 'react';
import {
  Wifi,
  BatteryMedium,
  Signal,
  Lock,
  RotateCw,
  ExternalLink,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export type DeviceMode = 'iphone' | 'pixel' | 'ipad' | 'desktop';

export interface DevicePreviewProps {
  deviceMode: DeviceMode;
  children: React.ReactNode;
  restaurantName?: string;
  restaurantSlug?: string;
}

export const DevicePreview: React.FC<DevicePreviewProps> = ({
  deviceMode,
  children,
  restaurantName = 'AURA Menu',
  restaurantSlug = '',
}) => {
  const [scale, setScale] = useState<number>(0.92);

  // Device configuration
  const getDeviceConfig = () => {
    switch (deviceMode) {
      case 'iphone':
        return {
          width: 393,
          height: 852,
          radius: '48px',
          borderWidth: '10px',
          borderColor: '#232529',
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.1)',
        };
      case 'pixel':
        return {
          width: 412,
          height: 892,
          radius: '40px',
          borderWidth: '9px',
          borderColor: '#1c1e22',
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)',
        };
      case 'ipad':
        return {
          width: 768,
          height: 980,
          radius: '30px',
          borderWidth: '12px',
          borderColor: '#24272c',
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.1)',
        };
      case 'desktop':
      default:
        return {
          width: 1140,
          height: 760,
          radius: '16px',
          borderWidth: '1px',
          borderColor: '#3f3f46',
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
        };
    }
  };

  const config = getDeviceConfig();

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-auto p-4 sm:p-6 no-scrollbar">
      {/* Zoom / Scale Toolbar (Floating Bottom Center) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-md shadow-xl text-xs text-zinc-400">
        <span className="text-[10px] uppercase font-bold text-zinc-500 mr-1 tracking-wider">
          {deviceMode.toUpperCase()} • {config.width}×{config.height}
        </span>
        <button
          onClick={() => setScale((s) => Math.max(0.65, Number((s - 0.05).toFixed(2))))}
          className="p-1 rounded-md hover:bg-zinc-800 hover:text-white transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-[11px] font-semibold text-zinc-300 w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(1.1, Number((s + 0.05).toFixed(2))))}
          className="p-1 rounded-md hover:bg-zinc-800 hover:text-white transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setScale(0.92)}
          className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors ml-1"
          title="Reset Scale"
        >
          Reset
        </button>
      </div>

      {/* Scaling Container */}
      <div
        className="transition-transform duration-200 ease-out origin-center flex items-center justify-center shrink-0 my-auto"
        style={{
          transform: `scale(${scale})`,
          width: config.width,
          height: config.height,
        }}
      >
        {/* Physical Device Frame */}
        <div
          className="relative w-full h-full bg-black overflow-hidden select-none flex flex-col"
          style={{
            borderRadius: config.radius,
            borderWidth: config.borderWidth,
            borderColor: config.borderColor,
            borderStyle: 'solid',
            boxShadow: config.boxShadow,
          }}
        >
          {/* IPHONE CHROME */}
          {deviceMode === 'iphone' && (
            <>
              {/* Dynamic Island */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-50 flex items-center justify-between px-3 border border-zinc-800/80 shadow-inner pointer-events-none">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 border border-zinc-700/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-blue-950/40" />
              </div>

              {/* iOS Status Bar */}
              <div className="absolute top-0 inset-x-0 h-11 px-6 flex items-center justify-between z-40 text-white text-[11px] font-semibold pointer-events-none select-none">
                <span>9:41</span>
                <div className="flex items-center gap-1.5 opacity-90">
                  <Signal className="w-3 h-3" />
                  <Wifi className="w-3 h-3" />
                  <div className="w-5 h-2.5 border border-white/80 rounded-sm p-0.5 flex items-center">
                    <div className="w-full h-full bg-white rounded-2xs" />
                  </div>
                </div>
              </div>

              {/* iOS Bottom Home Bar */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/40 rounded-full z-50 pointer-events-none" />
            </>
          )}

          {/* PIXEL CHROME */}
          {deviceMode === 'pixel' && (
            <>
              {/* Center Camera Punch Hole */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-black rounded-full z-50 border border-zinc-800 shadow-inner pointer-events-none" />

              {/* Android Status Bar */}
              <div className="absolute top-0 inset-x-0 h-10 px-5 flex items-center justify-between z-40 text-white text-[11px] font-medium pointer-events-none select-none">
                <span>9:41</span>
                <div className="flex items-center gap-2 opacity-90">
                  <Signal className="w-3 h-3" />
                  <Wifi className="w-3 h-3" />
                  <BatteryMedium className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Android Bottom Navigation Pill */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 bg-white/40 rounded-full z-50 pointer-events-none" />
            </>
          )}

          {/* IPAD CHROME */}
          {deviceMode === 'ipad' && (
            <>
              {/* Subtle top bezel camera dot */}
              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-zinc-800 border border-zinc-700/50 z-50 pointer-events-none" />
              {/* Bottom home bar */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-36 h-1 bg-white/30 rounded-full z-50 pointer-events-none" />
            </>
          )}

          {/* DESKTOP BROWSER CHROME */}
          {deviceMode === 'desktop' && (
            <div className="h-10 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between z-40 shrink-0 text-xs text-zinc-400">
              {/* Window Controls */}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80 border border-red-600/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80 border border-yellow-600/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/80 border border-green-600/50" />
              </div>

              {/* Browser Address Bar */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 w-96 max-w-sm">
                <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{restaurantName} • auramenus.com/menu/{restaurantSlug || 'live'}</span>
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-2">
                <RotateCw className="w-3.5 h-3.5 hover:text-white cursor-pointer" />
                <a
                  href={`/menu/${restaurantSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open live in new window"
                  className="hover:text-white"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Render Screen Content */}
          <div className="w-full h-full relative overflow-hidden bg-black flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
