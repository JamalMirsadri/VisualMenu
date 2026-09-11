import { useMemo } from 'react';
import type { RestaurantSettings } from '../types';
import { getTheme } from './themeConfig';
import type { ThemeDefinition } from './themeConfig';

export interface ResolvedTheme {
  definition: ThemeDefinition;
  primaryColor: string;
  accentColor: string;
  isDark: boolean;
  cardClass: string;
  buttonClass: string;
  categoryPillClass: (isActive: boolean) => string;
  textClass: string;
  glassClass: string;
  overlayGradient: string;
  presentationMode: 'INDIVIDUAL_VIDEO' | 'SHARED_ENVIRONMENT' | 'VISUAL_IMAGE';
  foodInfoPosition: 'BOTTOM' | 'SIDE' | 'OVERLAY';
  categoryStyle: 'PILLS' | 'TEXT' | 'MINIMAL' | 'ICON_PLUS_TEXT';
  progressIndicatorStyle: 'BARS' | 'DOTS' | 'NUMBERS' | 'NONE';
  lightingPreset: 'WARM' | 'COOL' | 'DRAMATIC' | 'NATURAL';
  cameraMotion: 'GENTLE_ZOOM' | 'SLOW_PAN' | 'STATIC';
}

export function resolveTheme(settings?: Partial<RestaurantSettings>): ResolvedTheme {
  const themeKey = settings?.theme || 'DARK_LUXURY';
  const def = getTheme(themeKey);

  const primaryColor = settings?.primaryColor || def.colors.accent;
  const accentColor = settings?.accentColor || settings?.primaryColor || def.colors.accent;

  // Resolve card style classes
  let cardClass = def.cardClass;
  if (settings?.cardStyle === 'ROUNDED_LG') {
    cardClass = `${cardClass} rounded-xl`;
  } else if (settings?.cardStyle === 'ROUNDED_XL') {
    cardClass = `${cardClass} rounded-2xl`;
  } else if (settings?.cardStyle === 'ROUNDED_2XL') {
    cardClass = `${cardClass} rounded-3xl`;
  } else if (settings?.cardStyle === 'SQUARE') {
    cardClass = `${cardClass} rounded-none`;
  } else {
    cardClass = `${cardClass} rounded-2xl`;
  }

  // Resolve button style classes
  let buttonClass = 'px-4 py-2 font-medium transition-all active:scale-95';
  if (settings?.buttonStyle === 'PILL') {
    buttonClass += ' rounded-full';
  } else if (settings?.buttonStyle === 'SQUARE') {
    buttonClass += ' rounded-none';
  } else if (settings?.buttonStyle === 'OUTLINE') {
    buttonClass += ' rounded-xl border-2 border-current bg-transparent';
  } else {
    buttonClass += ' rounded-xl';
  }

  // Resolve text style classes
  let textClass = def.textClass;
  if (settings?.textStyle === 'SERIF') {
    textClass = 'font-serif-luxury';
  } else if (settings?.textStyle === 'MODERN') {
    textClass = 'font-sans font-medium tracking-tight';
  }

  // Normalize presentation mode
  let rawMode = (settings?.presentationMode || 'INDIVIDUAL_VIDEO').toUpperCase().replace('-', '_');
  if (rawMode === 'INDIVIDUAL' || rawMode === 'REELS') rawMode = 'INDIVIDUAL_VIDEO';
  const presentationMode = (['INDIVIDUAL_VIDEO', 'SHARED_ENVIRONMENT', 'VISUAL_IMAGE'].includes(rawMode)
    ? rawMode
    : 'INDIVIDUAL_VIDEO') as 'INDIVIDUAL_VIDEO' | 'SHARED_ENVIRONMENT' | 'VISUAL_IMAGE';

  const foodInfoPosition = (settings?.foodInfoPosition?.toUpperCase() || 'BOTTOM') as
    | 'BOTTOM'
    | 'SIDE'
    | 'OVERLAY';

  const categoryStyle = (settings?.categoryStyle?.toUpperCase() || 'PILLS') as
    | 'PILLS'
    | 'TEXT'
    | 'MINIMAL'
    | 'ICON_PLUS_TEXT';

  const progressIndicatorStyle = (settings?.progressIndicatorStyle?.toUpperCase() || 'BARS') as
    | 'BARS'
    | 'DOTS'
    | 'NUMBERS'
    | 'NONE';

  const lightingPreset = (settings?.lightingPreset?.toUpperCase() || 'WARM') as
    | 'WARM'
    | 'COOL'
    | 'DRAMATIC'
    | 'NATURAL';

  const cameraMotion = (settings?.cameraMotion?.toUpperCase() || 'GENTLE_ZOOM') as
    | 'GENTLE_ZOOM'
    | 'SLOW_PAN'
    | 'STATIC';

  const categoryPillClass = (isActive: boolean) => {
    if (categoryStyle === 'TEXT') {
      return isActive
        ? 'text-white font-bold border-b-2 border-amber-400 pb-1'
        : 'text-zinc-400 hover:text-zinc-200 pb-1 border-b-2 border-transparent';
    }
    if (categoryStyle === 'MINIMAL') {
      return isActive
        ? 'text-amber-400 font-semibold bg-amber-400/10 px-3 py-1 rounded-full'
        : 'text-zinc-400 hover:text-zinc-200 px-3 py-1';
    }
    return isActive ? def.activePillClass : def.pillClass;
  };

  return {
    definition: def,
    primaryColor,
    accentColor,
    isDark: def.isDark,
    cardClass,
    buttonClass,
    categoryPillClass,
    textClass,
    glassClass: def.glassClass,
    overlayGradient: def.overlayGradient,
    presentationMode,
    foodInfoPosition,
    categoryStyle,
    progressIndicatorStyle,
    lightingPreset,
    cameraMotion,
  };
}

export function useTheme(settings?: Partial<RestaurantSettings>): ResolvedTheme {
  return useMemo(() => resolveTheme(settings), [settings]);
}
