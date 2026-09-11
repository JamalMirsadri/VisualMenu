import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit,
  Eye,
  Film,
  Flame,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { FoodFormModal } from '../../components/admin/FoodFormModal';
import { useAdminData } from '../../hooks/useAdminData';
import { useAuth } from '../../context/AuthContext';
import type { FoodItem } from '../../types';

export const AdminFoodsPage: React.FC = () => {
  const {
    restaurant,
    categories,
    foods,
    loading,
    createFood,
    updateFood,
    deleteFood,
    duplicateFood,
    reorderFoods,
    toggleFoodAvailability,
    updateFoodPrice,
  } = useAdminData();

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('MANAGE_FOODS');
  const canDelete = hasPermission('MANAGE_FOODS');
  const canToggleAvailability = hasPermission('TOGGLE_FOOD_AVAILABILITY') || hasPermission('TOGGLE_AVAILABILITY');
  const canManagePrices = hasPermission('MANAGE_FOOD_PRICES');

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'video' | 'image_only'>('all');
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const [previewFood, setPreviewFood] = useState<FoodItem | null>(null);
  const [deletingFood, setDeletingFood] = useState<FoodItem | null>(null);

  // Filtered Foods
  const filteredFoods = foods.filter((food) => {
    const matchesCategory =
      selectedCategoryFilter === 'all' || food.categoryId === selectedCategoryFilter;
    const matchesSearch =
      food.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (food.description && food.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      food.ingredients?.some((i) => i.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesAvailability =
      availabilityFilter === 'all'
        ? true
        : availabilityFilter === 'available'
        ? food.available
        : !food.available;
    const matchesMedia =
      mediaFilter === 'all'
        ? true
        : mediaFilter === 'video'
        ? Boolean(food.video)
        : !food.video;
    const matchesFeatured = onlyFeatured ? food.featured : true;

    return matchesCategory && matchesSearch && matchesAvailability && matchesMedia && matchesFeatured;
  });

  const handleOpenAdd = () => {
    if (!canEdit) return;
    setEditingFood(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (food: FoodItem) => {
    if (!canEdit) return;
    setEditingFood(food);
    setIsModalOpen(true);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (!canEdit) return;
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= foods.length) return;

    const list = [...foods];
    const temp = list[index];
    list[index] = list[newIdx];
    list[newIdx] = temp;

    reorderFoods(list.map((f) => f.id));
  };

  if (loading || !restaurant) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="text-sm font-medium">Loading culinary items...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl font-bold text-white tracking-wide">
            Food Items & Culinary Offerings
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage presentation, media, live pricing, and customer visibility across mobile menus.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Dish</span>
          </button>
        )}
      </div>

      {/* Advanced Filter & Search Toolbar */}
      <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ingredients, description..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-start sm:justify-end">
            {/* Availability */}
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value as any)}
              className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-xl px-2.5 py-2 focus:outline-none focus:border-amber-400"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available Only</option>
              <option value="unavailable">Unavailable (86-ed)</option>
            </select>

            {/* Media */}
            <select
              value={mediaFilter}
              onChange={(e) => setMediaFilter(e.target.value as any)}
              className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-xl px-2.5 py-2 focus:outline-none focus:border-amber-400"
            >
              <option value="all">All Media</option>
              <option value="video">Has Video</option>
              <option value="image_only">Image Only</option>
            </select>

            {/* Signature Toggle */}
            <button
              onClick={() => setOnlyFeatured(!onlyFeatured)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                onlyFeatured
                  ? 'bg-yellow-400 text-black'
                  : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Signatures</span>
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-zinc-800/60">
          <button
            onClick={() => setSelectedCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 ${
              selectedCategoryFilter === 'all'
                ? 'bg-amber-500 text-black font-semibold'
                : 'bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            All Categories ({foods.length})
          </button>
          {categories.map((cat) => {
            const count = foods.filter((f) => f.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 ${
                  selectedCategoryFilter === cat.id
                    ? 'bg-amber-500 text-black font-semibold'
                    : 'bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Food Items List */}
      <div className="space-y-3">
        {filteredFoods.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-sm bg-zinc-900/20 rounded-2xl border border-dashed border-zinc-800">
            No dishes matched the selected filters.
          </div>
        ) : (
          filteredFoods.map((food, index) => {
            const category = categories.find((c) => c.id === food.categoryId);
            return (
              <div
                key={food.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border transition-all duration-200 gap-4 ${
                  food.available
                    ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                    : 'bg-zinc-950/40 border-zinc-900 opacity-60'
                }`}
              >
                {/* Left: Thumbnail & Info */}
                <div className="flex items-start sm:items-center gap-4 min-w-0">
                  {/* Reorder Buttons */}
                  {canEdit && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => handleMove(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 transition-opacity"
                        title="Move up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleMove(index, 'down')}
                        disabled={index === foods.length - 1}
                        className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 transition-opacity"
                        title="Move down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Thumbnail */}
                  <div
                    onClick={() => setPreviewFood(food)}
                    className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shrink-0 bg-zinc-900 border border-zinc-700 cursor-pointer group flex items-center justify-center"
                    title="Click to preview dish"
                  >
                    {food.image ? (
                      <img
                        src={food.image}
                        alt={food.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : food.video ? (
                      <div className="w-full h-full bg-black relative flex items-center justify-center">
                        <video
                          src={food.video}
                          muted
                          playsInline
                          className="w-full h-full object-cover opacity-70"
                        />
                        <Film className="w-5 h-5 text-amber-400 absolute z-10" />
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-950 flex flex-col items-center justify-center p-1.5 text-center">
                        <UtensilsCrossed className="w-5 h-5 text-amber-400/80 mb-0.5" />
                        <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter truncate w-full">
                          {food.name}
                        </span>
                      </div>
                    )}
                    {food.video && food.image && (
                      <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[8px] text-amber-400 font-bold flex items-center gap-0.5">
                        <Film className="w-2.5 h-2.5" /> VID
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Eye className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold uppercase">
                        {category?.name || 'Uncategorized'}
                      </span>
                      {food.featured && (
                        <span className="px-2 py-0.5 rounded bg-yellow-400 text-black text-[10px] font-bold uppercase">
                          Signature
                        </span>
                      )}
                      {food.spicyLevel && food.spicyLevel > 0 ? (
                        <span className="text-[11px] text-red-400 flex items-center">
                          <Flame className="w-3 h-3 inline mr-0.5" />
                          {'🌶️'.repeat(food.spicyLevel)}
                        </span>
                      ) : null}
                    </div>

                    <h2
                      onClick={() => (canEdit ? handleOpenEdit(food) : setPreviewFood(food))}
                      className="text-sm sm:text-base font-bold text-white hover:text-amber-300 cursor-pointer truncate"
                    >
                      {food.name}
                    </h2>
                    <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                      {food.tagline || food.description}
                    </p>
                  </div>
                </div>

                {/* Right: Inline Price Editor & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800">
                  {/* Inline Price Change (Editable for Manager/Admin/Owner, read-only for Staff) */}
                  <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5">
                    <span className="text-xs text-amber-400 font-bold">{food.currencySymbol}</span>
                    {canManagePrices ? (
                      <input
                        type="number"
                        step="0.50"
                        min="0"
                        value={food.price}
                        onChange={(e) => updateFoodPrice(food.id, Number(e.target.value))}
                        className="w-16 bg-transparent text-sm font-bold text-white focus:outline-none text-right"
                      />
                    ) : (
                      <span className="text-sm font-bold text-white px-1">
                        {food.price.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Instant Availability Toggle */}
                  {canToggleAvailability ? (
                    <button
                      onClick={() => toggleFoodAvailability(food.id, food.available)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-colors cursor-pointer ${
                        food.available
                          ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/60'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
                      }`}
                    >
                      {food.available ? 'Available' : 'Unavailable'}
                    </button>
                  ) : (
                    <span
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wide border flex items-center gap-1 ${
                        food.available
                          ? 'bg-emerald-950/20 text-emerald-400/60 border-emerald-800/40'
                          : 'bg-zinc-800/40 text-zinc-500 border-zinc-800'
                      }`}
                    >
                      {food.available ? 'Available' : 'Unavailable'}
                    </span>
                  )}

                  {/* Preview Button */}
                  <button
                    onClick={() => setPreviewFood(food)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
                    title="Preview card"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {/* Duplicate */}
                  {canEdit && (
                    <button
                      onClick={() => duplicateFood(food.id)}
                      className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
                      title="Duplicate dish"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}

                  {/* Edit */}
                  {canEdit && (
                    <button
                      onClick={() => handleOpenEdit(food)}
                      className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200"
                      title="Edit dish"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}

                  {/* Delete (Owner & Admin only) */}
                  {canDelete && (
                    <button
                      onClick={() => setDeletingFood(food)}
                      className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-400"
                      title="Delete dish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Food Modal */}
      <FoodFormModal
        isOpen={isModalOpen}
        food={editingFood}
        categories={categories}
        onClose={() => setIsModalOpen(false)}
        onSave={(data) => {
          if (editingFood) {
            updateFood(editingFood.id, data);
          } else {
            createFood(data);
          }
        }}
        onDelete={(id) => deleteFood(id)}
        restaurantId={restaurant.id}
        defaultCurrency={restaurant.currency}
        defaultCurrencySymbol={restaurant.currencySymbol}
      />

      {/* Dish Interactive Preview Modal */}
      {previewFood && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-3xl bg-zinc-950 border border-amber-500/30 overflow-hidden shadow-2xl">
            <button
              onClick={() => setPreviewFood(null)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/60 text-white hover:bg-black/90"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="relative aspect-square w-full bg-black flex items-center justify-center">
              {previewFood.image ? (
                <img
                  src={previewFood.image}
                  alt={previewFood.name}
                  className="w-full h-full object-cover"
                />
              ) : previewFood.video ? (
                <video
                  src={previewFood.video}
                  controls
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-b from-zinc-900 via-zinc-950 to-black flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-400/30 flex items-center justify-center mb-3">
                    <UtensilsCrossed className="w-8 h-8 text-amber-400" />
                  </div>
                  <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                    {restaurant?.name || 'AURA'}
                  </span>
                  <span className="text-sm font-medium text-zinc-400 mt-1">
                    Signature Offering
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-black/30 pointer-events-none" />
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-semibold uppercase">
                  {categories.find((c) => c.id === previewFood.categoryId)?.name || 'Dish'}
                </span>
                <span className="font-serif-luxury text-2xl font-bold gold-gradient-text">
                  {previewFood.currencySymbol}{previewFood.price.toFixed(2)}
                </span>
              </div>
              <h3 className="font-serif-luxury text-xl font-bold text-white">
                {previewFood.name}
              </h3>
              {previewFood.tagline && (
                <p className="text-xs text-amber-200 italic">{previewFood.tagline}</p>
              )}
              <p className="text-xs text-zinc-400 leading-relaxed">
                {previewFood.description}
              </p>
              {previewFood.ingredients && previewFood.ingredients.length > 0 && (
                <div className="pt-2 border-t border-zinc-800">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-400 block mb-1">
                    Ingredients
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {previewFood.ingredients.map((ing, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300"
                      >
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingFood && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-red-800/60 p-6 space-y-4 shadow-2xl">
            <h3 className="font-serif-luxury text-xl font-bold text-white">
              Delete Culinary Item?
            </h3>
            <p className="text-sm text-zinc-400">
              Are you sure you want to delete <span className="text-white font-semibold">{deletingFood.name}</span>? This action is tracked in the audit log and performs a database soft-delete.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingFood(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteFood(deletingFood.id);
                  setDeletingFood(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-600/30"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
