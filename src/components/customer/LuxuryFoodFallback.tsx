import React from 'react';
import { Sparkles, UtensilsCrossed } from 'lucide-react';
import { motion } from 'framer-motion';

interface LuxuryFoodFallbackProps {
  name: string;
  categoryName?: string;
  tagline?: string;
  primaryColor?: string;
  className?: string;
  compact?: boolean;
}

export const LuxuryFoodFallback: React.FC<LuxuryFoodFallbackProps> = ({
  name,
  categoryName,
  tagline,
  primaryColor = '#f59e0b',
  className = '',
  compact = false,
}) => {
  if (compact) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-amber-400 border border-amber-500/20 p-2 relative overflow-hidden select-none ${className}`}
        style={{
          boxShadow: `inset 0 0 20px ${primaryColor}15`,
        }}
      >
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${primaryColor}, transparent 70%)`,
          }}
        />
        <UtensilsCrossed className="w-5 h-5 text-amber-400/80 mb-1 relative z-10" />
        <span className="text-[10px] font-bold font-serif-luxury tracking-wider text-zinc-300 text-center line-clamp-1 relative z-10 px-1">
          {name}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0a0c] via-[#121114] to-[#08080a] select-none ${className}`}
    >
      {/* Ambient Radial Color Glows */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${primaryColor} 0%, transparent 70%)`,
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-black pointer-events-none" />

      {/* Decorative Ornate Frame Elements */}
      <div className="relative z-10 flex flex-col items-center justify-center max-w-md px-6 text-center">
        {/* Crest Ring with Emblem */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative mb-6"
        >
          {/* Outer glow ring */}
          <div
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-amber-500/30 flex items-center justify-center p-2 bg-gradient-to-b from-amber-500/10 to-transparent shadow-2xl backdrop-blur-md"
            style={{
              boxShadow: `0 0 40px ${primaryColor}25, inset 0 0 20px ${primaryColor}15`,
            }}
          >
            {/* Inner dashed ring */}
            <div className="w-full h-full rounded-full border border-dashed border-amber-400/40 flex items-center justify-center bg-black/60">
              <UtensilsCrossed className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)]" />
            </div>
          </div>

          {/* Sparkle Badges */}
          <div className="absolute -top-1 -right-1 p-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </motion.div>

        {/* Category Pill if provided */}
        {categoryName && (
          <span className="inline-block px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold uppercase tracking-widest mb-3 backdrop-blur-sm">
            {categoryName}
          </span>
        )}

        {/* Dish Title */}
        <h2 className="font-serif-luxury text-2xl sm:text-3xl md:text-4xl font-bold tracking-wide text-white mb-2 leading-tight">
          {name}
        </h2>

        {/* Tagline or Artisanal Descriptor */}
        <p className="text-amber-200/80 text-xs sm:text-sm font-medium italic max-w-xs mb-4">
          {tagline || "Chef's Artisanal Recipe • Crafted to Order"}
        </p>

        {/* Minimal Divider Accent */}
        <div className="flex items-center gap-3 w-40 opacity-60">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-400/60" />
          <div className="w-1.5 h-1.5 rotate-45 bg-amber-400" />
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-400/60" />
        </div>
      </div>
    </div>
  );
};
