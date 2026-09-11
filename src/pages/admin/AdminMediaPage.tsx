import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Film,
  HardDrive,
  Image as ImageIcon,
  Maximize2,
  Plus,
  RefreshCw,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { MediaUploadModal } from '../../components/admin/MediaUploadModal';
import { useAdminData } from '../../hooks/useAdminData';
import { useAuth } from '../../context/AuthContext';
import type { MediaItem } from '../../types';

export const AdminMediaPage: React.FC = () => {
  const { restaurant, media, foods, addMedia, replaceMedia, deleteMedia } = useAdminData();
  const { role } = useAuth();
  const canUpload = role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
  const canDelete = role === 'OWNER' || role === 'ADMIN';

  const [filterType, setFilterType] = useState<
    'all' | 'image' | 'video' | 'posters' | 'dish' | 'restaurant'
  >('all');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Deletion modal state
  const [deletingMedia, setDeletingMedia] = useState<MediaItem | null>(null);
  const [deleteError, setDeleteError] = useState<{ message: string; dishes?: any[] } | null>(null);

  // Replace modal state
  const [replacingMedia, setReplacingMedia] = useState<MediaItem | null>(null);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replacePosterUrl, setReplacePosterUrl] = useState('');
  const [replaceWidth, setReplaceWidth] = useState('');
  const [replaceHeight, setReplaceHeight] = useState('');
  const [replaceDuration, setReplaceDuration] = useState('');
  const [replaceLoading, setReplaceLoading] = useState(false);

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Find foods using this media item URL or id
  const getUsage = (item: MediaItem) => {
    const matched = foods.filter(
      (f) =>
        f.image === item.url ||
        f.video === item.url ||
        (item.foodItemId && f.id === item.foodItemId)
    );
    if (matched.length === 0 && item.foodItem) {
      return [item.foodItem];
    }
    return matched;
  };

  const filteredMedia = media.filter((item) => {
    const isVideo = item.type === 'video' || item.type === 'VIDEO';
    const isImage = item.type === 'image' || item.type === 'IMAGE';
    const usedDishes = getUsage(item);

    switch (filterType) {
      case 'video':
        return isVideo;
      case 'image':
        return isImage;
      case 'posters':
        return Boolean(item.posterUrl);
      case 'dish':
        return usedDishes.length > 0;
      case 'restaurant':
        return usedDishes.length === 0;
      case 'all':
      default:
        return true;
    }
  });

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDelete = async (force: boolean = false) => {
    if (!deletingMedia) return;
    try {
      setDeleteError(null);
      await deleteMedia(deletingMedia.id, force);
      setDeletingMedia(null);
    } catch (err: any) {
      setDeleteError({
        message: err.message || 'Failed to delete media.',
        dishes: err.linkedDishes || getUsage(deletingMedia),
      });
    }
  };

  const openReplaceModal = (item: MediaItem) => {
    setReplacingMedia(item);
    setReplaceUrl(item.url || '');
    setReplacePosterUrl(item.posterUrl || '');
    setReplaceWidth(item.width ? String(item.width) : '');
    setReplaceHeight(item.height ? String(item.height) : '');
    setReplaceDuration(item.duration || '');
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replacingMedia) return;
    try {
      setReplaceLoading(true);
      await replaceMedia(replacingMedia.id, {
        url: replaceUrl.trim(),
        posterUrl: replacePosterUrl.trim() || undefined,
        width: replaceWidth ? Number(replaceWidth) : undefined,
        height: replaceHeight ? Number(replaceHeight) : undefined,
        duration: replaceDuration ? String(replaceDuration) : undefined,
      });
      setReplacingMedia(null);
    } catch (err: any) {
      alert(err.message || 'Failed to replace media.');
    } finally {
      setReplaceLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl font-bold text-white tracking-wide">
            Media Studio & Video Library
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage high-definition food photography, looping cinematic MP4 reels, and track dish links.
          </p>
        </div>

        {canUpload && (
          <button
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Media</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: 'all', label: `All Assets (${media.length})` },
          { id: 'video', label: `Videos (${media.filter((m) => m.type === 'video' || m.type === 'VIDEO').length})`, icon: Film },
          { id: 'image', label: `Images (${media.filter((m) => m.type === 'image' || m.type === 'IMAGE').length})`, icon: ImageIcon },
          { id: 'posters', label: `Posters (${media.filter((m) => Boolean(m.posterUrl)).length})` },
          { id: 'dish', label: 'Dish Assets' },
          { id: 'restaurant', label: 'Brand & Stage Assets' },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = filterType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredMedia.map((item) => {
          const usedDishes = getUsage(item);
          const isVideo = item.type === 'video' || item.type === 'VIDEO';
          const sizeText = formatFileSize(item.size);

          return (
            <div
              key={item.id}
              className="group relative rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden flex flex-col justify-between hover:border-amber-400/40 transition-all duration-300 shadow-md"
            >
              {/* Visual Container */}
              <div className="relative aspect-[4/3] w-full bg-black overflow-hidden">
                {isVideo ? (
                  <video
                    src={item.url}
                    poster={item.posterUrl || item.thumbnailUrl || undefined}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <img
                    src={item.url}
                    alt={item.title || item.altText || 'Media Asset'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}

                {/* Top Left Badges: Type & Metadata */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-black/75 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider text-amber-300 border border-amber-400/30 flex items-center gap-1">
                    {isVideo ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                    <span>{isVideo ? 'Video' : 'Image'}</span>
                  </span>

                  {item.duration && (
                    <span className="px-2 py-0.5 rounded bg-black/75 backdrop-blur-md text-[10px] font-medium text-zinc-300 border border-zinc-700 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-zinc-400" />
                      <span>{item.duration}s</span>
                    </span>
                  )}

                  {sizeText && (
                    <span className="px-2 py-0.5 rounded bg-black/75 backdrop-blur-md text-[10px] font-medium text-zinc-300 border border-zinc-700 flex items-center gap-1">
                      <HardDrive className="w-2.5 h-2.5 text-zinc-400" />
                      <span>{sizeText}</span>
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${
                    item.sourceType === 'UPLOAD'
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                      : 'bg-blue-950/80 text-blue-400 border-blue-800/60'
                  }`}>
                    {item.sourceType === 'UPLOAD' ? 'Uploaded' : 'URL'}
                  </span>
                </div>

                {/* Dimensions Badge if available */}
                {item.width && item.height && (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-[9px] font-mono text-zinc-400 border border-zinc-800 flex items-center gap-1">
                    <Maximize2 className="w-2.5 h-2.5" />
                    <span>{item.width}×{item.height}</span>
                  </div>
                )}

                {/* Usage Badge */}
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-[10px] font-medium text-zinc-300 border border-zinc-700 flex items-center gap-1 max-w-[85%] truncate">
                  <Utensils className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {usedDishes.length > 0
                      ? `Used in: ${usedDishes.map((d) => d.name).slice(0, 2).join(', ')}${usedDishes.length > 2 ? '...' : ''}`
                      : 'Unassigned'}
                  </span>
                </div>

                {/* Action Overlay */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 p-1 rounded-xl backdrop-blur-md">
                  <button
                    onClick={() => handleCopy(item.url, item.id)}
                    className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10"
                    title="Copy media URL"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {canUpload && (
                    <button
                      onClick={() => openReplaceModal(item)}
                      className="p-1.5 rounded-lg text-amber-300 hover:text-amber-200 hover:bg-amber-500/20"
                      title="Replace media source"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {canDelete && (
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setDeletingMedia(item);
                      }}
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      title="Delete media"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Media Card Info Footer */}
              <div className="p-3 bg-zinc-950/80 border-t border-zinc-800">
                <h4 className="text-xs font-bold text-white truncate mb-1">
                  {item.title || item.filename || 'Untitled Media'}
                </h4>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono truncate">
                  <span className="truncate max-w-[160px]">{item.url}</span>
                  {item.posterUrl && (
                    <span className="text-amber-400/80 font-sans font-medium">Has Poster</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      <MediaUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onAddMedia={addMedia}
        restaurantId={restaurant?.id}
      />

      {/* Replace Media Modal */}
      {replacingMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-zinc-100 shadow-2xl">
            <button
              onClick={() => setReplacingMedia(null)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold font-serif-luxury text-amber-400 mb-2 flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Replace Media Source
            </h2>
            <p className="text-xs text-zinc-400 mb-4">
              Updating this media will seamlessly propagate to all dishes currently using it without breaking links.
            </p>

            <form onSubmit={handleReplaceSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-zinc-300 mb-1">New Media URL *</label>
                <input
                  type="text"
                  value={replaceUrl}
                  onChange={(e) => setReplaceUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-300 mb-1">Poster Image URL (For Videos)</label>
                <input
                  type="text"
                  value={replacePosterUrl}
                  onChange={(e) => setReplacePosterUrl(e.target.value)}
                  placeholder="https://.../poster.jpg"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-zinc-300 mb-1">Width (px)</label>
                  <input
                    type="number"
                    value={replaceWidth}
                    onChange={(e) => setReplaceWidth(e.target.value)}
                    placeholder="1920"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-300 mb-1">Height (px)</label>
                  <input
                    type="number"
                    value={replaceHeight}
                    onChange={(e) => setReplaceHeight(e.target.value)}
                    placeholder="1080"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-300 mb-1">Duration (s)</label>
                  <input
                    type="text"
                    value={replaceDuration}
                    onChange={(e) => setReplaceDuration(e.target.value)}
                    placeholder="15.4"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setReplacingMedia(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replaceLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 text-black font-bold uppercase tracking-wider hover:bg-amber-400"
                >
                  {replaceLoading ? 'Replacing...' : 'Confirm Replace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal with Dish Protection Warning */}
      {deletingMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-zinc-100 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-900">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold font-serif-luxury">
                  {deleteError ? 'Protected Media Warning' : 'Confirm Media Deletion'}
                </h3>
                <p className="text-xs text-zinc-400">
                  {deletingMedia.title || deletingMedia.filename || 'This asset'}
                </p>
              </div>
            </div>

            {deleteError ? (
              <div className="space-y-4 mb-6">
                <p className="text-xs text-red-300/90 leading-relaxed bg-red-950/40 p-3 rounded-xl border border-red-900/60">
                  {deleteError.message}
                </p>

                {deleteError.dishes && deleteError.dishes.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                      Linked Active Dishes:
                    </h4>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {deleteError.dishes.map((dish: any) => (
                        <div
                          key={dish.id}
                          className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200"
                        >
                          <span>{dish.name}</span>
                          <span className="text-[10px] text-amber-400 font-mono">Linked</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-zinc-400">
                  Deleting this media will remove the visual presentation from the active dishes above. You may force deletion or cancel to preserve dishes.
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-300 leading-relaxed mb-6">
                Are you sure you want to permanently remove this media item from your library?
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingMedia(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-300 hover:text-white text-xs font-medium"
              >
                Cancel
              </button>

              {deleteError ? (
                <button
                  onClick={() => handleDelete(true)}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  Force Delete Anyway
                </button>
              ) : (
                <button
                  onClick={() => handleDelete(false)}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  Delete Asset
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
