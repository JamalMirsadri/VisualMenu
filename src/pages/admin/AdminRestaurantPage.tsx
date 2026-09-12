import React, { useEffect, useState } from 'react';
import {
  Check,
  Layers,
  Palette,
  Save,
  Shield,
  Sliders,
  Sparkles,
  Video,
} from 'lucide-react';
import { useAdminData } from '../../hooks/useAdminData';
import { settingsService } from '../../services/settingsService';
import { THEME_REGISTRY } from '../../theme/themeConfig';
import type { ThemeDefinition } from '../../theme/themeConfig';
import type { RestaurantSettings } from '../../types';

export const AdminRestaurantPage: React.FC = () => {
  const { restaurant, updateRestaurant, loading } = useAdminData();

  const [activeTab, setActiveTab] = useState<
    'identity' | 'theme' | 'typography' | 'stage' | 'toggles' | 'operations'
  >('identity');

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Restaurant base identity
  const [restaurantData, setRestaurantData] = useState({
    name: '',
    tagline: '',
    legalName: '',
    logo: '',
    coverImage: '',
    favicon: '',
    description: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    timezone: 'UTC',
    website: '',
    currency: 'EUR',
    currencySymbol: '€',
    primaryLanguage: 'en',
    secondaryLanguage: '',
    openingHours: '',
    isActive: true,
    isMenuActive: true,
  });

  // Settings state
  const [settingsData, setSettingsData] = useState<RestaurantSettings>({
    primaryColor: '#d4af37',
    secondaryColor: '#18181b',
    accentColor: '#d4af37',
    theme: 'DARK_LUXURY',
    presentationMode: 'INDIVIDUAL_VIDEO',
    language: 'en',
    secondaryLanguage: '',
    showPrices: true,
    showCalories: true,
    showPreparationTime: true,
    textStyle: 'SERIF',
    buttonStyle: 'PILL',
    cardStyle: 'ROUNDED_2XL',
    categoryStyle: 'PILLS',
    foodInfoPosition: 'BOTTOM',
    progressIndicatorStyle: 'BARS',
    lightingPreset: 'WARM',
    foodEntranceAnimation: 'FADE_UP',
    cameraMotion: 'GENTLE_ZOOM',
    showAllergens: true,
    showIngredients: true,
    showFavoriteButton: true,
    showDetailsButton: true,
    showOrderButton: true,
    taxEnabled: false,
    taxRate: '0.00',
    serviceChargeEnabled: false,
    serviceChargeRate: '0.00',
  });

  useEffect(() => {
    if (restaurant) {
      setRestaurantData({
        name: restaurant.name || '',
        tagline: restaurant.tagline || '',
        legalName: restaurant.legalName || '',
        logo: restaurant.logo || '',
        coverImage: restaurant.coverImage || '',
        favicon: restaurant.favicon || '',
        description: restaurant.description || '',
        phone: restaurant.phone || '',
        address: restaurant.address || '',
        city: restaurant.city || '',
        country: restaurant.country || '',
        timezone: restaurant.timezone || 'UTC',
        website: restaurant.website || '',
        currency: restaurant.currency || 'EUR',
        currencySymbol: restaurant.currencySymbol || '€',
        primaryLanguage: restaurant.defaultLanguage || restaurant.primaryLanguage || 'en',
        secondaryLanguage: restaurant.secondaryLanguage || '',
        openingHours: restaurant.openingHours || '',
        isActive: restaurant.isActive ?? true,
        isMenuActive: restaurant.isMenuActive ?? true,
      });

      if (restaurant.id) {
        settingsService
          .getByRestaurant(restaurant.id)
          .then((res: any) => {
            const loaded = res.data || res;
            if (loaded) {
              setSettingsData((prev) => ({ ...prev, ...loaded }));
            }
          })
          .catch(() => {
            if (restaurant.settings) {
              setSettingsData((prev) => ({ ...prev, ...restaurant.settings }));
            }
          });
      }
    }
  }, [restaurant]);

  const handleRestaurantChange = (field: string, value: any) => {
    setRestaurantData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSettingsChange = (field: string, value: any) => {
    setSettingsData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;
    try {
      setSaving(true);

      // 1. Update core Restaurant
      await updateRestaurant({
        ...restaurantData,
        theme: {
          ...restaurant.theme,
          primaryColor: settingsData.primaryColor,
          accentColor: settingsData.accentColor || settingsData.primaryColor,
        },
      });

      // 2. Update Restaurant Settings
      await settingsService.update(restaurant.id, settingsData);

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !restaurant) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="text-sm font-medium">Loading Branding Studio...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl font-bold text-white tracking-wide">
            Restaurant Branding Studio
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Customize complete brand identity, visual themes, presentation modes, typography, and operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-semibold animate-fade-in">
              <Check className="w-4 h-4" />
              <span>Saved Successfully</span>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-px overflow-x-auto no-scrollbar">
        {[
          { id: 'identity', label: 'Brand Identity', icon: Sparkles },
          { id: 'theme', label: 'Theme & Colors', icon: Palette },
          { id: 'typography', label: 'UI & Typography', icon: Layers },
          { id: 'stage', label: 'Presentation & Stage', icon: Video },
          { id: 'toggles', label: 'Display Toggles', icon: Sliders },
          { id: 'operations', label: 'Operations & Taxes', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer shrink-0 ${
                isActive
                  ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* TAB 1: BRAND IDENTITY */}
        {activeTab === 'identity' && (
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-6">
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Core Restaurant Identity
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Restaurant Name</label>
                <input
                  type="text"
                  value={restaurantData.name}
                  onChange={(e) => handleRestaurantChange('name', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Tagline</label>
                <input
                  type="text"
                  value={restaurantData.tagline}
                  onChange={(e) => handleRestaurantChange('tagline', e.target.value)}
                  placeholder="e.g. Modern Gastronomy & Cocktail Lounge"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Description / Story</label>
              <textarea
                rows={3}
                value={restaurantData.description}
                onChange={(e) => handleRestaurantChange('description', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs leading-relaxed"
              />
            </div>

            {/* Brand Assets */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-800/80">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Logo URL</label>
                <input
                  type="text"
                  value={restaurantData.logo}
                  onChange={(e) => handleRestaurantChange('logo', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs mb-2"
                />
                {restaurantData.logo && (
                  <img
                    src={restaurantData.logo}
                    alt="Logo preview"
                    className="w-12 h-12 rounded-xl object-cover border border-zinc-700"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Cover Image URL</label>
                <input
                  type="text"
                  value={restaurantData.coverImage}
                  onChange={(e) => handleRestaurantChange('coverImage', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs mb-2"
                />
                {restaurantData.coverImage && (
                  <img
                    src={restaurantData.coverImage}
                    alt="Cover preview"
                    className="w-24 h-12 rounded-xl object-cover border border-zinc-700"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Favicon URL (Browser Tab)</label>
                <input
                  type="text"
                  value={restaurantData.favicon}
                  onChange={(e) => handleRestaurantChange('favicon', e.target.value)}
                  placeholder="https://.../favicon.ico"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs mb-2"
                />
                {restaurantData.favicon && (
                  <img
                    src={restaurantData.favicon}
                    alt="Favicon preview"
                    className="w-7 h-7 rounded-md object-contain border border-zinc-700"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: THEME & COLORS */}
        {activeTab === 'theme' && (
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-6">
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Theme Engine & Color Palette
            </h2>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">
                Curated Theme Presets
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.values(THEME_REGISTRY).map((tDef: ThemeDefinition) => {
                  const isSelected = settingsData.theme === tDef.id;
                  return (
                    <button
                      key={tDef.id}
                      type="button"
                      onClick={() => handleSettingsChange('theme', tDef.id)}
                      className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden cursor-pointer ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10 scale-[1.02]'
                          : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-white">{tDef.name}</span>
                        <div
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: tDef.colors.accent }}
                        />
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                        {tDef.tagline}
                      </p>
                      <div
                        className="h-2 rounded-full w-full"
                        style={{
                          background: `linear-gradient(to right, ${tDef.colors.bg}, ${tDef.colors.accent})`,
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Palette */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-800">
              <div>
                <label className="block text-xs text-zinc-300 mb-1.5">Primary Brand Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settingsData.primaryColor || '#d4af37'}
                    onChange={(e) => handleSettingsChange('primaryColor', e.target.value)}
                    className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border border-zinc-700"
                  />
                  <input
                    type="text"
                    value={settingsData.primaryColor || '#d4af37'}
                    onChange={(e) => handleSettingsChange('primaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white font-mono text-xs uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1.5">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settingsData.accentColor || settingsData.primaryColor || '#d4af37'}
                    onChange={(e) => handleSettingsChange('accentColor', e.target.value)}
                    className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border border-zinc-700"
                  />
                  <input
                    type="text"
                    value={settingsData.accentColor || settingsData.primaryColor || '#d4af37'}
                    onChange={(e) => handleSettingsChange('accentColor', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white font-mono text-xs uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1.5">Secondary Base Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settingsData.secondaryColor || '#18181b'}
                    onChange={(e) => handleSettingsChange('secondaryColor', e.target.value)}
                    className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border border-zinc-700"
                  />
                  <input
                    type="text"
                    value={settingsData.secondaryColor || '#18181b'}
                    onChange={(e) => handleSettingsChange('secondaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white font-mono text-xs uppercase"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: UI & TYPOGRAPHY */}
        {activeTab === 'typography' && (
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-6">
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4" />
              UI Style, Shapes & Typography
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Typography Pairing</label>
                <select
                  value={settingsData.textStyle || 'SERIF'}
                  onChange={(e) => handleSettingsChange('textStyle', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="SERIF">Cinzel Luxury Serif + Clean Sans</option>
                  <option value="SANS">Plus Jakarta Sans Clean Modern</option>
                  <option value="MODERN">Geometric Bold Display</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Button Style</label>
                <select
                  value={settingsData.buttonStyle || 'PILL'}
                  onChange={(e) => handleSettingsChange('buttonStyle', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="PILL">Pill (Fully Rounded)</option>
                  <option value="ROUNDED">Modern Rounded (12px)</option>
                  <option value="SQUARE">Sharp Architectural</option>
                  <option value="OUTLINE">Subtle Outline</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Card Curvature</label>
                <select
                  value={settingsData.cardStyle || 'ROUNDED_2XL'}
                  onChange={(e) => handleSettingsChange('cardStyle', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="ROUNDED_LG">Subtle Rounded (12px)</option>
                  <option value="ROUNDED_XL">Modern Rounded (16px)</option>
                  <option value="ROUNDED_2XL">Luxury Curvature (24px)</option>
                  <option value="SQUARE">Sharp Modern (0px)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Category Bar Style</label>
                <select
                  value={settingsData.categoryStyle || 'PILLS'}
                  onChange={(e) => handleSettingsChange('categoryStyle', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="PILLS">Pills with Icons & Glass</option>
                  <option value="TEXT">Minimal Underlined Text</option>
                  <option value="MINIMAL">Soft Clean Badges</option>
                  <option value="ICON_PLUS_TEXT">Prominent Icon + Text</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Food Info Position</label>
                <select
                  value={settingsData.foodInfoPosition || 'BOTTOM'}
                  onChange={(e) => handleSettingsChange('foodInfoPosition', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="BOTTOM">Bottom Full-Width Sheet</option>
                  <option value="SIDE">Floating Side Card</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Progress Indicator</label>
                <select
                  value={settingsData.progressIndicatorStyle || 'BARS'}
                  onChange={(e) => handleSettingsChange('progressIndicatorStyle', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="BARS">Instagram-Style Progress Bars</option>
                  <option value="NUMBERS">Numeric Counter (03 / 14)</option>
                  <option value="DOTS">Vertical Position Dots</option>
                  <option value="NONE">None</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRESENTATION & STAGE */}
        {activeTab === 'stage' && (
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-6">
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Video className="w-4 h-4" />
              Menu Presentation Mode & Stage Atmosphere
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  id: 'INDIVIDUAL_VIDEO',
                  name: 'Individual Video (Reels)',
                  desc: 'Full viewport looping video & media with sound toggle.',
                },
                {
                  id: 'SHARED_ENVIRONMENT',
                  name: 'Shared Dining Stage',
                  desc: 'Atmospheric dining room stage with spotlight and custom table.',
                },
                {
                  id: 'VISUAL_IMAGE',
                  name: 'Visual Photography',
                  desc: 'High-resolution still imagery without autoplaying video.',
                },
              ].map((mode) => {
                const isSelected =
                  (settingsData.presentationMode || 'INDIVIDUAL_VIDEO').toUpperCase() === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleSettingsChange('presentationMode', mode.id)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                        : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-sm font-bold text-white mb-1">{mode.name}</div>
                    <div className="text-xs text-zinc-400 leading-relaxed">{mode.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Stage Attributes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Lighting Preset</label>
                <select
                  value={settingsData.lightingPreset || 'WARM'}
                  onChange={(e) => handleSettingsChange('lightingPreset', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="WARM">Warm Amber Glow</option>
                  <option value="COOL">Cool Modern Sky</option>
                  <option value="DRAMATIC">Dramatic Theatrical Spotlight</option>
                  <option value="NATURAL">Natural Soft Daylight</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Food Entrance Motion</label>
                <select
                  value={settingsData.foodEntranceAnimation || 'FADE_UP'}
                  onChange={(e) => handleSettingsChange('foodEntranceAnimation', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="FADE_UP">Fade Up & Rise</option>
                  <option value="SCALE_UP">Scale Up from Center</option>
                  <option value="SLIDE_RIGHT">Slide in from Left</option>
                  <option value="SMOOTH">Smooth Gentle Transition</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Camera Motion</label>
                <select
                  value={settingsData.cameraMotion || 'GENTLE_ZOOM'}
                  onChange={(e) => handleSettingsChange('cameraMotion', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                >
                  <option value="GENTLE_ZOOM">Gentle Subtle Zoom</option>
                  <option value="SLOW_PAN">Slow Cinematic Pan</option>
                  <option value="STATIC">Static Crisp Framing</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: DISPLAY TOGGLES */}
        {activeTab === 'toggles' && (
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Customer Menu Element Visibility
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {[
                { key: 'showPrices', label: 'Show Dish Prices', desc: 'Monetary value on feed items and details' },
                { key: 'showCalories', label: 'Show Calories', desc: 'Nutritional calorie badges' },
                { key: 'showPreparationTime', label: 'Show Preparation Time', desc: 'Kitchen prep time badge' },
                { key: 'showAllergens', label: 'Show Allergens', desc: 'Allergen badges and advisory notices' },
                { key: 'showIngredients', label: 'Show Ingredients', desc: 'List of ingredients on dish modal' },
                { key: 'showFavoriteButton', label: 'Show Favorite Button', desc: 'Bookmark heart button for guests' },
                { key: 'showDetailsButton', label: 'Show Details Button', desc: 'Info modal button' },
                { key: 'showOrderButton', label: 'Show Add to Order Button', desc: 'Add items directly to tray' },
              ].map((item) => {
                const checked = (settingsData as any)[item.key] !== false;
                return (
                  <label
                    key={item.key}
                    className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => handleSettingsChange(item.key, e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-amber-500"
                    />
                    <div>
                      <span className="block text-xs font-bold text-white">{item.label}</span>
                      <span className="text-[11px] text-zinc-400">{item.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 6: OPERATIONS & TAXES */}
        {activeTab === 'operations' && (
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-6">
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Operational Controls & Dining Policies
            </h2>

            {/* Availability Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer hover:border-zinc-700">
                <input
                  type="checkbox"
                  checked={restaurantData.isActive}
                  onChange={(e) => handleRestaurantChange('isActive', e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-amber-500"
                />
                <div>
                  <span className="block text-xs font-bold text-white">Restaurant Operational</span>
                  <span className="text-[11px] text-zinc-400">Accepting orders and guests</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer hover:border-zinc-700">
                <input
                  type="checkbox"
                  checked={restaurantData.isMenuActive}
                  onChange={(e) => handleRestaurantChange('isMenuActive', e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-amber-500"
                />
                <div>
                  <span className="block text-xs font-bold text-white">Customer Menu Active</span>
                  <span className="text-[11px] text-zinc-400">Shows offline screen if disabled</span>
                </div>
              </label>
            </div>

            {/* Currency & Tax */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Currency Code</label>
                <input
                  type="text"
                  value={restaurantData.currency}
                  onChange={(e) => handleRestaurantChange('currency', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={restaurantData.currencySymbol}
                  onChange={(e) => handleRestaurantChange('currencySymbol', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={settingsData.taxRate || '0.00'}
                  onChange={(e) => handleSettingsChange('taxRate', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Service Charge (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={settingsData.serviceChargeRate || '0.00'}
                  onChange={(e) => handleSettingsChange('serviceChargeRate', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                />
              </div>
            </div>

            {/* Contact & Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={restaurantData.phone}
                  onChange={(e) => handleRestaurantChange('phone', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Address</label>
                <input
                  type="text"
                  value={restaurantData.address}
                  onChange={(e) => handleRestaurantChange('address', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Opening Hours</label>
                <input
                  type="text"
                  value={restaurantData.openingHours}
                  onChange={(e) => handleRestaurantChange('openingHours', e.target.value)}
                  placeholder="e.g. Tue-Sun: 12:00 - 23:00"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
