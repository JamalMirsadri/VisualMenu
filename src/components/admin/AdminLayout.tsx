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
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-zinc-950 px-4 py-2 flex flex-wrap items-center justify-between gap-3 font-semibold text-xs shadow-md shrink-0 border-b border-amber-300 z-50">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-zinc-950 shrink-0" />
            <span className="px-2 py-0.5 rounded bg-zinc-950 text-amber-300 text-[10px] font-mono uppercase tracking-wider font-bold">
              PLATFORM CONTEXT
            </span>
            <span className="text-zinc-900 font-medium">
              Operating Restaurant: <strong className="text-black font-bold">{platformViewingRestaurant.name}</strong> ({platformViewingRestaurant.slug})
            </span>
          </div>
          <button
            onClick={handleExitContext}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-950 text-amber-300 hover:text-white hover:bg-zinc-900 rounded-lg text-xs font-bold transition-all shadow cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Platform</span>
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full">
        <AdminSidebar restaurant={restaurant} onResetData={refresh} />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 h-full bg-zinc-950 shadow-2xl flex flex-col">
            <div className="p-3 flex justify-end">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" onClick={() => setMobileMenuOpen(false)}>
              <AdminSidebar restaurant={restaurant} onResetData={refresh} />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 shrink-0 bg-zinc-900/60 backdrop-blur-md border-b border-zinc-800 px-4 sm:px-8 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-block w-2 h-2 rounded-full bg-amber-400" />
              <h1 className="text-sm sm:text-base font-semibold text-zinc-200">
                Menu Management Studio
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={`/menu/${restaurant?.slug || 'demo-restaurant'}`}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/40 text-amber-300 hover:bg-amber-500 hover:text-black transition-all text-xs font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Preview Menu</span>
              <ExternalLink className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#0b0c10]">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  </div>
  );
};
