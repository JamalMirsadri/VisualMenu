import React, { useState, useEffect } from 'react';
import { useAdminData } from '../../hooks/useAdminData';
import { useAuth } from '../../context/AuthContext';
import { qrService } from '../../services/qrService';
import type { QrCodeData } from '../../services/qrService';
import {
  QrCode as QrIcon,
  Download,
  ExternalLink,
  Plus,
  Trash2,
  Utensils,
} from 'lucide-react';

export const AdminQrPage: React.FC = () => {
  const { restaurant } = useAdminData();
  const { role } = useAuth();

  const [qrList, setQrList] = useState<QrCodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableNumber, setTableNumber] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const canManage = role === 'OWNER' || role === 'ADMIN';

  const loadQrs = async () => {
    if (!restaurant) return;
    try {
      setLoading(true);
      const data = await qrService.getByRestaurant(restaurant.id);
      setQrList(data);
    } catch (err) {
      console.error('Failed to load QR codes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQrs();
  }, [restaurant]);

  if (!restaurant || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="text-sm font-medium">Loading QR Studio...</p>
      </div>
    );
  }

  const publicMenuUrl = `${window.location.origin}/menu/${restaurant.slug}`;

  // Helper to generate QR image via standard public QR generator API (or canvas)
  const getQrImageUrl = (dataUrl: string, size = 300) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
      dataUrl
    )}&color=0-0-0&bgcolor=255-255-255&margin=15`;
  };

  const handleCreateQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber) return;

    try {
      const targetVal = `/menu/${restaurant.slug}/table/${tableNumber}`;
      await qrService.create(restaurant.id, {
        name: `Table ${tableNumber} QR`,
        targetType: 'TABLE_MENU',
        targetValue: targetVal,
      });
      setIsModalOpen(false);
      setTableNumber('');
      loadQrs();
    } catch (err: any) {
      alert(err.message || 'Failed to create QR code.');
    }
  };

  const handleDeleteQr = async (id: string) => {
    if (!confirm('Are you sure you want to delete this QR configuration?')) return;
    try {
      await qrService.delete(id);
      setQrList((prev) => prev.filter((q) => q.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete QR code.');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicMenuUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <QrIcon className="w-3.5 h-3.5" />
            QR Code Access Engine
          </div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-wide">
            QR Studio & Table Deployments
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xl">
            Generate and export high-resolution QR codes that instantly launch the cinematic visual menu on customer smartphones.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Table QR</span>
          </button>
        )}
      </div>

      {/* Main Restaurant QR Showcase Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
          {/* QR Canvas / Image Preview */}
          <div className="p-4 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center shrink-0 border border-zinc-200">
            <img
              src={getQrImageUrl(publicMenuUrl, 220)}
              alt="Main Restaurant Menu QR Code"
              className="w-48 h-48 object-contain"
            />
            <span className="text-[10px] font-bold tracking-widest text-zinc-600 uppercase mt-2">
              Scan for Visual Menu
            </span>
          </div>

          {/* Details & Action Controls */}
          <div className="flex-1 space-y-4 text-center md:text-left">
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest block mb-1">
                Primary Master QR
              </span>
              <h2 className="font-serif-luxury text-xl sm:text-2xl font-bold text-white">
                {restaurant.name}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                Point any smartphone camera at this code to open the full-screen cinematic visual feed. Ideal for front entrance stands, table tents, and social media flyers.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-3 text-xs">
              <span className="text-zinc-400 font-mono truncate">{publicMenuUrl}</span>
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs transition-colors shrink-0 cursor-pointer"
              >
                {copiedUrl ? 'Copied!' : 'Copy Link'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 justify-center md:justify-start">
              <a
                href={getQrImageUrl(publicMenuUrl, 600)}
                target="_blank"
                rel="noreferrer"
                download={`AURA_${restaurant.slug}_QR.png`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/40 text-amber-300 font-semibold text-xs tracking-wide transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Print Resolution</span>
              </a>

              <a
                href={`/menu/${restaurant.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs tracking-wide transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Customer Experience</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Table QRs Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold font-serif-luxury text-white flex items-center gap-2">
            <Utensils className="w-4 h-4 text-amber-400" />
            <span>Table Deployments ({qrList.length})</span>
          </h2>
          <span className="text-xs text-zinc-400">
            Pre-configured table links ready for future contactless ordering
          </span>
        </div>

        {qrList.length === 0 ? (
          <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400">
            <QrIcon className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs font-medium">No table QR codes generated yet.</p>
            {canManage && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-3 text-xs text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Add first table QR</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {qrList.map((qr) => {
              const fullUrl = `${window.location.origin}${qr.targetValue}`;
              return (
                <div
                  key={qr.id}
                  className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="p-2 bg-white rounded-xl shadow shrink-0">
                    <img
                      src={getQrImageUrl(fullUrl, 120)}
                      alt={qr.name}
                      className="w-16 h-16 object-contain"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{qr.name}</h3>
                    <p className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                      {qr.targetValue}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <a
                        href={getQrImageUrl(fullUrl, 500)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                      <span className="text-zinc-600">•</span>
                      <a
                        href={qr.targetValue}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-zinc-400 hover:text-white inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open</span>
                      </a>
                    </div>
                  </div>

                  {canManage && (
                    <button
                      onClick={() => handleDeleteQr(qr.id)}
                      className="p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                      title="Delete QR"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal to add table QR */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-6 space-y-4 shadow-2xl">
            <h3 className="font-serif-luxury text-lg font-bold text-white">
              Create Table QR
            </h3>
            <p className="text-xs text-zinc-400">
              Enter the table number or area name to generate a scoped QR code.
            </p>

            <form onSubmit={handleCreateQr} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-zinc-400 font-semibold mb-1.5">
                  Table Number / Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 12 or Patio-4"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Create QR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
