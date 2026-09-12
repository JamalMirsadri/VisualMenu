import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Building2,
  Sparkles,
  Globe,
  MapPin,
  Phone,
  Mail,
  Palette,
  Upload,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  Shield,
} from 'lucide-react';
import { platformService } from '../../services/platformService';
import { THEME_REGISTRY, type ThemeDefinition } from '../../theme/themeConfig';
import type { UpdatePlatformRestaurantInput } from '../../types';

interface PlatformEditRestaurantModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurant: any;
  settings?: any;
  onSuccess: (updated: any) => void;
}

const COMMON_TIMEZONES = [
  'UTC',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

const COMMON_LANGUAGES = [
  { code: 'en', label: 'English (en)' },
  { code: 'pt', label: 'Portuguese (pt)' },
  { code: 'es', label: 'Spanish (es)' },
  { code: 'fr', label: 'French (fr)' },
  { code: 'de', label: 'German (de)' },
  { code: 'it', label: 'Italian (it)' },
  { code: 'fa', label: 'Persian (fa)' },
];

const COMMON_CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro (EUR €)' },
  { code: 'USD', symbol: '$', label: 'US Dollar (USD $)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP £)' },
  { code: 'CAD', symbol: '$', label: 'Canadian Dollar (CAD $)' },
  { code: 'AUD', symbol: '$', label: 'Australian Dollar (AUD $)' },
  { code: 'BRL', symbol: 'R$', label: 'Brazilian Real (BRL R$)' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc (CHF)' },
];

export const PlatformEditRestaurantModal: React.FC<PlatformEditRestaurantModalProps> = ({
  isOpen,
  onClose,
  restaurant,
  settings,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'identity' | 'location' | 'branding' | 'presentation'>('identity');

  // Form fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tagline, setTagline] = useState('');
  const [legalName, setLegalName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [currencySymbol, setCurrencySymbol] = useState('€');
  const [timezone, setTimezone] = useState('UTC');
  const [defaultLanguage, setDefaultLanguage] = useState('en');

  // Branding & Assets
  const [logo, setLogo] = useState('');
  const [favicon, setFavicon] = useState('');

  // Settings & Presentation
  const [theme, setTheme] = useState('DARK_LUXURY');
  const [presentationMode, setPresentationMode] = useState('INDIVIDUAL_VIDEO');
  const [primaryColor, setPrimaryColor] = useState('#eab308');
  const [secondaryColor, setSecondaryColor] = useState('#d97706');
  const [accentColor, setAccentColor] = useState('#f59e0b');

  // Operational states
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const initialValuesRef = useRef<string>('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Initialize form state when restaurant changes
  useEffect(() => {
    if (restaurant && isOpen) {
      const restName = restaurant.name || '';
      const restSlug = restaurant.slug || '';
      const restTagline = restaurant.tagline || '';
      const restLegal = restaurant.legalName || '';
      const restDesc = restaurant.description || '';
      const restAddr = restaurant.address || '';
      const restCity = restaurant.city || '';
      const restCountry = restaurant.country || '';
      const restPhone = restaurant.phone || '';
      const restEmail = restaurant.email || '';
      const restCurr = restaurant.currency || 'EUR';
      const restCurrSym = restaurant.currencySymbol || '€';
      const restTz = restaurant.timezone || 'UTC';
      const restLang = restaurant.defaultLanguage || 'en';
      const restLogo = restaurant.logo || '';
      const restFav = restaurant.favicon || '';

      const restTheme = settings?.theme || 'DARK_LUXURY';
      const restMode = settings?.presentationMode || 'INDIVIDUAL_VIDEO';
      const restPrimary = settings?.primaryColor || '#eab308';
      const restSecondary = settings?.secondaryColor || '#d97706';
      const restAccent = settings?.accentColor || '#f59e0b';

      setName(restName);
      setSlug(restSlug);
      setTagline(restTagline);
      setLegalName(restLegal);
      setDescription(restDesc);
      setAddress(restAddr);
      setCity(restCity);
      setCountry(restCountry);
      setPhone(restPhone);
      setEmail(restEmail);
      setCurrency(restCurr);
      setCurrencySymbol(restCurrSym);
      setTimezone(restTz);
      setDefaultLanguage(restLang);
      setLogo(restLogo);
      setFavicon(restFav);

      setTheme(restTheme);
      setPresentationMode(restMode);
      setPrimaryColor(restPrimary);
      setSecondaryColor(restSecondary);
      setAccentColor(restAccent);

      setError(null);
      setSuccess(false);

      const snap = JSON.stringify({
        name: restName,
        slug: restSlug,
        tagline: restTagline,
        legalName: restLegal,
        description: restDesc,
        address: restAddr,
        city: restCity,
        country: restCountry,
        phone: restPhone,
        email: restEmail,
        currency: restCurr,
        currencySymbol: restCurrSym,
        timezone: restTz,
        defaultLanguage: restLang,
        logo: restLogo,
        favicon: restFav,
        theme: restTheme,
        presentationMode: restMode,
        primaryColor: restPrimary,
        secondaryColor: restSecondary,
        accentColor: restAccent,
      });
      initialValuesRef.current = snap;
    }
  }, [restaurant, settings, isOpen]);

  // Compute dirty state for unsaved-changes protection
  const currentSnapshot = JSON.stringify({
    name,
    slug,
    tagline,
    legalName,
    description,
    address,
    city,
    country,
    phone,
    email,
    currency,
    currencySymbol,
    timezone,
    defaultLanguage,
    logo,
    favicon,
    theme,
    presentationMode,
    primaryColor,
    secondaryColor,
    accentColor,
  });

  const isDirty = initialValuesRef.current !== '' && initialValuesRef.current !== currentSnapshot;

  // Unsaved changes browser guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleSafeClose = () => {
    if (isDirty) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close and discard your edits?')) {
        return;
      }
    }
    onClose();
  };

  const handleCurrencySelect = (code: string) => {
    setCurrency(code);
    const found = COMMON_CURRENCIES.find((c) => c.code === code);
    if (found) {
      setCurrencySymbol(found.symbol);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restaurant?.id) return;
    try {
      setUploadingLogo(true);
      setError(null);
      const res = await platformService.uploadRestaurantAsset(restaurant.id, file);
      setLogo(res.url);
    } catch (err: any) {
      setError(`Logo upload failed: ${err.message}`);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleUploadFavicon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restaurant?.id) return;
    try {
      setUploadingFavicon(true);
      setError(null);
      const res = await platformService.uploadRestaurantAsset(restaurant.id, file);
      setFavicon(res.url);
    } catch (err: any) {
      setError(`Favicon upload failed: ${err.message}`);
    } finally {
      setUploadingFavicon(false);
      if (faviconInputRef.current) faviconInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Restaurant name is required.');
      return;
    }
    if (!slug.trim()) {
      setError('Restaurant slug is required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload: UpdatePlatformRestaurantInput = {
        name: name.trim(),
        slug: slug.trim(),
        tagline: tagline.trim() || null,
        legalName: legalName.trim() || null,
        description: description.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        currency,
        currencySymbol,
        timezone,
        defaultLanguage,
        logo: logo.trim() || null,
        favicon: favicon.trim() || null,
        theme,
        presentationMode,
        primaryColor,
        secondaryColor,
        accentColor,
      };

      const result = await platformService.updateRestaurant(restaurant.id, payload);
      setSuccess(true);
      initialValuesRef.current = currentSnapshot; // reset dirty state

      setTimeout(() => {
        onSuccess(result);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Failed to update restaurant:', err);
      setError(err.message || 'Failed to update restaurant specifications.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Edit Restaurant: {restaurant?.name}
                </h2>
                {isDirty && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Unsaved Changes
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                Platform Admin Tenant Specification & Brand Defaults
              </p>
            </div>
          </div>

          <button
            onClick={handleSafeClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-zinc-800 flex items-center gap-1 bg-zinc-950/30 overflow-x-auto no-scrollbar shrink-0">
          {[
            { id: 'identity', label: 'Identity & Legal', icon: Sparkles },
            { id: 'location', label: 'Location & Region', icon: MapPin },
            { id: 'branding', label: 'Logo & Favicon', icon: Upload },
            { id: 'presentation', label: 'Theme & Presentation', icon: Palette },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2.5 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Restaurant specifications updated successfully!</span>
            </div>
          )}

          {/* TAB 1: IDENTITY & LEGAL */}
          {activeTab === 'identity' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                    Restaurant Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Lumina Dining"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                    URL Slug *
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="e.g. lumina-dining"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs font-mono placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                    Public Menu URL: <span className="text-amber-400/80">/menu/{slug || '...'}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                    Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="e.g. Contemporary Gastronomy & Wine"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                    Legal / Business Entity Name
                  </label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="e.g. Lumina Hospitality Lda"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                  Story / Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Atmospheric summary of restaurant concept and heritage..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 2: LOCATION & REGIONAL */}
          {activeTab === 'location' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                  Street Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Rua Garrett 42"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Lisbon"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                    Country
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. Portugal"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+351 21 000 0000"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                    Contact Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contact@restaurant.com"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-zinc-800/80">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => handleCurrencySelect(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-400"
                  >
                    {COMMON_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-400 font-mono"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-amber-400" />
                    Default Language
                  </label>
                  <select
                    value={defaultLanguage}
                    onChange={(e) => setDefaultLanguage(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-400"
                  >
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LOGO & FAVICON */}
          {activeTab === 'branding' && (
            <div className="space-y-6">
              {/* Logo Asset */}
              <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Restaurant Logo
                  </label>
                  <span className="text-[11px] text-zinc-500">Stored via MediaStorageProvider</span>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                    {logo ? (
                      <img src={logo} alt="Logo preview" className="w-full h-full object-contain p-1" />
                    ) : (
                      <Building2 className="w-8 h-8 text-zinc-600" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={logo}
                        onChange={(e) => setLogo(e.target.value)}
                        placeholder="https://.../logo.png or upload below"
                        className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {uploadingLogo ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>Upload</span>
                      </button>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadLogo}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Recommended: Transparent PNG or SVG, minimum 256x256 pixels.
                    </p>
                  </div>
                </div>
              </div>

              {/* Favicon Asset */}
              <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Browser Tab Favicon
                  </label>
                  <span className="text-[11px] text-zinc-500">Stored via MediaStorageProvider</span>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                    {favicon ? (
                      <img src={favicon} alt="Favicon preview" className="w-8 h-8 object-contain" />
                    ) : (
                      <Globe className="w-6 h-6 text-zinc-600" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={favicon}
                        onChange={(e) => setFavicon(e.target.value)}
                        placeholder="https://.../favicon.ico or upload below"
                        className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => faviconInputRef.current?.click()}
                        disabled={uploadingFavicon}
                        className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {uploadingFavicon ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>Upload</span>
                      </button>
                      <input
                        ref={faviconInputRef}
                        type="file"
                        accept="image/*,.ico"
                        className="hidden"
                        onChange={handleUploadFavicon}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Standard square icon (32x32 or 64x64 PNG / ICO) shown in diner browser tabs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: THEME & PRESENTATION */}
          {activeTab === 'presentation' && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                  Theme Preset
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.values(THEME_REGISTRY).map((tDef: ThemeDefinition) => {
                    const isSelected = theme === tDef.id;
                    return (
                      <button
                        key={tDef.id}
                        type="button"
                        onClick={() => {
                          setTheme(tDef.id);
                          if (tDef.colors?.accent) setPrimaryColor(tDef.colors.accent);
                        }}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10 scale-[1.01]'
                            : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-white text-xs">{tDef.name}</span>
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20"
                            style={{ backgroundColor: tDef.colors?.accent || '#d4af37' }}
                          />
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {tDef.tagline}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                  Presentation Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'INDIVIDUAL_VIDEO',
                      title: 'Individual Video',
                      desc: 'Immersive vertical video feed (TikTok/Reels format)',
                    },
                    {
                      id: 'SHARED_ENVIRONMENT',
                      title: 'Shared 3D Stage',
                      desc: 'Ambient dining table with dynamic lighting and camera',
                    },
                    {
                      id: 'VISUAL_IMAGE',
                      title: 'Visual Imagery',
                      desc: 'Crisp editorial photography with minimal glass overlays',
                    },
                  ].map((mode) => {
                    const isSelected = presentationMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setPresentationMode(mode.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/10'
                            : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                        }`}
                      >
                        <div className="font-semibold text-xs text-white mb-0.5">{mode.title}</div>
                        <div className="text-[11px] text-zinc-400 leading-tight">{mode.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color Accents */}
              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
                  Color Tuning
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-8 h-8 rounded-lg bg-transparent border border-zinc-700 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-zinc-300 uppercase">{primaryColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Secondary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-8 h-8 rounded-lg bg-transparent border border-zinc-700 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-zinc-300 uppercase">{secondaryColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-8 h-8 rounded-lg bg-transparent border border-zinc-700 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-zinc-300 uppercase">{accentColor}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between shrink-0">
          <div className="text-xs text-zinc-400 flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span>Updates saved transactionally with audit trail</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSafeClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Saving Changes...' : 'Save Restaurant'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
