import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  Copy,
  Info,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  UtensilsCrossed,
} from 'lucide-react';
import { platformService } from '../../services/platformService';

export const PlatformCreateRestaurantPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [legalName, setLegalName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Portugal');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [currencySymbol, setCurrencySymbol] = useState('€');

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  const [theme, setTheme] = useState('DARK_LUXURY');
  const [presentationMode, setPresentationMode] = useState('INDIVIDUAL_VIDEO');
  const [language, setLanguage] = useState('en');
  const [taxRate, setTaxRate] = useState<number>(0);
  const [serviceChargeRate, setServiceChargeRate] = useState<number>(0);

  // Created Result State
  const [createdResult, setCreatedResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Automatically derive slug from name if not manually edited
  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  const handleCurrencyChange = (curr: string) => {
    setCurrency(curr);
    setCurrencySymbol(curr === 'USD' ? '$' : curr === 'GBP' ? '£' : '€');
  };

  const validateStep1 = () => {
    if (!name.trim()) return 'Restaurant name is required.';
    if (!slug.trim()) return 'Slug is required.';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return 'Slug must consist only of lowercase letters, numbers, and single hyphens.';
    }
    return null;
  };

  const validateStep2 = () => {
    if (!ownerName.trim()) return 'Owner full name is required.';
    if (!ownerEmail.trim() || !ownerEmail.includes('@')) {
      return 'A valid owner email address is required for sending the onboarding invitation.';
    }
    return null;
  };

  const handleNext = () => {
    setError(null);
    if (currentStep === 1) {
      const err = validateStep1();
      if (err) {
        setError(err);
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const err = validateStep2();
      if (err) {
        setError(err);
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStep > 1) {
      setCurrentStep((s) => (s - 1) as any);
    }
  };

  const handleCreateRestaurant = async () => {
    try {
      setLoading(true);
      setError(null);

      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        legalName: legalName.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        currency,
        currencySymbol,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        theme,
        presentationMode,
        language,
        taxRate: Number(taxRate) || 0,
        serviceChargeRate: Number(serviceChargeRate) || 0,
      };

      const res = await platformService.provisionRestaurant(payload);
      setCreatedResult(res);
    } catch (err: any) {
      console.error('Provisioning failed:', err);
      setError(err.message || 'Failed to provision restaurant.');
    } finally {
      setLoading(false);
    }
  };

  const copyInvitationUrl = () => {
    if (!createdResult?.invitation?.rawToken) return;
    const url = `${window.location.origin}/owner/onboarding/${createdResult.invitation.rawToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // If successfully created, display Onboarding Completion Screen
  if (createdResult) {
    const onboardingUrl = `${window.location.origin}/owner/onboarding/${createdResult.invitation.rawToken}`;

    return (
      <div className="max-w-2xl mx-auto space-y-6 py-6">
        <div className="p-8 rounded-3xl bg-zinc-900/90 border border-emerald-500/40 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Provisioning Succeeded
            </span>
            <h1 className="text-2xl font-bold text-white font-serif">
              {createdResult.restaurant.name} is Ready
            </h1>
            <p className="text-sm text-zinc-400 max-w-md mx-auto">
              The tenant has been created in total isolation with zero sample items. An onboarding
              invitation has been created for the designated owner.
            </p>
          </div>

          {/* Invitation Link Box */}
          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                Owner Onboarding Invitation URL
              </span>
              <span className="text-[10px] text-amber-400 font-mono">One-Time Token</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={onboardingUrl}
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-300 select-all"
              />
              <button
                onClick={copyInvitationUrl}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Deliver this link to <strong className="text-zinc-300">{createdResult.owner.email}</strong>.
              They will be invited to set their password and proceed with restaurant setup.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              to={`/platform/restaurants/${createdResult.restaurant.id}`}
              className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors"
            >
              View Restaurant Specifications
            </Link>
            <Link
              to="/platform/restaurants"
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-all shadow-lg shadow-amber-500/20"
            >
              Return to Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/platform/restaurants"
          className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Cancel & Back to Directory</span>
        </Link>
      </div>

      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-2xl space-y-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Tenant Provisioning Engine
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Create Independent Restaurant
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Provision a pristine, completely isolated tenant with safe platform defaults.
          </p>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { step: 1, label: 'Identity' },
            { step: 2, label: 'Owner' },
            { step: 3, label: 'Config' },
            { step: 4, label: 'Confirm' },
          ].map((item) => (
            <div
              key={item.step}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                currentStep === item.step
                  ? 'bg-amber-500/10 border-amber-500 text-amber-300 font-semibold shadow-sm'
                  : currentStep > item.step
                  ? 'bg-zinc-950 border-zinc-700 text-zinc-300'
                  : 'bg-zinc-950/40 border-zinc-800 text-zinc-600'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider">Step {item.step}</div>
              <div className="text-xs font-medium truncate">{item.label}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Restaurant Identity */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <span>Restaurant Identity & Public Slug</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                The name, URL-safe slug, and public dining location.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Restaurant Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Lumina Gastro Lounge"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  URL-Safe Slug (Permanent Customer URL) *
                </label>
                <div className="flex items-center rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden focus-within:border-amber-500/50">
                  <span className="px-3 py-2 text-xs text-zinc-500 bg-zinc-900 border-r border-zinc-800 font-mono">
                    /menu/
                  </span>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="lumina-gastro"
                    className="flex-1 px-3 py-2 text-xs text-white bg-transparent font-mono focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Must be unique across all SaaS tenants. Only lowercase alphanumeric and hyphens.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Legal / Business Name (Optional)
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="e.g. Lumina Hospitality Lda"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Contact Phone (Optional)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+351 912 345 678"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Contact Email (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@restaurant.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Physical Address (Optional)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Rua da Boavista 142"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Porto"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Country
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Portugal"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Default Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="EUR">EUR (€) — Euro</option>
                  <option value="USD">USD ($) — US Dollar</option>
                  <option value="GBP">GBP (£) — British Pound</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Owner Information */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                <span>Restaurant Owner Onboarding</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Designate the initial primary OWNER who will operate this restaurant.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-zinc-300 leading-relaxed space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero Password Exposure</span>
              </div>
              <p>
                Platform Admin does NOT choose a permanent password for the owner. A one-time secure
                onboarding invitation link will be created, allowing the owner to set their own password securely.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Owner Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Maria Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Owner Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@luminagastro.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
                <p className="text-[11px] text-zinc-500">
                  If this email already belongs to an existing user, they will receive an additional
                  OWNER membership for this restaurant without creating a duplicate account.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Initial Configuration */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-amber-400" />
                <span>Safe Initial Configuration</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Select baseline styling and fiscal rates. These are configuration defaults only; no
                fake products or demo tables will be injected.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Visual Theme Preset
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="DARK_LUXURY">Dark Luxury (Black & Gold)</option>
                  <option value="LIGHT_MINIMAL">Light Minimal</option>
                  <option value="WARM_RESTAURANT">Warm Restaurant</option>
                  <option value="MODERN_GLASS">Modern Glassmorphism</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Menu Presentation Mode
                </label>
                <select
                  value={presentationMode}
                  onChange={(e) => setPresentationMode(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="INDIVIDUAL_VIDEO">Individual Video (Luxury Cinema)</option>
                  <option value="SHARED_ENVIRONMENT">Shared Environment</option>
                  <option value="VISUAL_IMAGE">Visual Image High-Res</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Primary Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="en">English (en)</option>
                  <option value="pt">Portuguese (pt)</option>
                  <option value="es">Spanish (es)</option>
                  <option value="fr">French (fr)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Default Tax Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Service Charge Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={serviceChargeRate}
                  onChange={(e) => setServiceChargeRate(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Review & Empty Tenant Guarantee */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-amber-400" />
                <span>Provisioning Review & Empty Tenant Confirmation</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Verify specification before executing atomic database provisioning.
              </p>
            </div>

            {/* Empty Tenant Audit Grid */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold uppercase tracking-wider border-b border-zinc-800/80 pb-2">
                <span>Entity Isolation Guarantee</span>
                <span className="text-emerald-400">Zero Demo Pollution</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  { label: 'Categories', count: 0 },
                  { label: 'Food Dishes', count: 0 },
                  { label: 'Media Assets', count: 0 },
                  { label: 'Dining Tables', count: 0 },
                  { label: 'Orders', count: 0 },
                  { label: 'Customers', count: 0 },
                  { label: 'Payments', count: 0 },
                  { label: 'Fiscal Docs', count: 0 },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between"
                  >
                    <span className="text-zinc-400">{item.label}</span>
                    <span className="font-mono font-bold text-white">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px]">
                  Restaurant Name & Slug
                </span>
                <div className="font-bold text-white text-sm">{name}</div>
                <div className="font-mono text-zinc-400 text-[11px]">/menu/{slug}</div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px]">
                  Designated Owner
                </span>
                <div className="font-bold text-white text-sm">{ownerName}</div>
                <div className="font-mono text-zinc-400 text-[11px]">{ownerEmail}</div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px]">
                  Currency & Language
                </span>
                <div className="font-bold text-white">
                  {currency} ({currencySymbol}) • {language.toUpperCase()}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px]">
                  Initial Theme & Mode
                </span>
                <div className="font-bold text-white">{theme}</div>
                <div className="text-zinc-400 text-[11px]">{presentationMode}</div>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Control Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold shadow-lg shadow-amber-500/20 cursor-pointer transition-all"
            >
              <span>Continue</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateRestaurant}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-xl shadow-amber-500/25 cursor-pointer transition-all"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Provisioning Database Tenant...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Provision Restaurant Tenant</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
