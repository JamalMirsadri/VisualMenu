import React, { useEffect, useRef } from 'react';
import { Cake, Flame, Leaf, Sparkles, Utensils, Wine } from 'lucide-react';
import type { Category, RestaurantSettings } from '../../types';
import { resolveTheme } from '../../theme/useTheme';

interface CategoryNavProps {
  categories: Category[];
  activeCategoryId?: string;
  onSelectCategory: (categoryId: string) => void;
  settings?: Partial<RestaurantSettings>;
}

const getCategoryIcon = (iconName?: string) => {
  switch (iconName?.toLowerCase()) {
    case 'sparkles':
      return <Sparkles className="w-3.5 h-3.5" />;
    case 'utensils':
      return <Utensils className="w-3.5 h-3.5" />;
    case 'flame':
      return <Flame className="w-3.5 h-3.5" />;
    case 'leaf':
      return <Leaf className="w-3.5 h-3.5" />;
    case 'cake':
      return <Cake className="w-3.5 h-3.5" />;
    case 'wine':
      return <Wine className="w-3.5 h-3.5" />;
    default:
      return <Utensils className="w-3.5 h-3.5" />;
  }
};

export const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  activeCategoryId,
  onSelectCategory,
  settings,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const theme = resolveTheme(settings);
  const style = theme.categoryStyle;

  // Auto-scroll active category into center view smoothly
  useEffect(() => {
    if (!activeCategoryId || !scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector<HTMLElement>(`[data-cat-id="${activeCategoryId}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeCategoryId]);

  return (
    <nav
      aria-label="Menu categories"
      className="w-full overflow-hidden z-30 pointer-events-auto"
    >
      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4 py-2"
      >
        {categories.map((category) => {
          const isActive = category.id === activeCategoryId;

          if (style === 'TEXT') {
            return (
              <button
                key={category.id}
                data-cat-id={category.id}
                onClick={() => onSelectCategory(category.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium tracking-wider uppercase transition-all duration-300 cursor-pointer ${
                  isActive
                    ? 'text-amber-400 font-bold border-b-2 border-amber-400'
                    : 'text-zinc-400 hover:text-zinc-200 border-b-2 border-transparent'
                }`}
              >
                {category.name}
              </button>
            );
          }

          if (style === 'MINIMAL') {
            return (
              <button
                key={category.id}
                data-cat-id={category.id}
                onClick={() => onSelectCategory(category.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium tracking-wide transition-all duration-300 cursor-pointer ${
                  isActive
                    ? 'text-amber-400 font-bold bg-amber-500/15 border border-amber-400/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {category.name}
              </button>
            );
          }

          // Default: PILLS or ICON_PLUS_TEXT
          return (
            <button
              key={category.id}
              data-cat-id={category.id}
              onClick={() => onSelectCategory(category.id)}
              aria-current={isActive ? 'true' : undefined}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all duration-300 cursor-pointer backdrop-blur-md select-none ${
                isActive
                  ? 'bg-amber-500/30 border border-amber-400 text-amber-200 shadow-lg shadow-amber-500/20 scale-105'
                  : 'bg-black/50 border border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-black/70 active:scale-95'
              }`}
            >
              <span className={isActive ? 'text-amber-400' : 'text-zinc-400'}>
                {getCategoryIcon(category.icon)}
              </span>
              <span>{category.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
