export interface ThemeDefinition {
  id: 'DARK_LUXURY' | 'LIGHT_MINIMAL' | 'WARM_RESTAURANT' | 'MODERN_GLASS';
  name: string;
  tagline: string;
  isDark: boolean;
  colors: {
    bg: string;
    surface: string;
    surfaceElevated: string;
    surfaceGlass: string;
    border: string;
    borderActive: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    accentMuted: string;
  };
  cardClass: string;
  pillClass: string;
  activePillClass: string;
  textClass: string;
  glassClass: string;
  overlayGradient: string;
}

export const THEME_REGISTRY: Record<string, ThemeDefinition> = {
  DARK_LUXURY: {
    id: 'DARK_LUXURY',
    name: 'Dark Luxury',
    tagline: 'Opulent gold accents, deep obsidian blacks, and high-end gastronomy aesthetics.',
    isDark: true,
    colors: {
      bg: '#09090b',
      surface: 'rgba(18, 18, 22, 0.85)',
      surfaceElevated: 'rgba(28, 28, 35, 0.95)',
      surfaceGlass: 'rgba(18, 18, 22, 0.72)',
      border: 'rgba(212, 175, 55, 0.25)',
      borderActive: 'rgba(212, 175, 55, 0.8)',
      textPrimary: '#f4f4f5',
      textSecondary: '#d4d4d8',
      textMuted: '#a1a1aa',
      accent: '#d4af37',
      accentHover: '#eab308',
      accentMuted: 'rgba(212, 175, 55, 0.15)',
    },
    cardClass: 'bg-zinc-900/90 border border-amber-500/25 shadow-2xl backdrop-blur-xl',
    pillClass: 'bg-zinc-900/80 border border-zinc-700/60 text-zinc-300 hover:border-amber-400/50',
    activePillClass: 'bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold shadow-lg shadow-amber-500/25 border-amber-400',
    textClass: 'font-sans-luxury text-zinc-100',
    glassClass: 'bg-zinc-950/75 backdrop-blur-xl border border-amber-500/20 text-zinc-100 shadow-2xl',
    overlayGradient: 'linear-gradient(to top, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.4) 60%, transparent 100%)',
  },
  LIGHT_MINIMAL: {
    id: 'LIGHT_MINIMAL',
    name: 'Light Minimal',
    tagline: 'Crisp editorial aesthetic, razor-sharp typography, and spotless gallery feel.',
    isDark: false,
    colors: {
      bg: '#fafafa',
      surface: '#ffffff',
      surfaceElevated: '#f4f4f5',
      surfaceGlass: 'rgba(255, 255, 255, 0.88)',
      border: '#e4e4e7',
      borderActive: '#18181b',
      textPrimary: '#09090b',
      textSecondary: '#52525b',
      textMuted: '#71717a',
      accent: '#18181b',
      accentHover: '#27272a',
      accentMuted: 'rgba(24, 24, 27, 0.08)',
    },
    cardClass: 'bg-white border border-zinc-200 shadow-md',
    pillClass: 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400',
    activePillClass: 'bg-zinc-900 text-white font-semibold shadow border-zinc-900',
    textClass: 'font-sans text-zinc-900',
    glassClass: 'bg-white/90 backdrop-blur-xl border border-zinc-200/80 text-zinc-900 shadow-lg',
    overlayGradient: 'linear-gradient(to top, rgba(250,250,250,0.96) 0%, rgba(250,250,250,0.3) 60%, transparent 100%)',
  },
  WARM_RESTAURANT: {
    id: 'WARM_RESTAURANT',
    name: 'Warm Bistro',
    tagline: 'Rich terracotta, comforting hearth amber, and welcoming dining room intimacy.',
    isDark: true,
    colors: {
      bg: '#1c1512',
      surface: 'rgba(38, 28, 24, 0.9)',
      surfaceElevated: 'rgba(48, 36, 30, 0.95)',
      surfaceGlass: 'rgba(38, 28, 24, 0.75)',
      border: 'rgba(249, 115, 22, 0.25)',
      borderActive: 'rgba(249, 115, 22, 0.8)',
      textPrimary: '#fff7ed',
      textSecondary: '#fed7aa',
      textMuted: '#a8a29e',
      accent: '#f97316',
      accentHover: '#fb923c',
      accentMuted: 'rgba(249, 115, 22, 0.15)',
    },
    cardClass: 'bg-[#261c18]/90 border border-orange-500/25 shadow-2xl backdrop-blur-xl',
    pillClass: 'bg-[#261c18]/80 border border-orange-950/60 text-orange-200/80 hover:border-orange-500/50',
    activePillClass: 'bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg shadow-orange-500/30 border-orange-400',
    textClass: 'font-sans text-orange-50',
    glassClass: 'bg-[#261c18]/80 backdrop-blur-xl border border-orange-500/20 text-orange-50 shadow-2xl',
    overlayGradient: 'linear-gradient(to top, rgba(28,21,18,0.96) 0%, rgba(28,21,18,0.4) 60%, transparent 100%)',
  },
  MODERN_GLASS: {
    id: 'MODERN_GLASS',
    name: 'Modern Glass',
    tagline: 'Futuristic frosted glass, neon cyan highlights, and ultra-fluid visuals.',
    isDark: true,
    colors: {
      bg: '#05070f',
      surface: 'rgba(15, 23, 42, 0.7)',
      surfaceElevated: 'rgba(30, 41, 59, 0.85)',
      surfaceGlass: 'rgba(15, 23, 42, 0.55)',
      border: 'rgba(56, 189, 248, 0.25)',
      borderActive: 'rgba(56, 189, 248, 0.8)',
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      accent: '#38bdf8',
      accentHover: '#7dd3fc',
      accentMuted: 'rgba(56, 189, 248, 0.15)',
    },
    cardClass: 'bg-slate-900/70 border border-cyan-500/25 shadow-2xl backdrop-blur-2xl',
    pillClass: 'bg-slate-900/60 border border-slate-700/70 text-slate-300 hover:border-cyan-400/50 backdrop-blur',
    activePillClass: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/30 border-cyan-400',
    textClass: 'font-sans text-slate-100',
    glassClass: 'bg-slate-900/65 backdrop-blur-2xl border border-cyan-500/30 text-white shadow-2xl shadow-cyan-950/50',
    overlayGradient: 'linear-gradient(to top, rgba(5,7,15,0.96) 0%, rgba(5,7,15,0.35) 60%, transparent 100%)',
  },
};

export function getTheme(themeKey?: string): ThemeDefinition {
  if (!themeKey) return THEME_REGISTRY.DARK_LUXURY;
  const normalized = themeKey.toUpperCase().replace('-', '_');
  return THEME_REGISTRY[normalized] || THEME_REGISTRY.DARK_LUXURY;
}
