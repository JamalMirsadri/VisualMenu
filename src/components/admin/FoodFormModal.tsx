import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Flame,
  Trash2,
  Upload,
  X,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { mediaService } from '../../services/mediaService';
import type { Category, FoodItem } from '../../types';

interface FoodFormModalProps {
  isOpen: boolean;
  food?: FoodItem | null;
  categories: Category[];
  onClose: () => void;
  onSave: (data: Omit<FoodItem, 'id'>) => void;
  onDelete?: (id: string) => void;
  restaurantId: string;
  defaultCurrency?: string;
  defaultCurrencySymbol?: string;
}

const COMMON_ALLERGENS = [
  'Gluten',
  'Dairy',
  'Eggs',
  'Nuts',
  'Peanuts',
  'Fish',
  'Shellfish',
  'Soy',
  'Sesame',
  'Mustard',
  'Celery',
  'Lupin',
  'Molluscs',
  'Sulphites',
];

export const FoodFormModal: React.FC<FoodFormModalProps> = ({
  isOpen,
  food,
  categories,
  onClose,
  onSave,
  onDelete,
  restaurantId,
  defaultCurrency = 'EUR',
  defaultCurrencySymbol = '€',
}) => {
  const { hasPermission } = useAuth();
  const canManagePrices = hasPermission('MANAGE_FOOD_PRICES');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | ''>(12.0);
  const [categoryId, setCategoryId] = useState('');

  // Media state
  const [image, setImage] = useState('');
  const [video, setVideo] = useState('');
  const [imageMeta, setImageMeta] = useState<{ filename?: string; size?: number } | null>(null);
  const [videoMeta, setVideoMeta] = useState<{ filename?: string; size?: number; duration?: string } | null>(null);

  // Dual Input Modes: 'upload' | 'url'
  const [imageInputMode, setImageInputMode] = useState<'upload' | 'url'>('upload');
  const [videoInputMode, setVideoInputMode] = useState<'upload' | 'url'>('upload');

  // Upload progress & loading states
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageProgress, setImageProgress] = useState<number | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);

  // Other food fields
  const [ingredientsText, setIngredientsText] = useState('');
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [spicyLevel, setSpicyLevel] = useState<number>(0);
  const [preparationTime, setPreparationTime] = useState<number | ''>(15);
  const [calories, setCalories] = useState<number | ''>('');
  const [available, setAvailable] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [analyticsType, setAnalyticsType] = useState<'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER'>('FOOD');
  const [order, setOrder] = useState<number>(1);
  const [error, setError] = useState('');

  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (food) {
      setName(food.name);
      setTagline(food.tagline || '');
      setDescription(food.description || '');
      setPrice(food.price);
      setCategoryId(food.categoryId);
      setImage(food.image || '');
      setVideo(food.video || '');
      setImageMeta(null);
      setVideoMeta(null);
      setIngredientsText(food.ingredients?.join(', ') || '');
      setSelectedAllergens(food.allergens || []);
      setSpicyLevel(food.spicyLevel || 0);
      setPreparationTime(food.preparationTime || '');
      setCalories(food.calories || '');
      setAvailable(food.available);
      setFeatured(food.featured);
      setAnalyticsType(food.analyticsType || 'FOOD');
      setOrder(food.order);
    } else {
      setName('');
      setTagline('');
      setDescription('');
      setPrice(12.0);
      setCategoryId(categories[0]?.id || '');
      // Media is optional - default empty!
      setImage('');
      setVideo('');
      setImageMeta(null);
      setVideoMeta(null);
      setIngredientsText('');
      setSelectedAllergens([]);
      setSpicyLevel(0);
      setPreparationTime(15);
      setCalories('');
      setAvailable(true);
      setFeatured(false);
      setAnalyticsType('FOOD');
      setOrder(1);
    }
    setImageInputMode('upload');
    setVideoInputMode('upload');
    setImageUploadError(null);
    setVideoUploadError(null);
    setImageProgress(null);
    setVideoProgress(null);
    setError('');
  }, [food, isOpen, categories]);

  // Lock background page scrolling and listen for Escape key when modal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    // Lock page scrolling
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Direct Image File Upload Handler
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      setImageUploadError(null);
      setImageProgress(0);

      const media = await mediaService.uploadFile(restaurantId, file, {
        foodItemId: food?.id,
        isPrimary: true,
        onProgress: (pct) => setImageProgress(pct),
      });

      setImage(media.url);
      setImageMeta({
        filename: file.name,
        size: file.size,
      });
    } catch (err: any) {
      setImageUploadError(err.message || 'Image upload failed. Check format and size (max 10MB).');
    } finally {
      setUploadingImage(false);
      setImageProgress(null);
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
  };

  // Direct Video File Upload Handler (Google Flow MP4 / WebM)
  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingVideo(true);
      setVideoUploadError(null);
      setVideoProgress(0);

      const media = await mediaService.uploadFile(restaurantId, file, {
        foodItemId: food?.id,
        isPrimary: false,
        onProgress: (pct) => setVideoProgress(pct),
      });

      setVideo(media.url);
      setVideoMeta({
        filename: file.name,
        size: file.size,
        duration: media.duration || undefined,
      });
    } catch (err: any) {
      setVideoUploadError(
        err.message || 'Video upload failed. Check video format (MP4/WebM) and size (max 100MB).'
      );
    } finally {
      setUploadingVideo(false);
      setVideoProgress(null);
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    }
  };

  const toggleAllergen = (allergen: string) => {
    setSelectedAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]
    );
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Food item name is required.');
      return;
    }
    if (price === '' || isNaN(Number(price)) || Number(price) < 0) {
      setError('A valid positive price is required.');
      return;
    }
    if (!categoryId) {
      setError('Please select a category for this food item.');
      return;
    }

    const ingredients = ingredientsText
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);

    onSave({
      restaurantId,
      name: name.trim(),
      tagline: tagline.trim() || undefined,
      description: description.trim() || undefined,
      price: !canManagePrices && food ? food.price : Number(price),
      currency: defaultCurrency,
      currencySymbol: defaultCurrencySymbol,
      categoryId,
      image: image.trim() || null,
      video: video.trim() || null,
      ingredients,
      allergens: selectedAllergens,
      spicyLevel,
      preparationTime: preparationTime !== '' ? Number(preparationTime) : undefined,
      calories: calories !== '' ? Number(calories) : undefined,
      available,
      featured,
      analyticsType,
      order: Number(order) || 1,
    });
    onClose();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-modal-title"
        className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800/90 rounded-3xl text-zinc-100 shadow-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] md:max-h-[calc(100dvh-3.5rem)] overscroll-contain overflow-hidden"
      >
        {/* 1. FIXED / PINNED HEADER */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md rounded-t-3xl z-10">
          <div>
            <h2 id="food-modal-title" className="text-lg sm:text-xl font-bold font-serif-luxury text-amber-400">
              {food ? 'Edit Culinary Offering' : 'Create Culinary Offering'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configure dish details, category association, and optional visual media for customer menus.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors cursor-pointer shrink-0 ml-3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="shrink-0 mx-5 sm:mx-6 mt-3 p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* 2. SCROLLABLE FORM BODY (Only this section scrolls vertically from top to bottom) */}
        <form
          id="food-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-5 sm:p-6 space-y-5 text-sm"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Item Name & Tagline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
                Dish Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dry-Aged Tomahawk on Charcoal"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
                Tagline / Sensory Subtitle
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. 45-day Himalayan salt cave aged"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>
          </div>

          {/* Price & Category & Display Order */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
                  Price ({defaultCurrencySymbol}) *
                </label>
                {!canManagePrices && (
                  <span className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => canManagePrices && setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!canManagePrices}
                placeholder="14.50"
                required
                className={`w-full px-3.5 py-2.5 rounded-xl border font-mono text-sm focus:outline-none ${
                  !canManagePrices
                    ? 'bg-zinc-800/60 border-zinc-800 text-zinc-400 cursor-not-allowed'
                    : 'bg-zinc-900 border-zinc-700 text-white focus:border-amber-400'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
                Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
                Display Order
              </label>
              <input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
              Detailed Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sensory culinary profile, origins, preparation method..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 text-sm"
            />
          </div>

          {/* Analytics Type (reporting classification, independent of Category) */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
              Analytics Type
            </label>
            <select
              value={analyticsType}
              onChange={(e) => setAnalyticsType(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400 text-sm"
            >
              <option value="FOOD">Food</option>
              <option value="DRINK">Drink</option>
              <option value="DESSERT">Dessert</option>
              <option value="OTHER">Other</option>
            </select>
            <p className="text-[10px] text-zinc-500 mt-1">
              Used only for Analytics &amp; Reports classification. Does not change your menu categories.
            </p>
          </div>

          {/* ========================================================================= */}
          {/* VISUAL MEDIA SECTION — STRICTLY OPTIONAL + DUAL INPUT (UPLOAD & URL)     */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Visual Media (Optional)
                </h3>
              </div>
              <span className="text-[11px] text-zinc-400 font-medium">
                Dishes are valid with no image, no video, or both
              </span>
            </div>

            {/* 1. DISH IMAGE */}
            <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  Dish Image
                </span>
                {image ? (
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Image Attached
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-500">No image added</span>
                )}
              </div>

              {/* If Image exists: preview + replace/remove */}
              {image ? (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-zinc-700 shrink-0 bg-black">
                    <img src={image} alt="Dish Preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-200 truncate">
                      {imageMeta?.filename || image.split('/').pop() || 'dish-image.jpg'}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5 font-mono">
                      {imageMeta?.size ? formatFileSize(imageMeta.size) + ' • ' : ''}
                      {image.startsWith('/uploads/') ? 'Direct Storage' : 'External Web URL'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      <span>Replace</span>
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setImage('');
                        setImageMeta(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-950 text-red-300 text-xs font-medium border border-red-800/60 transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* If Image does not exist: Dual Input (Upload File OR Enter URL) */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImageInputMode('upload')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        imageInputMode === 'upload'
                          ? 'bg-amber-500/20 border border-amber-400 text-amber-300'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Upload className="w-3 h-3" />
                      <span>Upload from Computer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageInputMode('url')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        imageInputMode === 'url'
                          ? 'bg-amber-500/20 border border-amber-400 text-amber-300'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <LinkIcon className="w-3 h-3" />
                      <span>Use Image URL</span>
                    </button>
                  </div>

                  {imageInputMode === 'upload' ? (
                    <div>
                      <label className="w-full py-3.5 px-4 rounded-xl bg-zinc-900 border border-dashed border-zinc-700 hover:border-amber-400/60 text-zinc-400 hover:text-zinc-200 cursor-pointer flex items-center justify-center gap-2 text-xs transition-colors">
                        <Upload className="w-4 h-4 text-amber-400" />
                        <span>
                          {uploadingImage
                            ? `Uploading image (${imageProgress ?? 0}%)...`
                            : 'Choose image file (JPG, PNG, WebP, AVIF up to 10MB)'}
                        </span>
                        <input
                          ref={imageFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          disabled={uploadingImage}
                          className="hidden"
                          onChange={handleImageFileChange}
                        />
                      </label>
                      {imageProgress !== null && (
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                          <div
                            className="bg-amber-400 h-full transition-all duration-200"
                            style={{ width: `${imageProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={image}
                        onChange={(e) => setImage(e.target.value)}
                        placeholder="https://images.unsplash.com/... or /uploads/dish.jpg"
                        className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 text-xs font-mono"
                      />
                    </div>
                  )}

                  {imageUploadError && (
                    <p className="text-[11px] text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {imageUploadError}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 2. DISH VIDEO (Optimized for Google Flow MP4s & local files) */}
            <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/90 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-amber-400" />
                    Dish Video (Looping Motion)
                  </span>
                  <span className="text-[10px] text-zinc-400 block mt-0.5">
                    Direct upload supported for 10-second Google Flow MP4 clips or WebM up to 100MB
                  </span>
                </div>
                {video ? (
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Video Attached
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-500">No video added</span>
                )}
              </div>

              {/* If Video exists: playable player + replace/remove */}
              {video ? (
                <div className="space-y-2 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                  <div className="relative aspect-video w-full max-h-48 rounded-lg overflow-hidden bg-black border border-zinc-800">
                    <video
                      src={video}
                      controls
                      muted
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="text-xs font-medium text-zinc-200 truncate">
                        {videoMeta?.filename || video.split('/').pop() || 'dish-video.mp4'}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5 font-mono">
                        {videoMeta?.size ? formatFileSize(videoMeta.size) + ' • ' : ''}
                        {video.startsWith('/uploads/') ? 'Direct Storage' : 'External Web URL'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <label className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        <span>Replace</span>
                        <input
                          ref={videoFileInputRef}
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          className="hidden"
                          onChange={handleVideoFileChange}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setVideo('');
                          setVideoMeta(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-950 text-red-300 text-xs font-medium border border-red-800/60 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* If Video does not exist: Dual Input (Upload File OR Enter URL) */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVideoInputMode('upload')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        videoInputMode === 'upload'
                          ? 'bg-amber-500/20 border border-amber-400 text-amber-300'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Upload className="w-3 h-3" />
                      <span>Upload Google Flow MP4 / Video</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoInputMode('url')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        videoInputMode === 'url'
                          ? 'bg-amber-500/20 border border-amber-400 text-amber-300'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <LinkIcon className="w-3 h-3" />
                      <span>Use Video URL</span>
                    </button>
                  </div>

                  {videoInputMode === 'upload' ? (
                    <div>
                      <label className="w-full py-4 px-4 rounded-xl bg-zinc-900 border border-dashed border-zinc-700 hover:border-amber-400/60 text-zinc-400 hover:text-zinc-200 cursor-pointer flex flex-col items-center justify-center gap-1.5 text-xs transition-colors">
                        <Upload className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-zinc-200">
                          {uploadingVideo
                            ? `Uploading video (${videoProgress ?? 0}%)...`
                            : 'Upload MP4 downloaded from Google Flow or computer'}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          Supports MP4, WebM, QuickTime up to 100MB (signature validated)
                        </span>
                        <input
                          ref={videoFileInputRef}
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          disabled={uploadingVideo}
                          className="hidden"
                          onChange={handleVideoFileChange}
                        />
                      </label>
                      {videoProgress !== null && (
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                          <div
                            className="bg-amber-400 h-full transition-all duration-200"
                            style={{ width: `${videoProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={video}
                        onChange={(e) => setVideo(e.target.value)}
                        placeholder="https://assets.example.com/flow-dish.mp4 or /uploads/dish.mp4"
                        className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 text-xs font-mono"
                      />
                    </div>
                  )}

                  {videoUploadError && (
                    <p className="text-[11px] text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {videoUploadError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Ingredients & Prep */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
                Ingredients (comma separated)
              </label>
              <input
                type="text"
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                placeholder="e.g. Free-range chicken, Kashmiri chili, Greek yogurt"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
                Prep Time (mins)
              </label>
              <input
                type="number"
                min="0"
                value={preparationTime}
                onChange={(e) =>
                  setPreparationTime(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>
          </div>

          {/* Spicy Level & Calories */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
                Spicy Level
              </label>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((lvl) => (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => setSpicyLevel(lvl)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                      spicyLevel === lvl
                        ? 'bg-red-950 border-red-500 text-red-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Flame className="w-3 h-3" />
                    <span>{lvl === 0 ? 'None' : `${lvl}x`}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-medium">
                Energy (Calories kcal)
              </label>
              <input
                type="number"
                min="0"
                value={calories}
                onChange={(e) =>
                  setCalories(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="e.g. 480"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>
          </div>

          {/* Allergens selection */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Common Allergens
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_ALLERGENS.map((allergen) => {
                const checked = selectedAllergens.includes(allergen);
                return (
                  <button
                    type="button"
                    key={allergen}
                    onClick={() => toggleAllergen(allergen)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      checked
                        ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {allergen}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggles: Available & Featured */}
          <div className="flex flex-wrap gap-6 pt-2 border-t border-zinc-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => setAvailable(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
              />
              <span className="text-xs font-semibold text-zinc-200">
                Item Available (visible on customer menu)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 text-yellow-500 focus:ring-yellow-400"
              />
              <span className="text-xs font-semibold text-yellow-300">
                Featured / Signature Dish
              </span>
            </label>
          </div>
        </form>

        {/* 3. FIXED / PINNED FOOTER */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md rounded-b-3xl z-10">
          {food && onDelete ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete food item "${food.name}"?`)) {
                  onDelete(food.id);
                  onClose();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-950 border border-red-800/80 text-red-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="food-form"
              disabled={uploadingImage || uploadingVideo}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer transition-all"
            >
              Save Food Item
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
