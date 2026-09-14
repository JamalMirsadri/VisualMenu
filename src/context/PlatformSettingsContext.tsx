import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { platformService } from '../services/platformService';
import type { PlatformSettingsData } from '../types';

const STORAGE_KEY = 'aura_platform_settings';
const DEFAULT_NAME = 'Aura SaaS';
const DEFAULT_SUPPORT_EMAIL = 'support@auramenu.com';

export interface PlatformBranding {
  logo: string;
  favicon: string;
  tagline: string;
}

interface PlatformSettingsContextType {
  settings: PlatformSettingsData | null;
  platformName: string;
  supportEmail: string;
  branding: PlatformBranding;
  loading: boolean;
  reload: () => Promise<void>;
  saveSettings: (data: Partial<PlatformSettingsData>) => Promise<PlatformSettingsData | null>;
}

const PlatformSettingsContext = createContext<PlatformSettingsContextType | undefined>(undefined);

function readCache(): PlatformSettingsData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlatformSettingsData) : null;
  } catch {
    return null;
  }
}

function writeCache(settings: PlatformSettingsData | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (settings) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode) — non-blocking
  }
}

function getBranding(settings: PlatformSettingsData | null): PlatformBranding {
  const flags = settings?.featureFlags as Record<string, any> | null | undefined;
  const branding = flags && typeof flags === 'object' ? (flags.branding as Partial<PlatformBranding> | undefined) : undefined;
  return {
    logo: (branding?.logo as string) || '',
    favicon: (branding?.favicon as string) || '',
    tagline: (branding?.tagline as string) || '',
  };
}

export const PlatformSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PlatformSettingsData | null>(readCache);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await platformService.getSettings();
      setSettings(data);
      writeCache(data);
    } catch {
      // Not authenticated or not a platform user — keep the cached/default branding.
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async (data: Partial<PlatformSettingsData>) => {
    const updated = await platformService.updateSettings(data);
    setSettings(updated);
    writeCache(updated);
    return updated;
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Keep the browser favicon in sync with the platform branding. The document
  // title is intentionally left to page-level owners (e.g. the public menu sets
  // the restaurant name) so platform branding never overrides tenant branding.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const favicon = getBranding(settings).favicon;
    if (favicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = favicon;
    }
  }, [settings]);

  const platformName = settings?.platformName || DEFAULT_NAME;
  const supportEmail = settings?.supportEmail || DEFAULT_SUPPORT_EMAIL;
  const branding = getBranding(settings);

  return (
    <PlatformSettingsContext.Provider
      value={{ settings, platformName, supportEmail, branding, loading, reload, saveSettings }}
    >
      {children}
    </PlatformSettingsContext.Provider>
  );
};

export const usePlatformSettings = (): PlatformSettingsContextType => {
  const context = useContext(PlatformSettingsContext);
  if (!context) {
    throw new Error('usePlatformSettings must be used within a PlatformSettingsProvider');
  }
  return context;
};
