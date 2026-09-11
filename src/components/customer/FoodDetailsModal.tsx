import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Clock, Flame, Sparkles, Utensils, X } from 'lucide-react';
import type { Category, FoodItem } from '../../types';
import { useCart } from '../../context/CartContext';
import { LuxuryFoodFallback } from './LuxuryFoodFallback';
import { SinglePlayVideo } from './SinglePlayVideo';

interface FoodDetailsModalProps {
  food: FoodItem | null;
  category?: Category;
  isOpen: boolean;
  onClose: () => void;
  contained?: boolean;
}

export const FoodDetailsModal: React.FC<FoodDetailsModalProps> = ({
  food,
  category,
  isOpen,
  onClose,
  contained = false,
}) => {
  const { addItem, openCart } = useCart();
  const [quantity, setQuantity] = useState<number>(1);
  const [itemNote, setItemNote] = useState<string>('');
  const [addedToast, setAddedToast] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);

  if (!food) return null;

  const hasImage = Boolean(food.image && food.image.trim() && !imageError);
  const hasVideo = Boolean(food.video && food.video.trim());

  const handleAddToOrder = () => {
    addItem(food, quantity, itemNote.trim() || undefined);
    setAddedToast(true);
    setTimeout(() => {
      setAddedToast(false);
      onClose();
      openCart();
    }, 600);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={`${contained ? 'absolute' : 'fixed'} inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4`}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal / Sheet Container */}
          <motion.div
            initial={{ y: '100%', opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={`relative w-full max-w-xl ${contained ? 'max-h-[85%]' : 'max-h-[85vh] sm:max-h-[90vh]'} overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-zinc-950 border border-amber-500/30 text-zinc-100 shadow-2xl shadow-amber-500/10 no-scrollbar z-10`}
          >
            {/* Header Image with close button */}
            <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-zinc-900">
              {hasImage ? (
                <img
                  src={food.image!}
                  alt={food.name}
                  className="w-full h-full object-cover"
                  onError={() => setImageError(true)}
                />
              ) : hasVideo ? (
                <SinglePlayVideo
                  src={food.video!}
                  activationKey={food.id}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <LuxuryFoodFallback
                  name={food.name}
                  categoryName={category?.name}
                  tagline={food.tagline}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={onClose}
                aria-label="Close details"
                className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-black hover:scale-105 transition-all active:scale-95 z-20"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Category & Featured tag on image */}
              <div className="absolute bottom-3 left-5 flex items-center gap-2">
                {category && (
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
                    {category.name}
                  </span>
                )}
                {food.featured && (
                  <span className="px-3 py-1 rounded-full bg-yellow-400 text-black text-xs font-bold uppercase tracking-wider">
                    Chef Special
                  </span>
                )}
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-6">
              {/* Title & Price Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-wide">
                    {food.name}
                  </h3>
                  {food.tagline && (
                    <p className="text-amber-300/90 text-sm font-medium italic mt-1">
                      {food.tagline}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[10px] uppercase tracking-widest text-zinc-400">Price</span>
                  <span className="font-serif-luxury text-2xl sm:text-3xl font-bold gold-gradient-text">
                    {food.currencySymbol}{food.price.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Detailed Description */}
              <div className="space-y-2">
                <h4 className="text-xs uppercase tracking-widest text-zinc-400 font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Culinary Profile
                </h4>
                <p className="text-sm sm:text-base text-zinc-300 leading-relaxed bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/80">
                  {food.description}
                </p>
              </div>

              {/* Quick Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {food.preparationTime && (
                  <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <span className="block text-[10px] uppercase text-zinc-400">Prep Time</span>
                      <span className="text-sm font-semibold text-zinc-200">{food.preparationTime} Mins</span>
                    </div>
                  </div>
                )}

                {food.calories && (
                  <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-center gap-3">
                    <Utensils className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <span className="block text-[10px] uppercase text-zinc-400">Energy</span>
                      <span className="text-sm font-semibold text-zinc-200">{food.calories} kcal</span>
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-center gap-3">
                  <Flame className={`w-5 h-5 ${food.spicyLevel ? 'text-red-400' : 'text-zinc-500'} shrink-0`} />
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-400">Spiciness</span>
                    <span className="text-sm font-semibold text-zinc-200">
                      {food.spicyLevel && food.spicyLevel > 0
                        ? `Level ${food.spicyLevel} ${'🌶️'.repeat(food.spicyLevel)}`
                        : 'Mild / None'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ingredients */}
              {food.ingredients && food.ingredients.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs uppercase tracking-widest text-zinc-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    Key Ingredients & Elements
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {food.ingredients.map((item, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-medium"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Allergens Warning */}
              <div className="space-y-2">
                <h4 className="text-xs uppercase tracking-widest text-zinc-400 font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  Allergen Advisory
                </h4>
                {food.allergens && food.allergens.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {food.allergens.map((allergen, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-md bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs font-semibold"
                      >
                        Contains: {allergen}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No major recognized common allergens reported.</p>
                )}
              </div>

              {/* Action & Order Controls */}
              <div className="pt-2 border-t border-zinc-800 space-y-4">
                {/* Special Request / Note Input */}
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold flex items-center justify-between">
                    <span>Special Instructions</span>
                    <span className="text-zinc-500 font-normal">Optional</span>
                  </label>
                  <input
                    type="text"
                    value={itemNote}
                    onChange={(e) => setItemNote(e.target.value)}
                    placeholder="e.g. Extra sauce, no salt, gluten-friendly..."
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="flex items-center gap-3">
                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 transition text-lg"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-white">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 transition text-lg"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  {/* Add to Order Button */}
                  <button
                    onClick={handleAddToOrder}
                    disabled={!food.available}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-bold text-sm tracking-wide shadow-lg shadow-amber-500/20 flex items-center justify-between transition disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span>{addedToast ? 'Added to Order!' : 'Add to Order'}</span>
                    </span>
                    <span>
                      {food.currencySymbol}
                      {(food.price * quantity).toFixed(2)}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
