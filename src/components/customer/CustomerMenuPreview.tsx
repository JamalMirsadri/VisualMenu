import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import type { Category, FoodItem, Restaurant } from '../../types';
import { CartProvider, useCart } from '../../context/CartContext';
import { FoodFeed } from './FoodFeed';
import { CartDrawer } from './CartDrawer';

export interface CustomerMenuPreviewProps {
  restaurant: Restaurant;
  categories: Category[];
  foods: FoodItem[];
  favorites: string[];
  onToggleFavorite: (foodId: string) => void;
  language?: string;
  mode?: 'mobile' | 'tablet' | 'desktop' | 'auto';
  onActiveFoodChange?: (food: FoodItem) => void;
  className?: string;
}

const CustomerMenuPreviewInner: React.FC<CustomerMenuPreviewProps> = ({
  restaurant,
  categories,
  foods,
  favorites,
  onToggleFavorite,
  language,
  mode = 'mobile',
  onActiveFoodChange,
  className = '',
}) => {
  const { setRestaurantContext, totalItemsCount, totalEstimate, openCart } = useCart();

  useEffect(() => {
    if (restaurant) {
      setRestaurantContext(restaurant.slug, restaurant.currencySymbol, restaurant.settings);
    }
  }, [restaurant, setRestaurantContext]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-black select-none ${className}`}>
      {/* Core production FoodFeed with viewport isolation mode */}
      <FoodFeed
        restaurant={restaurant}
        categories={categories}
        foods={foods}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        language={language}
        mode={mode}
        onActiveFoodChange={onActiveFoodChange}
      />

      {/* Floating Bottom Cart Bar inside simulator */}
      <AnimatePresence>
        {totalItemsCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-sm"
          >
            <button
              onClick={openCart}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-neutral-950 font-bold text-sm tracking-wide shadow-2xl shadow-amber-500/30 flex items-center justify-between border border-amber-300/40 hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-black/20 flex items-center justify-center text-neutral-950 font-black text-xs">
                  {totalItemsCount}
                </div>
                <span>View Order Tray</span>
              </div>
              <div className="flex items-center gap-2 font-black text-base">
                <span>{restaurant.currencySymbol}{totalEstimate.toFixed(2)}</span>
                <ShoppingBag className="w-4 h-4" />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contained Cart Drawer inside simulator frame */}
      <CartDrawer contained />
    </div>
  );
};

export const CustomerMenuPreview: React.FC<CustomerMenuPreviewProps> = (props) => {
  return (
    <CartProvider>
      <CustomerMenuPreviewInner {...props} />
    </CartProvider>
  );
};
