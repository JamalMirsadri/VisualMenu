import React, { useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  Eye,
  Layers,
  Monitor,
  Palette,
  RotateCcw,
  Save,
  Sliders,
  Smartphone,
  Tablet,
  Video,
  Sparkles,
  Clock,
  Flame,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useAdminData } from '../../hooks/useAdminData';
import { RestaurantDataGate } from '../../components/admin/RestaurantDataGate';
import { ErrorBanner } from '../../components/admin/ErrorBanner';
import { settingsService } from '../../services/settingsService';
import { THEME_REGISTRY } from '../../theme/themeConfig';
import type { ThemeDefinition } from '../../theme/themeConfig';
import type { FoodItem, RestaurantSettings } from '../../types';
import { DevicePreview, type DeviceMode } from '../../components/customer/DevicePreview';
import { CustomerMenuPreview } from '../../components/customer/CustomerMenuPreview';
import { LuxuryFoodFallback } from '../../components/customer/LuxuryFoodFallback';
import { SinglePlayVideo } from '../../components/customer/SinglePlayVideo';

export const AdminMenuPreviewPage: React.FC = () => {
  const { restaurant, categories, foods, loading, error, refresh } = useAdminData();

  const [deviceMode, setDeviceMode] = useState<DeviceMode>('iphone');
  const [activeTab, setActiveTab] = useState<'theme' | 'presentation' | 'toggles' | 'typography'>('theme');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeFood, setActiveFood] = useState<FoodItem | null>(null);

  // Mobile Studio toggle (<768px): 'controls' vs 'preview'
  const [mobileStudioView, setMobileStudioView] = useState<'controls' | 'preview'>('preview');

  // Tablet/Desktop drawer toggle for Right Context Panel
  const [showRightContext, setShowRightContext] = useState(false);

  // Current working settings and saved settings
  const [previewSettings, setPreviewSettings] = useState<RestaurantSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<RestaurantSettings | null>(null);

  // Load database settings on mount
  useEffect(() => {
    if (restaurant?.id) {
      settingsService
        .getByRestaurant(restaurant.id)
        .then((res: any) => {
          const loaded = res.data || res;
          setPreviewSettings(loaded);
          setSavedSettings(loaded);
        })
        .catch(() => {
          const fallback = restaurant.settings || {
            primaryColor: '#d4af37',
            secondaryColor: '#18181b',
            accentColor: '#d4af37',
            theme: 'DARK_LUXURY',
            presentationMode: 'INDIVIDUAL_VIDEO',
            language: 'en',
            showPrices: true,
            showCalories: true,
            showPreparationTime: true,
            categoryStyle: 'PILLS',
            lightingPreset: 'WARM',
            cameraMotion: 'GENTLE_ZOOM',
            foodEntranceAnimation: 'FADE_UP',
          };
          setPreviewSettings(fallback as RestaurantSettings);
          setSavedSettings(fallback as RestaurantSettings);
        });
    }
  }, [restaurant]);

  // Set initial active food once foods are loaded
  useEffect(() => {
    if (foods && foods.length > 0 && !activeFood) {
      setActiveFood(foods[0]);
    }
  }, [foods, activeFood]);

  const isDirty =
    Boolean(previewSettings && savedSettings) &&
    JSON.stringify(previewSettings) !== JSON.stringify(savedSettings);

  const updateSetting = <K extends keyof RestaurantSettings>(key: K, value: RestaurantSettings[K]) => {
    setPreviewSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleReset = () => {
    if (savedSettings) {
      setPreviewSettings({ ...savedSettings });
    }
  };

  const handleSave = async () => {
    if (!restaurant?.id || !previewSettings) return;
    try {
      setSaving(true);
      await settingsService.update(restaurant.id, previewSettings);
      setSavedSettings({ ...previewSettings });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFavorite = (foodId: string) => {
    setFavorites((prev) =>
      prev.includes(foodId) ? prev.filter((id) => id !== foodId) : [...prev, foodId]
    );
  };

  if (loading || !restaurant) {
    return (
      <RestaurantDataGate
        loading={loading}
        error={error}
        hasRestaurant={Boolean(restaurant)}
        loadingLabel="Initializing Live Menu Studio..."
        onRetry={refresh}
      />
    );
  }

  if (!previewSettings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-zinc-400">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="text-sm font-medium">Initializing Live Menu Studio...</p>
      </div>
    );
  }

  // Active category lookup for the active food
  const activeCategory = activeFood
    ? categories.find((c) => c.id === activeFood.categoryId)
    : undefined;

  // Compute effective preview mode for CustomerMenuPreview
  const previewMode =
    deviceMode === 'desktop' ? 'desktop' : deviceMode === 'ipad' ? 'tablet' : 'mobile';

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col overflow-hidden -m-6 bg-zinc-950 select-none">
      {error && (
        <div className="shrink-0 px-4 sm:px-6 pt-3">
          <ErrorBanner message={error} onRetry={refresh} title="Could not load menu data" />
        </div>
      )}
      {/* Top Header / Studio Bar */}
      <header className="px-4 sm:px-6 py-2.5 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0 z-20">
        {/* Title & Status */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif-luxury text-sm sm:text-base font-bold text-white tracking-wide">
                Live Menu Studio
              </h1>
              {isDirty ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                  Unsaved Changes
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold uppercase tracking-wider">
                  Synced
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              Interactive split-screen preview grounded in live PostgreSQL data.
            </p>
          </div>
        </div>

        {/* Device Switcher (Desktop & Tablet) / Mobile View Switcher (<768px) */}
        <div className="flex items-center gap-2">
          {/* Mobile view toggle for small screens (<768px) */}
          <div className="flex md:hidden items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800">
            <button
              onClick={() => setMobileStudioView('controls')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                mobileStudioView === 'controls'
                  ? 'bg-amber-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Controls
            </button>
            <button
              onClick={() => setMobileStudioView('preview')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                mobileStudioView === 'preview'
                  ? 'bg-amber-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Customer Preview
            </button>
          </div>

          {/* Desktop & Tablet Device Switcher */}
          <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
            <button
              onClick={() => setDeviceMode('iphone')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                deviceMode === 'iphone'
                  ? 'bg-amber-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>iPhone</span>
            </button>
            <button
              onClick={() => setDeviceMode('pixel')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                deviceMode === 'pixel'
                  ? 'bg-amber-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Pixel</span>
            </button>
            <button
              onClick={() => setDeviceMode('ipad')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                deviceMode === 'ipad'
                  ? 'bg-amber-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Tablet className="w-3.5 h-3.5" />
              <span>iPad</span>
            </button>
            <button
              onClick={() => setDeviceMode('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                deviceMode === 'desktop'
                  ? 'bg-amber-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Desktop</span>
            </button>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center gap-2">
          {/* Toggle Right Context Drawer on Tablet (<1280px) */}
          <button
            onClick={() => setShowRightContext((prev) => !prev)}
            className="xl:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all"
            title="Toggle Dish & Theme Details"
          >
            {showRightContext ? (
              <PanelRightClose className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline">Inspector</span>
          </button>

          <a
            href={`/menu/${restaurant.slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open Menu</span>
          </a>

          <button
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
          >
            {saving ? (
              <span>Saving...</span>
            ) : saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main 3-Zone Studio Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* =========================================================================
            ZONE 1: LEFT EDITOR CONTROLS PANEL
            ========================================================================= */}
        <div
          className={`
            w-full md:w-[360px] xl:w-[380px] shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden z-10
            ${mobileStudioView === 'controls' ? 'flex' : 'hidden md:flex'}
          `}
        >
          {/* Controls Tab Navigation */}
          <div className="flex items-center border-b border-zinc-800 p-2 gap-1 bg-zinc-900/40">
            <button
              onClick={() => setActiveTab('theme')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg text-center transition-all ${
                activeTab === 'theme'
                  ? 'bg-zinc-800 text-amber-400 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Theme
            </button>
            <button
              onClick={() => setActiveTab('presentation')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg text-center transition-all ${
                activeTab === 'presentation'
                  ? 'bg-zinc-800 text-amber-400 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Stage
            </button>
            <button
              onClick={() => setActiveTab('typography')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg text-center transition-all ${
                activeTab === 'typography'
                  ? 'bg-zinc-800 text-amber-400 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Styles
            </button>
            <button
              onClick={() => setActiveTab('toggles')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg text-center transition-all ${
                activeTab === 'toggles'
                  ? 'bg-zinc-800 text-amber-400 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Toggles
            </button>
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
            {/* TAB 1: THEME & COLORS */}
            {activeTab === 'theme' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs uppercase font-bold text-amber-400 tracking-wider mb-2 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    Theme Presets
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(THEME_REGISTRY).map((tDef: ThemeDefinition) => {
                      const isSelected = previewSettings.theme === tDef.id;
                      return (
                        <button
                          key={tDef.id}
                          onClick={() => updateSetting('theme', tDef.id)}
                          className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden cursor-pointer ${
                            isSelected
                              ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10 scale-[1.02]'
                              : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white">{tDef.name}</span>
                            <div
                              className="w-3.5 h-3.5 rounded-full border border-white/20"
                              style={{ backgroundColor: tDef.colors.accent }}
                            />
                          </div>
                          <p className="text-[10px] text-zinc-400 line-clamp-2 leading-tight">
                            {tDef.tagline}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Brand Colors */}
                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">
                    Custom Color Overrides
                  </h3>

                  <div>
                    <label className="block text-xs text-zinc-300 mb-1.5">Primary Brand Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={previewSettings.primaryColor || '#d4af37'}
                        onChange={(e) => updateSetting('primaryColor', e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border border-zinc-700"
                      />
                      <input
                        type="text"
                        value={previewSettings.primaryColor || '#d4af37'}
                        onChange={(e) => updateSetting('primaryColor', e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-300 mb-1.5">Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={previewSettings.accentColor || previewSettings.primaryColor || '#d4af37'}
                        onChange={(e) => updateSetting('accentColor', e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border border-zinc-700"
                      />
                      <input
                        type="text"
                        value={previewSettings.accentColor || previewSettings.primaryColor || '#d4af37'}
                        onChange={(e) => updateSetting('accentColor', e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-mono text-xs uppercase"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PRESENTATION & STAGE */}
            {activeTab === 'presentation' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs uppercase font-bold text-amber-400 tracking-wider mb-2 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" />
                    Presentation Mode
                  </label>
                  <div className="space-y-2">
                    {[
                      {
                        id: 'INDIVIDUAL_VIDEO',
                        name: 'Individual Full-Bleed Video',
                        desc: 'Vertical reels-style full viewport video and images with sound toggle.',
                      },
                      {
                        id: 'SHARED_ENVIRONMENT',
                        name: 'Shared Dining Stage',
                        desc: 'Atmospheric dining room stage with custom table surface and lighting.',
                      },
                      {
                        id: 'VISUAL_IMAGE',
                        name: 'Visual Photography',
                        desc: 'Crisp high-resolution food photography without auto-playing video.',
                      },
                    ].map((mode) => {
                      const isSelected =
                        (previewSettings.presentationMode || 'INDIVIDUAL_VIDEO').toUpperCase() ===
                        mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => updateSetting('presentationMode', mode.id)}
                          className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-amber-400 bg-amber-500/10'
                              : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                          }`}
                        >
                          <div className="text-xs font-bold text-white mb-0.5">{mode.name}</div>
                          <div className="text-[11px] text-zinc-400">{mode.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stage & Lighting Controls */}
                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">
                    Stage Atmosphere
                  </h3>

                  <div>
                    <label className="block text-xs text-zinc-300 mb-1">Lighting Preset</label>
                    <select
                      value={previewSettings.lightingPreset || 'WARM'}
                      onChange={(e) => updateSetting('lightingPreset', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                    >
                      <option value="WARM">Warm Amber Glow</option>
                      <option value="COOL">Cool Modern Sky</option>
                      <option value="DRAMATIC">Dramatic Theatrical Spotlight</option>
                      <option value="NATURAL">Natural Soft Light</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-300 mb-1">Food Entrance Motion</label>
                    <select
                      value={previewSettings.foodEntranceAnimation || 'FADE_UP'}
                      onChange={(e) => updateSetting('foodEntranceAnimation', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                    >
                      <option value="FADE_UP">Fade Up & Rise</option>
                      <option value="SCALE_UP">Scale Up From Center</option>
                      <option value="SLIDE_RIGHT">Slide In From Left</option>
                      <option value="SMOOTH">Smooth Gentle Transition</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-300 mb-1">Camera Motion</label>
                    <select
                      value={previewSettings.cameraMotion || 'GENTLE_ZOOM'}
                      onChange={(e) => updateSetting('cameraMotion', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                    >
                      <option value="GENTLE_ZOOM">Gentle Subtle Zoom</option>
                      <option value="SLOW_PAN">Slow Cinematic Pan</option>
                      <option value="STATIC">Static Crisp Framing</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: UI & STYLES */}
            {activeTab === 'typography' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs uppercase font-bold text-amber-400 tracking-wider mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    Category Bar Style
                  </label>
                  <select
                    value={previewSettings.categoryStyle || 'PILLS'}
                    onChange={(e) => updateSetting('categoryStyle', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                  >
                    <option value="PILLS">Pills with Icons & Glass</option>
                    <option value="TEXT">Minimal Underlined Text</option>
                    <option value="MINIMAL">Soft Clean Badges</option>
                    <option value="ICON_PLUS_TEXT">Icon + Label Prominent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold text-amber-400 tracking-wider mb-2">
                    Card & Panel Shape
                  </label>
                  <select
                    value={previewSettings.cardStyle || 'ROUNDED_2XL'}
                    onChange={(e) => updateSetting('cardStyle', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                  >
                    <option value="ROUNDED_LG">Subtle Rounded (12px)</option>
                    <option value="ROUNDED_XL">Modern Rounded (16px)</option>
                    <option value="ROUNDED_2XL">Luxury Curvature (24px)</option>
                    <option value="SQUARE">Sharp Architectural (0px)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold text-amber-400 tracking-wider mb-2">
                    Food Info Position
                  </label>
                  <select
                    value={previewSettings.foodInfoPosition || 'BOTTOM'}
                    onChange={(e) => updateSetting('foodInfoPosition', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                  >
                    <option value="BOTTOM">Bottom Full-Width Sheet</option>
                    <option value="SIDE">Floating Side Card</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold text-amber-400 tracking-wider mb-2">
                    Typography Pairing
                  </label>
                  <select
                    value={previewSettings.textStyle || 'SERIF'}
                    onChange={(e) => updateSetting('textStyle', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                  >
                    <option value="SERIF">Cinzel Luxury Serif</option>
                    <option value="SANS">Plus Jakarta Sans Modern</option>
                    <option value="MODERN">Geometric Clean</option>
                  </select>
                </div>
              </div>
            )}

            {/* TAB 4: DISPLAY TOGGLES */}
            {activeTab === 'toggles' && (
              <div className="space-y-4">
                <label className="block text-xs uppercase font-bold text-amber-400 tracking-wider mb-2 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  Element Visibility
                </label>

                {[
                  { key: 'showPrices', label: 'Show Prices', desc: 'Display item monetary values' },
                  { key: 'showCalories', label: 'Show Calories', desc: 'Display nutritional caloric values' },
                  { key: 'showPreparationTime', label: 'Show Preparation Time', desc: 'Display estimated kitchen prep time' },
                  { key: 'showAllergens', label: 'Show Allergens', desc: 'Display food allergy badges and warnings' },
                  { key: 'showIngredients', label: 'Show Ingredients', desc: 'Display dish ingredient list' },
                  { key: 'showFavoriteButton', label: 'Show Favorite Button', desc: 'Allow customers to bookmark dishes' },
                  { key: 'showDetailsButton', label: 'Show Details Button', desc: 'Show modal for deep-dive info' },
                  { key: 'showOrderButton', label: 'Show Add to Order Button', desc: 'Allow customers to add items to tray' },
                ].map((item) => {
                  const checked = (previewSettings as any)[item.key] !== false;
                  return (
                    <label
                      key={item.key}
                      className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => updateSetting(item.key as any, e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded text-amber-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">{item.label}</div>
                        <div className="text-[11px] text-zinc-400">{item.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            ZONE 2: CENTER DEVICE PREVIEW WORKSPACE
            ========================================================================= */}
        <div
          className={`
            flex-1 bg-zinc-950 flex flex-col overflow-hidden relative
            ${mobileStudioView === 'preview' ? 'flex' : 'hidden md:flex'}
          `}
        >
          {/* Subtle Studio Canvas Grid Background */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#3f3f46 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Device Frame or Full-Screen Mobile Preview */}
          <DevicePreview
            deviceMode={deviceMode}
            restaurantName={restaurant.name}
            restaurantSlug={restaurant.slug}
          >
            <CustomerMenuPreview
              restaurant={{
                ...restaurant,
                settings: previewSettings,
              }}
              categories={categories}
              foods={foods}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              mode={previewMode}
              onActiveFoodChange={(food) => setActiveFood(food)}
            />
          </DevicePreview>
        </div>

        {/* =========================================================================
            ZONE 3: RIGHT CONTEXT & ACTIVE DISH INSPECTOR PANEL
            ========================================================================= */}
        <div
          className={`
            w-[320px] shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col overflow-y-auto p-5 space-y-6 z-20 no-scrollbar
            ${showRightContext ? 'fixed inset-y-16 right-0 shadow-2xl xl:static xl:shadow-none flex' : 'hidden xl:flex'}
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs uppercase tracking-widest text-amber-400 font-bold">
                Context & Inspector
              </h2>
            </div>
            {/* Close button on tablet overlay */}
            <button
              onClick={() => setShowRightContext(false)}
              className="xl:hidden p-1 rounded-lg text-zinc-400 hover:text-white"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>

          {/* ACTIVE DISH SPOTLIGHT */}
          {activeFood ? (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                Current Active Dish
              </span>

              {/* Media Thumbnail */}
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-amber-500/20 shadow-xl bg-zinc-900">
                {activeFood.image ? (
                  <img
                    src={activeFood.image}
                    alt={activeFood.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : activeFood.video ? (
                  <SinglePlayVideo
                    src={activeFood.video}
                    activationKey={activeFood.id}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <LuxuryFoodFallback
                    name={activeFood.name}
                    categoryName={activeCategory?.name}
                    tagline={activeFood.tagline}
                    compact={false}
                  />
                )}
                {activeCategory && (
                  <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[10px] text-amber-300 font-medium z-10 border border-white/10">
                    {activeCategory.name}
                  </div>
                )}
              </div>

              {/* Title & Tagline */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-serif-luxury text-base font-bold text-white">
                    {activeFood.name}
                  </h3>
                  <span className="font-serif-luxury text-base font-bold text-amber-400 shrink-0">
                    {activeFood.currencySymbol}{activeFood.price.toFixed(2)}
                  </span>
                </div>
                {activeFood.tagline && (
                  <p className="text-xs text-amber-300/80 italic mt-0.5">
                    {activeFood.tagline}
                  </p>
                )}
                {activeFood.description && (
                  <p className="text-xs text-zinc-400 leading-relaxed mt-1.5 line-clamp-3">
                    {activeFood.description}
                  </p>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {activeFood.preparationTime && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-700/60 text-zinc-300 text-[11px]">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    {activeFood.preparationTime} mins
                  </span>
                )}
                {activeFood.calories && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-700/60 text-zinc-300 text-[11px]">
                    {activeFood.calories} kcal
                  </span>
                )}
                {activeFood.spicyLevel !== undefined && activeFood.spicyLevel > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-950/70 border border-red-500/50 text-red-300 text-[11px]">
                    <Flame className="w-3 h-3 text-red-400" />
                    Spicy
                  </span>
                )}
              </div>

              {/* Ingredients */}
              {activeFood.ingredients && activeFood.ingredients.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">
                    Ingredients
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {activeFood.ingredients.map((ing, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300"
                      >
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Allergens */}
              {activeFood.allergens && activeFood.allergens.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-red-400/80 font-bold mb-1.5">
                    Allergens
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {activeFood.allergens.map((alg, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-red-950/40 border border-red-900/50 text-[11px] text-red-300"
                      >
                        {alg}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500">
              Scroll through the simulator to inspect active dish attributes.
            </div>
          )}

          {/* LIVE THEME TOKENS CARD */}
          <div className="pt-5 border-t border-zinc-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
              Active Theme Tokens
            </span>

            <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Theme Preset</span>
                <span className="text-xs font-bold text-white">
                  {THEME_REGISTRY[previewSettings.theme]?.name || previewSettings.theme}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Primary Brand</span>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3.5 h-3.5 rounded-full border border-white/20"
                    style={{ backgroundColor: previewSettings.primaryColor }}
                  />
                  <span className="text-xs font-mono text-zinc-300">
                    {previewSettings.primaryColor}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Accent Color</span>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3.5 h-3.5 rounded-full border border-white/20"
                    style={{ backgroundColor: previewSettings.accentColor }}
                  />
                  <span className="text-xs font-mono text-zinc-300">
                    {previewSettings.accentColor}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Category Nav</span>
                <span className="text-[11px] font-semibold text-amber-400">
                  {previewSettings.categoryStyle || 'PILLS'}
                </span>
              </div>
            </div>
          </div>

          {/* QUICK ROUTE INFO */}
          <div className="pt-2 text-[11px] text-zinc-500 space-y-1">
            <p>Live Route: <span className="text-zinc-400 font-mono">/menu/{restaurant.slug}</span></p>
            <p>Test with table: <span className="text-zinc-400 font-mono">/menu/{restaurant.slug}?table=4</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};
