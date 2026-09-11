import React from 'react';
import { motion } from 'framer-motion';
import type { Category, FoodItem, RestaurantSettings } from '../../types';
import { FoodInfo } from './FoodInfo';
import { FoodMedia } from './FoodMedia';

interface FoodSlideProps {
  food: FoodItem;
  category?: Category;
  isActive: boolean;
  isFavorite: boolean;
  shouldPreload?: boolean;
  presentationMode?: string;
  settings?: Partial<RestaurantSettings>;
  language?: string;
  onToggleFavorite: () => void;
  onOpenDetails: (food: FoodItem) => void;
  onAddToCart?: (food: FoodItem) => void;
}

export const FoodSlide: React.FC<FoodSlideProps> = ({
  food,
  category,
  isActive,
  isFavorite,
  shouldPreload = true,
  presentationMode = 'INDIVIDUAL_VIDEO',
  settings,
  language,
  onToggleFavorite,
  onOpenDetails,
  onAddToCart,
}) => {
  return (
    <section
      data-food-id={food.id}
      data-category-id={food.categoryId}
      className="relative w-full h-full min-h-full snap-feed-item overflow-hidden select-none bg-black"
    >
      {/* Background Media */}
      <FoodMedia
        food={food}
        isActive={isActive}
        resetOnDeactivate={true}
        shouldPreload={shouldPreload}
        presentationMode={presentationMode}
        settings={settings}
      />

      {/* Content overlay with smooth entrance */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0.6, y: 12 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <FoodInfo
          food={food}
          category={category}
          isFavorite={isFavorite}
          settings={settings}
          language={language}
          onToggleFavorite={onToggleFavorite}
          onOpenDetails={() => onOpenDetails(food)}
          onAddToCart={onAddToCart}
        />
      </motion.div>
    </section>
  );
};
