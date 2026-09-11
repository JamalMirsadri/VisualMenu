import React from 'react';
import { Clock, Flame, Heart, Info, Plus, Sparkles } from 'lucide-react';
import type { Category, FoodItem, RestaurantSettings } from '../../types';
import { getTranslations } from '../../i18n/translations';
import { resolveTheme } from '../../theme/useTheme';

interface FoodInfoProps {
  food: FoodItem;
  category?: Category;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpenDetails: () => void;
  onAddToCart?: (food: FoodItem) => void;
  settings?: Partial<RestaurantSettings>;
  language?: string;
}

export const FoodInfo: React.FC<FoodInfoProps> = ({
  food,
  category,
  isFavorite,
  onToggleFavorite,
  onOpenDetails,
  onAddToCart,
  settings,
  language,
}) => {
  const t = getTranslations(language || settings?.language);
  const theme = resolveTheme(settings);

  const showPrices = settings?.showPrices !== false;
  const showCalories = settings?.showCalories !== false && Boolean(food.calories);
  const showPrepTime = settings?.showPreparationTime !== false && Boolean(food.preparationTime);
  const showFavoriteBtn = settings?.showFavoriteButton !== false;
  const showDetailsBtn = settings?.showDetailsButton !== false;
  const showOrderBtn = settings?.showOrderButton !== false;

  const position = (settings?.foodInfoPosition || 'BOTTOM').toUpperCase();
  const isSide = position === 'SIDE';

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 px-5 pb-8 pt-4 flex flex-col justify-end pointer-events-auto ${
        isSide ? 'max-w-sm ml-auto mr-4 mb-4 rounded-3xl backdrop-blur-xl bg-black/60 border border-white/10 p-5' : ''
      }`}
    >
      {/* Category Pill & Badges Row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {category && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-semibold tracking-wider uppercase backdrop-blur-md">
              <Sparkles className="w-3 h-3 text-amber-400" />
              {category.name}
            </span>
          )}

          {food.featured && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/25 border border-yellow-400/50 text-yellow-300 text-xs font-semibold tracking-wider uppercase backdrop-blur-md">
              {t.featured}
            </span>
          )}

          {food.spicyLevel !== undefined && food.spicyLevel > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-950/70 border border-red-500/50 text-red-300 text-xs font-medium backdrop-blur-md">
              <Flame className="w-3 h-3 text-red-400" />
              {'🌶️'.repeat(food.spicyLevel)}
            </span>
          )}

          {showPrepTime && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/70 border border-zinc-700/60 text-zinc-300 text-xs backdrop-blur-md">
              <Clock className="w-3 h-3 text-zinc-400" />
              {food.preparationTime} {t.mins}
            </span>
          )}

          {showCalories && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/70 border border-zinc-700/60 text-zinc-300 text-xs backdrop-blur-md">
              {food.calories} {t.kcal}
            </span>
          )}
        </div>

        {/* Favorite Button */}
        {showFavoriteBtn && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`p-2.5 rounded-full transition-all duration-300 backdrop-blur-md border cursor-pointer ${
              isFavorite
                ? 'bg-red-500/25 border-red-400/70 text-red-400 scale-110 shadow-lg shadow-red-500/25'
                : 'bg-black/50 border-white/15 text-zinc-400 hover:text-white hover:bg-black/70 active:scale-90'
            }`}
          >
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-400 text-red-400' : ''}`} />
          </button>
        )}
      </div>

      {/* Food Title & Tagline */}
      <div className="space-y-1 mb-2">
        <h2 className={`text-2xl sm:text-3xl font-bold tracking-wide text-zinc-50 drop-shadow-md leading-tight ${theme.textClass}`}>
          {food.name}
        </h2>
        {food.tagline && (
          <p className="text-sm sm:text-base text-amber-200/90 font-medium italic tracking-wide line-clamp-1 drop-shadow-sm">
            {food.tagline}
          </p>
        )}
      </div>

      {/* Short Description */}
      <p className="text-xs sm:text-sm text-zinc-300/90 line-clamp-2 leading-relaxed mb-4 max-w-xl drop-shadow">
        {food.description}
      </p>

      {/* Action Row: Price, Details & Add To Cart */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
        {showPrices ? (
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium">
              {t.subtotal}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-serif-luxury text-2xl sm:text-3xl font-extrabold gold-gradient-text tracking-tight">
                {food.currencySymbol}{food.price.toFixed(2)}
              </span>
            </div>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          {showDetailsBtn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails();
              }}
              className="group inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-black/60 border border-white/20 text-zinc-200 hover:text-white hover:bg-black/80 font-medium text-xs tracking-wider uppercase transition-all backdrop-blur-md active:scale-95 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-amber-400 transition-transform group-hover:rotate-12" />
              <span>{t.viewDetails}</span>
            </button>
          )}

          {showOrderBtn && onAddToCart && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(food);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-black font-bold text-xs tracking-wider uppercase transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-black stroke-[3]" />
              <span>{t.addToCart}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
