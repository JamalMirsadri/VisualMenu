import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FoodFeed } from '../components/customer/FoodFeed';
import { CartDrawer } from '../components/customer/CartDrawer';
import { CartProvider, useCart } from '../context/CartContext';
import { useMenuData } from '../hooks/useMenuData';
import { ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MenuPageContent: React.FC = () => {
  const { slug, tableNumber } = useParams<{ slug: string; tableNumber?: string }>();
  const {
    restaurant,
    categories,
    foods,
    table,
    favorites,
    toggleFavorite,
    loading,
    error,
    reload,
  } = useMenuData(slug, tableNumber);

  const { setRestaurantContext, setTableNumber, totalItemsCount, totalEstimate, addPulse, openCart } = useCart();

  // Auto-hide the floating "View Order Tray" bar a few seconds after each add,
  // leaving a compact cart button so it never blocks the "Add to Order" area.
  const [showFloatingTray, setShowFloatingTray] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (addPulse > 0) {
      setShowFloatingTray(true);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setShowFloatingTray(false);
        hideTimerRef.current = null;
      }, 2500);
    }
  }, [addPulse]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (restaurant) {
      setRestaurantContext(restaurant.slug, restaurant.currencySymbol, restaurant.settings);

      // Dynamically update document title and meta description for SEO
      document.title = `${restaurant.name} | ${restaurant.tagline || 'Visual Menu'}`;
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute(
        'content',
        restaurant.description || `${restaurant.name} interactive visual menu experience.`
      );

      // Dynamically update favicon if configured
      if (restaurant.favicon) {
        let linkIcon: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
        if (!linkIcon) {
          linkIcon = document.createElement('link');
          linkIcon.rel = 'icon';
          document.head.appendChild(linkIcon);
        }
        linkIcon.href = restaurant.favicon;
      }
    }
  }, [restaurant, setRestaurantContext]);

  useEffect(() => {
    if (table?.number) {
      setTableNumber(table.number);
    } else if (tableNumber) {
      setTableNumber(tableNumber);
    }
  }, [table, tableNumber, setTableNumber]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100svh] w-full bg-zinc-950 text-zinc-300 p-6 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <h2 className="font-serif-luxury text-xl text-amber-300 font-bold mb-1">AURA Menus</h2>
        <p className="text-xs text-zinc-400 tracking-wider uppercase">Loading live culinary experience...</p>
      </div>
    );
  }

  if (error || !restaurant) {
    const isServiceUnavailable =
      Boolean(error && (error.includes('temporarily unavailable') || error.includes('RESTAURANT_SERVICE_UNAVAILABLE') || error.includes('503')));

    return (
      <div className="flex flex-col items-center justify-center min-h-[100svh] w-full bg-zinc-950 text-zinc-300 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 text-amber-400">
          <ShoppingBag className="w-8 h-8 opacity-60" />
        </div>
        <h2 className="font-serif-luxury text-2xl text-amber-400 font-bold mb-2">
          {isServiceUnavailable ? 'Menu Temporarily Unavailable' : 'Menu Unavailable'}
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          {isServiceUnavailable
            ? "This restaurant's menu is temporarily unavailable. Please contact the restaurant."
            : error || 'Unable to locate this restaurant menu on the live network.'}
        </p>
        <button
          onClick={() => reload()}
          className="px-6 py-2.5 rounded-full bg-amber-500 text-black font-semibold text-xs tracking-wider uppercase hover:bg-amber-400 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!restaurant.isMenuActive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100svh] w-full bg-zinc-950 text-zinc-300 p-6 text-center">
        <h2 className="font-serif-luxury text-3xl text-amber-400 font-bold mb-2">Menu Currently Offline</h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          {restaurant.name} is currently updating their daily creations. Please check back during operational hours.
        </p>
        <a
          href="/admin"
          className="px-6 py-2.5 rounded-full bg-amber-500 text-black font-semibold text-xs tracking-wider uppercase"
        >
          Open Admin Dashboard
        </a>
      </div>
    );
  }

  return (
    <>
      <FoodFeed
        restaurant={restaurant}
        categories={categories}
        foods={foods}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
      />

      {/* Floating Bottom Cart Bar (appears briefly after an add, then auto-hides) */}
      <AnimatePresence>
        {totalItemsCount > 0 && showFloatingTray && (
          <motion.div
            key="order-tray"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-md"
          >
            <button
              onClick={openCart}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-neutral-950 font-bold text-sm tracking-wide shadow-2xl shadow-amber-500/30 flex items-center justify-between border border-amber-300/40 hover:scale-[1.02] active:scale-[0.98] transition-transform"
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

      {/* Compact cart reopen button (non-blocking, shown once tray hides) */}
      <AnimatePresence>
        {totalItemsCount > 0 && !showFloatingTray && (
          <motion.button
            key="cart-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={openCart}
            aria-label="Open order tray"
            className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 shadow-2xl shadow-amber-500/30 border border-amber-300/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          >
            <ShoppingBag className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 min-w-6 h-6 px-1 rounded-full bg-neutral-950 text-amber-300 text-xs font-black flex items-center justify-center border border-amber-400">
              {totalItemsCount}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <CartDrawer />
    </>
  );
};

export const MenuPage: React.FC = () => {
  return (
    <CartProvider>
      <MenuPageContent />
    </CartProvider>
  );
};
