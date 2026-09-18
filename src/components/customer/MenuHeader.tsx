import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Info, MapPin, Phone, ShieldCheck, ShoppingBag, Gift, Gamepad2, X } from 'lucide-react';
import type { Restaurant } from '../../types';
import { useCart } from '../../context/CartContext';
import { CustomerLoyaltyPanel } from './CustomerLoyaltyPanel';
import { CustomerGameLobby } from './CustomerGameLobby';
import { customerGameService, type GameConfigDto } from '../../services/customerGameService';

interface MenuHeaderProps {
  restaurant: Restaurant;
  table?: { id: string; number?: string; name?: string } | null;
}

export const MenuHeader: React.FC<MenuHeaderProps> = ({ restaurant, table }) => {
  const [showInfo, setShowInfo] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showLoyalty, setShowLoyalty] = useState(false);
  const [showGameLobby, setShowGameLobby] = useState(false);
  const [gameConfig, setGameConfig] = useState<GameConfigDto | null>(null);
  const [currentLang, setCurrentLang] = useState<string>(() => {
    return restaurant.settings?.language || 'en';
  });
  const { tableNumber, totalItemsCount, openCart } = useCart();

  const selectLanguage = (lang: string) => {
    setCurrentLang(lang);
    setShowLangMenu(false);
    const isRtl = lang === 'fa' || lang === 'ar' || lang === 'he';
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
  };

  useEffect(() => {
    let cancelled = false;
    customerGameService
      .getConfig(restaurant.id)
      .then((cfg) => {
        if (!cancelled && cfg.enabled) setGameConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setGameConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurant.id]);

  return (
    <>
      <header className="w-full px-4 pt-3 pb-1 flex items-center justify-between z-30 pointer-events-auto">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5">
          {restaurant.logo ? (
            <img
              src={restaurant.logo}
              alt={restaurant.name}
              className="w-8 h-8 rounded-full object-cover border border-amber-400/40 shadow-sm"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 font-serif font-bold text-sm">
              A
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif-luxury text-sm font-bold tracking-widest uppercase text-white drop-shadow">
                {restaurant.name}
              </h1>
              {tableNumber && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold tracking-wide flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" /> T-{tableNumber}
                </span>
              )}
            </div>
            <p className="text-[10px] text-amber-300/80 tracking-wide line-clamp-1 max-w-[180px] sm:max-w-xs">
              {restaurant.tagline}
            </p>
          </div>
        </div>

        {/* Right side controls: Language switcher, Cart Drawer Trigger, Restaurant Info Modal & Admin Shortcut */}
        <div className="flex items-center gap-2">
          {/* Language Switcher Button */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              aria-label="Change language"
              className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:bg-black/60 active:scale-95 transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
            >
              <Globe className="w-4 h-4 text-amber-400" />
              <span className="uppercase">{currentLang}</span>
            </button>

            {showLangMenu && (
              <div className="absolute top-10 right-0 z-50 py-1 px-1 rounded-xl bg-zinc-900 border border-amber-500/30 shadow-2xl backdrop-blur-xl flex flex-col gap-0.5 min-w-[110px]">
                <button
                  onClick={() => selectLanguage('en')}
                  className={`px-3 py-1.5 rounded-lg text-left text-xs transition-colors flex items-center justify-between ${
                    currentLang === 'en' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span>English</span>
                  <span className="text-[10px] uppercase font-mono opacity-70">EN</span>
                </button>
                <button
                  onClick={() => selectLanguage('pt')}
                  className={`px-3 py-1.5 rounded-lg text-left text-xs transition-colors flex items-center justify-between ${
                    currentLang === 'pt' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span>Português</span>
                  <span className="text-[10px] uppercase font-mono opacity-70">PT</span>
                </button>
                <button
                  onClick={() => selectLanguage('fa')}
                  className={`px-3 py-1.5 rounded-lg text-left text-xs transition-colors flex items-center justify-between ${
                    currentLang === 'fa' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span>فارسی</span>
                  <span className="text-[10px] uppercase font-mono opacity-70">FA</span>
                </button>
              </div>
            )}
          </div>

          {/* Cart / Tray Button */}
          <button
            onClick={openCart}
            aria-label="View tray"
            className="relative p-2 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 active:scale-95 transition-all cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-neutral-950 font-black text-[10px] flex items-center justify-center shadow-md animate-pulse">
                {totalItemsCount}
              </span>
            )}
          </button>

          {/* My Loyalty Button */}
          <button
            onClick={() => setShowLoyalty(true)}
            aria-label="My loyalty"
            className="relative p-2 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 active:scale-95 transition-all cursor-pointer"
          >
            <Gift className="w-4 h-4" />
          </button>

          {/* Play While You Wait Button */}
          {gameConfig?.enabled && (
            <button
              onClick={() => setShowGameLobby(true)}
              aria-label="Play while you wait"
              className="relative p-2 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 active:scale-95 transition-all cursor-pointer"
            >
              <Gamepad2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setShowInfo(true)}
            aria-label="Restaurant information"
            className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:bg-black/60 active:scale-95 transition-all cursor-pointer"
          >
            <Info className="w-4 h-4 text-amber-400" />
          </button>

          <Link
            to="/admin"
            title="Open Admin Panel"
            className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-amber-300 hover:bg-black/60 active:scale-95 transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Restaurant Info Dialog */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-zinc-950 border border-amber-500/30 rounded-2xl p-6 text-zinc-100 shadow-2xl">
            <button
              onClick={() => setShowInfo(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              {restaurant.logo && (
                <img
                  src={restaurant.logo}
                  alt={restaurant.name}
                  className="w-12 h-12 rounded-full object-cover border border-amber-400/40"
                />
              )}
              <div>
                <h3 className="font-serif-luxury text-xl font-bold text-white">
                  {restaurant.name}
                </h3>
                <p className="text-xs text-amber-300/80">{restaurant.tagline}</p>
              </div>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed mb-6">
              {restaurant.description}
            </p>

            <div className="space-y-3 text-xs text-zinc-300 border-t border-zinc-800 pt-4">
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{restaurant.address}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-amber-400 shrink-0" />
                <a href={`tel:${restaurant.phone}`} className="hover:text-amber-300 underline">
                  {restaurant.phone}
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-amber-400 shrink-0" />
                <a
                  href={restaurant.website}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-amber-300 underline"
                >
                  {restaurant.website}
                </a>
              </div>
              <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 mt-2">
                <span className="block font-semibold text-amber-300 mb-1">Opening Hours</span>
                <span className="text-zinc-400">{restaurant.openingHours}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* My Loyalty Panel */}
      {showLoyalty && (
        <CustomerLoyaltyPanel
          restaurant={restaurant}
          onClose={() => setShowLoyalty(false)}
        />
      )}

      {/* Play While You Wait Lobby */}
      {showGameLobby && gameConfig && (
        <CustomerGameLobby
          restaurant={restaurant}
          table={table ?? null}
          config={gameConfig}
          onClose={() => setShowGameLobby(false)}
        />
      )}
    </>
  );
};
