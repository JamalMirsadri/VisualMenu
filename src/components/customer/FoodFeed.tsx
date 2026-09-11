import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  MapPin,
  Phone,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { Category, FoodItem, Restaurant } from '../../types';
import { useCart } from '../../context/CartContext';
import { getTranslations } from '../../i18n/translations';
import { CategoryNav } from './CategoryNav';
import { FoodDetailsModal } from './FoodDetailsModal';
import { FoodSlide } from './FoodSlide';
import { MenuHeader } from './MenuHeader';
import { ProgressIndicator } from './ProgressIndicator';
import { LuxuryFoodFallback } from './LuxuryFoodFallback';
import { SinglePlayVideo } from './SinglePlayVideo';

export interface FoodFeedProps {
  restaurant: Restaurant;
  categories: Category[];
  foods: FoodItem[];
  favorites: string[];
  onToggleFavorite: (foodId: string) => void;
  language?: string;
  mode?: 'mobile' | 'tablet' | 'desktop' | 'auto';
  onActiveFoodChange?: (food: FoodItem) => void;
}

export const FoodFeed: React.FC<FoodFeedProps> = ({
  restaurant,
  categories,
  foods,
  favorites,
  onToggleFavorite,
  language,
  mode = 'auto',
  onActiveFoodChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedFoodForDetails, setSelectedFoodForDetails] = useState<FoodItem | null>(null);
  const isScrollingRef = useRef(false);

  const { addItem, tableNumber } = useCart();
  const t = getTranslations(language || restaurant.settings?.language);
  const isMobileOnly = mode === 'mobile';

  // Map categoryId to Category object
  const categoryMap = useRef(new Map<string, Category>());
  useEffect(() => {
    categoryMap.current = new Map(categories.map((c) => [c.id, c]));
  }, [categories]);

  // Current active food item
  const currentFood = foods[activeIndex] || foods[0];
  const activeCategoryId = currentFood?.categoryId;
  const currentCategory = currentFood ? categoryMap.current.get(currentFood.categoryId) : undefined;

  // Notify parent component when active food changes (for inspector/context panel)
  useEffect(() => {
    if (currentFood && onActiveFoodChange) {
      onActiveFoodChange(currentFood);
    }
  }, [currentFood, onActiveFoodChange]);

  // Track active slide using IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const slides = container.querySelectorAll<HTMLElement>('.snap-feed-item');
    if (!slides.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            const index = Array.from(slides).indexOf(entry.target as HTMLElement);
            if (index !== -1) {
              setActiveIndex((prev) => (prev === index ? prev : index));
            }
          }
        });
      },
      {
        root: container,
        threshold: [0.55, 0.75],
      }
    );

    slides.forEach((slide) => observer.observe(slide));

    return () => {
      observer.disconnect();
    };
  }, [foods]);

  // Scroll to index utility respecting reduced motion
  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const slides = container.querySelectorAll<HTMLElement>('.snap-feed-item');
    if (slides[index]) {
      isScrollingRef.current = true;
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      slides[index].scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      setActiveIndex(index);
      setTimeout(() => {
        isScrollingRef.current = false;
      }, prefersReducedMotion ? 50 : 500);
    }
  }, []);

  // Keyboard navigation for desktop (ArrowUp / ArrowDown / PageUp / PageDown / j / k)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedFoodForDetails) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault();
        if (activeIndex < foods.length - 1) {
          scrollToIndex(activeIndex + 1);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault();
        if (activeIndex > 0) {
          scrollToIndex(activeIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, foods.length, scrollToIndex, selectedFoodForDetails]);

  // Jump to Category
  const handleSelectCategory = (categoryId: string) => {
    const targetIndex = foods.findIndex((f) => f.categoryId === categoryId);
    if (targetIndex !== -1) {
      scrollToIndex(targetIndex);
    }
  };

  if (!foods || foods.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100svh] w-full bg-zinc-950 text-zinc-300 p-6 text-center">
        <h2 className="font-serif-luxury text-2xl text-amber-400 font-bold mb-2">No Menu Items Available</h2>
        <p className="text-sm text-zinc-400 max-w-sm mb-6">
          The menu is currently being updated by the chef. Please check back shortly or visit the administration panel to activate items.
        </p>
        <a
          href="/admin"
          className="px-6 py-2.5 rounded-full bg-amber-500 text-black font-semibold text-xs tracking-wider uppercase"
        >
          Open Admin Panel
        </a>
      </div>
    );
  }

  return (
    <main className={`relative w-full overflow-hidden bg-black flex items-center justify-center ${isMobileOnly ? 'h-full' : 'h-[100svh]'}`}>
      {/* Desktop Ambient Background Blur */}
      {!isMobileOnly && currentFood && (
        <div
          className="hidden lg:block absolute inset-0 bg-cover bg-center blur-3xl opacity-20 transition-all duration-1000 scale-110 pointer-events-none"
          style={{ backgroundImage: `url(${currentFood.image})` }}
        />
      )}
      {!isMobileOnly && (
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/90 pointer-events-none" />
      )}

      {/* Desktop Left Ambient Sidebar */}
      {!isMobileOnly && (
        <aside className="hidden xl:flex flex-col justify-between w-80 h-full p-8 z-20 text-zinc-300 select-none">
          <div>
            <div className="flex items-center gap-3 mb-6">
              {restaurant.logo ? (
                <img
                  src={restaurant.logo}
                  alt={restaurant.name}
                  className="w-12 h-12 rounded-2xl object-cover border border-amber-400/40 shadow-md"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 font-serif font-bold text-lg">
                  {restaurant.name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="font-serif-luxury text-lg font-bold text-white tracking-wide">
                  {restaurant.name}
                </h1>
                <p className="text-xs text-amber-400/80 font-medium line-clamp-1">
                  {restaurant.tagline}
                </p>
              </div>
            </div>

            {restaurant.description && (
              <p className="text-xs text-zinc-400 leading-relaxed mb-6 line-clamp-3">
                {restaurant.description}
              </p>
            )}

            {/* Quick Categories Navigation */}
            <div className="space-y-1 mb-8">
              <h3 className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
                {t.categories}
              </h3>
              <div className="space-y-1 max-h-56 overflow-y-auto no-scrollbar">
                {categories.map((cat) => {
                  const isSelected = cat.id === activeCategoryId;
                  const count = foods.filter((f) => f.categoryId === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-zinc-400">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Desktop Shortcuts & Restaurant Details */}
          <div className="space-y-4 pt-4 border-t border-white/10 text-[11px] text-zinc-400">
            {tableNumber && (
              <div className="flex items-center gap-2 text-amber-300 font-medium">
                <MapPin className="w-3.5 h-3.5" />
                <span>{t.table} #{tableNumber}</span>
              </div>
            )}
            {restaurant.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="line-clamp-1">{restaurant.address}</span>
              </div>
            )}
            {restaurant.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>{restaurant.phone}</span>
              </div>
            )}

            <div className="pt-2 flex items-center gap-1 text-[10px] text-zinc-500">
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-bold">↑</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-bold">↓</span>
              <span className="ml-1">or</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-bold">J</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-bold">K</span>
              <span className="ml-1">to navigate</span>
            </div>
          </div>
        </aside>
      )}

      {/* Main Interactive Mobile Simulator Viewport */}
      <div className={
        isMobileOnly
          ? 'relative w-full h-full overflow-hidden bg-zinc-950 select-none'
          : 'relative w-full max-w-lg md:max-w-md h-[100svh] overflow-hidden bg-zinc-950 shadow-2xl lg:rounded-[36px] lg:border lg:border-amber-500/20 lg:my-4'
      }>
        {/* Floating Top Controls: Header + Category Bar */}
        <div className="absolute inset-x-0 top-0 z-30 flex flex-col pointer-events-none">
          <MenuHeader restaurant={restaurant} />
          <CategoryNav
            categories={categories}
            activeCategoryId={activeCategoryId}
            onSelectCategory={handleSelectCategory}
            settings={restaurant.settings}
          />
        </div>

        {/* Vertical Feed Container with Native Smooth Snap */}
        <div
          ref={containerRef}
          className="w-full h-full snap-feed-container no-scrollbar"
        >
          {foods.map((food, index) => {
            const isSlideActive = index === activeIndex;
            const shouldPreload = Math.abs(index - activeIndex) <= 1;
            const presentationMode = restaurant.settings?.presentationMode || 'INDIVIDUAL_VIDEO';

            return (
              <FoodSlide
                key={food.id}
                food={food}
                category={categoryMap.current.get(food.categoryId)}
                isActive={isSlideActive}
                isFavorite={favorites.includes(food.id)}
                shouldPreload={shouldPreload}
                presentationMode={presentationMode}
                settings={restaurant.settings}
                language={language}
                onToggleFavorite={() => onToggleFavorite(food.id)}
                onOpenDetails={(item) => setSelectedFoodForDetails(item)}
                onAddToCart={(item) => addItem(item)}
              />
            );
          })}
        </div>

        {/* Progress Counter (e.g. 03 / 14) */}
        <ProgressIndicator
          currentIndex={activeIndex}
          total={foods.length}
        />

        {/* Desktop Quick Up/Down Navigation Buttons */}
        {!isMobileOnly && (
          <div className="hidden sm:flex flex-col gap-2 absolute left-4 bottom-28 z-20 pointer-events-auto">
            <button
              onClick={() => activeIndex > 0 && scrollToIndex(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="Previous item"
              className={`p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 transition-all ${
                activeIndex === 0
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-black/90 hover:scale-110 active:scale-95 text-white cursor-pointer'
              }`}
            >
              <ChevronUp className="w-5 h-5 text-amber-400" />
            </button>
            <button
              onClick={() => activeIndex < foods.length - 1 && scrollToIndex(activeIndex + 1)}
              disabled={activeIndex === foods.length - 1}
              aria-label="Next item"
              className={`p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 transition-all ${
                activeIndex === foods.length - 1
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-black/90 hover:scale-110 active:scale-95 text-white cursor-pointer'
              }`}
            >
              <ChevronDown className="w-5 h-5 text-amber-400" />
            </button>
          </div>
        )}

        {/* Details Drawer / Modal */}
        <FoodDetailsModal
          food={selectedFoodForDetails}
          category={selectedFoodForDetails ? categoryMap.current.get(selectedFoodForDetails.categoryId) : undefined}
          isOpen={Boolean(selectedFoodForDetails)}
          onClose={() => setSelectedFoodForDetails(null)}
          contained={isMobileOnly}
        />
      </div>

      {/* Desktop Right Ambient Sidebar: Active Dish Spotlight */}
      {!isMobileOnly && (
        <aside className="hidden xl:flex flex-col justify-between w-80 h-full p-8 z-20 text-zinc-300 select-none">
          {currentFood ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] uppercase tracking-widest text-amber-400 font-bold">
                  Active Selection
                </span>
              </div>

              <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-amber-500/20 shadow-xl bg-zinc-950">
                {currentFood.image ? (
                  <img
                    src={currentFood.image}
                    alt={currentFood.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : currentFood.video ? (
                  <SinglePlayVideo
                    src={currentFood.video}
                    activationKey={currentFood.id}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <LuxuryFoodFallback
                    name={currentFood.name}
                    categoryName={currentCategory?.name}
                    tagline={currentFood.tagline}
                    compact={false}
                  />
                )}
                {currentCategory && (
                  <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-[10px] text-amber-300 font-medium z-10">
                    {currentCategory.name}
                  </div>
                )}
              </div>

              <div>
                <h2 className="font-serif-luxury text-xl font-bold text-white mb-1">
                  {currentFood.name}
                </h2>
                {currentFood.tagline && (
                  <p className="text-xs text-amber-300/80 italic mb-2">
                    {currentFood.tagline}
                  </p>
                )}
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {currentFood.description}
                </p>
              </div>

              {/* Badges: Prep time, spicy, calories */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {currentFood.preparationTime && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-700/60 text-zinc-300">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    {currentFood.preparationTime} {t.mins}
                  </span>
                )}
                {currentFood.calories && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-700/60 text-zinc-300">
                    {currentFood.calories} {t.kcal}
                  </span>
                )}
                {currentFood.spicyLevel !== undefined && currentFood.spicyLevel > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-950/70 border border-red-500/50 text-red-300">
                    <Flame className="w-3 h-3 text-red-400" />
                    Spicy
                  </span>
                )}
              </div>

              {/* Ingredients overview */}
              {currentFood.ingredients && currentFood.ingredients.length > 0 && (
                <div>
                  <h4 className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-2">
                    {t.ingredients}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {currentFood.ingredients.map((ing, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300"
                      >
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Allergens overview */}
              {currentFood.allergens && currentFood.allergens.length > 0 && (
                <div>
                  <h4 className="text-[11px] uppercase tracking-wider text-red-400/80 font-bold mb-2">
                    {t.allergens}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {currentFood.allergens.map((alg, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-red-950/50 border border-red-900/50 text-[11px] text-red-300"
                      >
                        {alg}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div />
          )}

          {/* Quick Add To Tray */}
          {currentFood && (
            <div className="pt-6 border-t border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-zinc-400">{t.total}</span>
                <span className="font-serif-luxury text-xl font-bold text-amber-400">
                  {currentFood.currencySymbol}{currentFood.price.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() => addItem(currentFood)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-amber-500/25 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>{t.addToCart}</span>
              </button>
            </div>
          )}
        </aside>
      )}
    </main>
  );
};
