import React, { useState } from 'react';
import { Image, Upload, Video, X, AlertCircle } from 'lucide-react';
import { mediaService } from '../../services/mediaService';
import type { MediaItem } from '../../types';

interface MediaUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMedia: (item: Omit<MediaItem, 'id' | 'createdAt'>) => void;
  restaurantId?: string;
}

export const MediaUploadModal: React.FC<MediaUploadModalProps> = ({
  isOpen,
  onClose,
  onAddMedia,
  restaurantId,
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'image' | 'video'>('image');
  const [url, setUrl] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Store the actual File object (not just the display name).
    setSelectedFile(file);

    const name = file.name.toLowerCase();
    const isVid =
      file.type.startsWith('video/') ||
      name.endsWith('.mp4') ||
      name.endsWith('.webm') ||
      name.endsWith('.mov') ||
      name.endsWith('.quicktime');
    setType(isVid ? 'video' : 'image');
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Media title is required.');
      return;
    }

    // Validate against the real File object / URL value, not the displayed name.
    const file = selectedFile;
    const trimmedUrl = url.trim();

    if (!file && !trimmedUrl) {
      setError('Please select a local file to upload or enter a media URL.');
      return;
    }

    if (file && !restaurantId) {
      setError('The restaurant is not ready yet. Please try again in a moment.');
      return;
    }

    try {
      setError('');
      setUploading(true);

      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (file && restaurantId) {
        setProgress(0);
        const uploaded = await mediaService.uploadFile(restaurantId, file, {
          altText: title.trim(),
          onProgress: (pct) => setProgress(pct),
        });

        onAddMedia({
          title: title.trim(),
          type: uploaded.type,
          url: uploaded.url,
          filename: uploaded.filename,
          size: uploaded.size,
          mimeType: uploaded.mimeType,
          duration: uploaded.duration,
          posterUrl: uploaded.posterUrl,
          tags,
        });
      } else {
        onAddMedia({
          title: title.trim(),
          type,
          url: trimmedUrl,
          tags,
        });
      }

      setTitle('');
      setUrl('');
      setSelectedFile(null);
      setTagsText('');
      setType('image');
      setError('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Media upload failed.');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-zinc-100 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold font-serif-luxury text-amber-400 mb-4">
          Add Media to Library
        </h2>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Media Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sizzling Ribeye or Google Flow Animation"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Media Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('image')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                  type === 'image'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                <Image className="w-4 h-4" />
                <span>Image (JPG / PNG / WebP)</span>
              </button>
              <button
                type="button"
                onClick={() => setType('video')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                  type === 'video'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>Short Video (MP4 / WebM)</span>
              </button>
            </div>
          </div>

          {/* Upload or URL */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Upload File or Direct Web URL
            </label>
            <div className="space-y-2">
              <label className="w-full py-4 px-4 rounded-xl bg-zinc-900 border border-dashed border-zinc-700 hover:border-amber-400/60 text-zinc-400 hover:text-zinc-200 cursor-pointer flex flex-col items-center justify-center gap-1 text-xs transition-colors">
                <Upload className="w-5 h-5 text-amber-400" />
                <span className="font-medium text-zinc-200">
                  {selectedFile ? selectedFile.name : 'Click to select local file (Images up to 10MB, Videos up to 100MB)'}
                </span>
                <span className="text-[10px] text-zinc-500">
                  Direct upload for Google Flow MP4, WebM, JPG, PNG
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {progress !== null && (
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 my-1">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">or use external URL</span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>

              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://... (CDN or external URL)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="grill, signature, promo, ambient"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
            >
              {uploading ? 'Uploading...' : 'Save to Library'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
