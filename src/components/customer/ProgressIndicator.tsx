import React from 'react';

interface ProgressIndicatorProps {
  currentIndex: number;
  total: number;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentIndex,
  total,
}) => {
  if (total <= 0) return null;

  const formatNumber = (num: number) => num.toString().padStart(2, '0');

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none select-none">
      {/* Index Counter */}
      <div className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-mono tracking-widest text-amber-300 shadow-md">
        <span>{formatNumber(currentIndex + 1)}</span>
        <span className="text-zinc-500 mx-1">/</span>
        <span className="text-zinc-400">{formatNumber(total)}</span>
      </div>

      {/* Vertical Indicator Line with active thumb */}
      <div className="w-1 h-24 sm:h-32 bg-white/10 rounded-full overflow-hidden relative shadow-inner">
        <div
          className="w-full bg-gradient-to-b from-amber-400 to-yellow-500 rounded-full transition-all duration-300 shadow-sm shadow-amber-400/50"
          style={{
            height: `${Math.max(10, 100 / total)}%`,
            transform: `translateY(${currentIndex * ((100 - (100 / total)) / Math.max(1, total - 1))}%)`,
          }}
        />
      </div>
    </div>
  );
};
