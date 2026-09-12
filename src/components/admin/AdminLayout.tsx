import React, { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { ExternalLink, Menu, Sparkles, X, ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAdminData } from '../../hooks/useAdminData';
import { useAuth } from '../../context/AuthContext';
import { AdminSidebar } from './AdminSidebar';

export const AdminLayout: React.FC = () => {
  const { restaurant, refresh } = useAdminData();
  const { platformViewingRestaurant, exitRestaurantContext } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleExitContext = async () => {
    await exitRestaurantContext();
    navigate('/platform/restaurants');
  };

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Platform Admin Context Banner */}
      {platformViewingRestaurant && (
        <aside
          aria-label="Platform operator context alert"
          className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-zinc-950 px-4 py-2 flex flex-wrap items-center justify-between gap-3 font-semibold text-xs shadow-md shrink-0 border-b border-amber-300 z-50"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldAlert className="w-4 h-4 text-zinc-950 shrink-0" />
            <span className="px-2 py-0.5 rounded bg-zinc-950 text-amber-300 text-[10px] font-mono uppercase tracking-wider font-bold shrink-0">
              PLATFORM CONTEXT
            </span>
            <span className="text-zinc-900 font-medium truncate">
              Operating Restaurant: <strong className="text-black font-bold">{platformViewingRestaurant.name}</strong> ({platformViewingRestaurant.slug})
            </span>
          </div>
          <button
            onClick={handleExitContext}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 text-amber-300 hover:text-white hover:bg-zinc-900 rounded-lg text-xs font-bold transition-all shadow cursor-pointer min-h-[32px] shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Platform</span>
          </button>
        </aside>
      )}

      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Desktop Sidebar (Persistent on Laptop/Desktop >= 1024px) */}
        <div className="hidden lg:flex h-full shrink-0">
          <AdminSidebar restaurant={restaurant} onResetData={refresh} />
        </div>

        {/* Mobile & Tablet Responsive Drawer (< 1024px) */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 flex lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Restaurant navigation drawer"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Sliding Drawer Panel */}
            <div className="relative z-10 w-72 max-w-[85vw] h-full bg-zinc-950 shadow-2xl flex flex-col border-r border-zinc-800 animate-in slide-in-from-left duration-200">
              {/* Close Button Header inside Drawer */}
              <div className="absolute top-3 right-3 z-20">
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl bg-zinc-900/90 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700/80 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer shadow-lg transition-colors"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sidebar content with automatic drawer close on link click */}
              <div className="h-full flex flex-col overflow-hidden">
                <AdminSidebar
                  restaurant={restaurant}
                  onResetData={refresh}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Top Navbar */}
          <header className="h-16 shrink-0 bg-zinc-900/60 backdrop-blur-md border-b border-zinc-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between z-10">
            <div className="flex items-center gap-3 min-w-0">
              {/* Drawer Toggle for Phones & Tablets (< 1024px) */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white min-w-[42px] min-h-[42px] flex items-center justify-center cursor-pointer transition-colors border border-zinc-700/60 shrink-0"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden sm:inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <h1 className="text-sm sm:text-base font-semibold text-zinc-200 truncate">
                  Menu Management Studio
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link
                to={`/menu/${restaurant?.slug || 'demo-restaurant'}`}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-500/10 border border-amber-400/40 text-amber-300 hover:bg-amber-500 hover:text-black transition-all text-xs font-semibold min-h-[36px]"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Preview Menu</span>
                <span className="sm:hidden">Preview</span>
                <ExternalLink className="w-3 h-3 ml-0.5 shrink-0" />
              </Link>
            </div>
          </header>

          {/* Scrollable Page Body (Responsive, No Viewport Horizontal Overflow) */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 lg:p-8 bg-[#0b0c10]">
            <div className="max-w-7xl mx-auto w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
