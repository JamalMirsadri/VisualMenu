import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X, Shield, Activity } from 'lucide-react';
import { PlatformSidebar } from './PlatformSidebar';
import { useAuth } from '../../context/AuthContext';
import { usePlatformSettings } from '../../context/PlatformSettingsContext';

export const PlatformLayout: React.FC = () => {
  const { platformRole } = useAuth();
  const { platformName, branding } = usePlatformSettings();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.title = platformName;
  }, [platformName]);

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Desktop Platform Sidebar */}
      <div className="hidden lg:flex h-full">
        <PlatformSidebar />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 h-full bg-zinc-950 shadow-2xl flex flex-col">
            <div className="p-3 flex justify-end">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-zinc-400 hover:text-white"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" onClick={() => setMobileMenuOpen(false)}>
              <PlatformSidebar onItemClick={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Platform Header */}
        <header className="h-16 shrink-0 bg-zinc-900/70 backdrop-blur-md border-b border-zinc-800 px-4 sm:px-8 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white tracking-wide uppercase">
                  {platformName}
                </span>
                <span className="text-[10px] text-zinc-400">
                  {branding.tagline || 'Global Multi-Tenant Control Panel'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* System Status Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              <Activity className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
              <span>All Systems Operational</span>
            </div>

            {/* Operator info pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono text-zinc-200">{platformRole}</span>
            </div>
          </div>
        </header>

        {/* Scrollable Main Outlet */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#090a0f]">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
