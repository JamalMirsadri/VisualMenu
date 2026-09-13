import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Cake,
  Edit2,
  Eye,
  EyeOff,
  Flame,
  Leaf,
  Plus,
  Sparkles,
  Trash2,
  Utensils,
  Wine,
} from 'lucide-react';
import { CategoryFormModal } from '../../components/admin/CategoryFormModal';
import { RestaurantDataGate } from '../../components/admin/RestaurantDataGate';
import { ErrorBanner } from '../../components/admin/ErrorBanner';
import { useAdminData } from '../../hooks/useAdminData';
import type { Category } from '../../types';

const getCategoryIcon = (iconName?: string) => {
  switch (iconName?.toLowerCase()) {
    case 'sparkles':
      return <Sparkles className="w-4 h-4 text-amber-400" />;
    case 'utensils':
      return <Utensils className="w-4 h-4 text-amber-400" />;
    case 'flame':
      return <Flame className="w-4 h-4 text-amber-400" />;
    case 'leaf':
      return <Leaf className="w-4 h-4 text-amber-400" />;
    case 'cake':
      return <Cake className="w-4 h-4 text-amber-400" />;
    case 'wine':
      return <Wine className="w-4 h-4 text-amber-400" />;
    default:
      return <Utensils className="w-4 h-4 text-amber-400" />;
  }
};

import { useAuth } from '../../context/AuthContext';

export const AdminCategoriesPage: React.FC = () => {
  const {
    restaurant,
    categories,
    foods,
    loading,
    error,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  } = useAdminData();

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('MANAGE_CATEGORIES');
  const canDelete = hasPermission('MANAGE_CATEGORIES');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const handleOpenAdd = () => {
    if (!canEdit) return;
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: Category) => {
    if (!canEdit) return;
    setEditingCategory(cat);
    setIsModalOpen(true);
  };

  if (loading || !restaurant) {
    return (
      <RestaurantDataGate
        loading={loading}
        error={error}
        hasRestaurant={Boolean(restaurant)}
        loadingLabel="Loading categories..."
        onRetry={refresh}
      />
    );
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (!canEdit) return;
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= categories.length) return;

    const list = [...categories];
    const temp = list[index];
    list[index] = list[newIdx];
    list[newIdx] = temp;

    reorderCategories(list.map(c => c.id));
  };

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onRetry={refresh} title="Could not load categories" />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl font-bold text-white tracking-wide">
            Menu Categories
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Organize the culinary flow. Category order determines customer navigation order.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Category</span>
        </button>
      </div>

      {/* Category List */}
      <div className="space-y-3">
        {categories.map((category, index) => {
          const dishCount = foods.filter(f => f.categoryId === category.id).length;
          return (
            <div
              key={category.id}
              className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-200 ${
                category.isActive
                  ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                  : 'bg-zinc-950/40 border-zinc-900 opacity-60'
              }`}
            >
              {/* Order + Icon + Info */}
              <div className="flex items-center gap-4 min-w-0">
                {/* Reorder Buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMove(index, 'up')}
                    disabled={index === 0}
                    className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 transition-opacity"
                    title="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(index, 'down')}
                    disabled={index === categories.length - 1}
                    className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 transition-opacity"
                    title="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-zinc-800/80 border border-zinc-700/80 shrink-0">
                  {getCategoryIcon(category.icon)}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-amber-400 font-bold">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-white truncate">
                      {category.name}
                    </h2>
                    {!category.isActive && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 font-medium">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                    {category.description || 'No description added'}
                  </p>
                </div>
              </div>

              {/* Stats & Actions */}
              <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                <span className="hidden sm:inline-block text-xs font-medium text-zinc-400 bg-zinc-800/80 px-2.5 py-1 rounded-full border border-zinc-700">
                  {dishCount} {dishCount === 1 ? 'dish' : 'dishes'}
                </span>

                {/* Visibility Toggle */}
                {canEdit && (
                  <button
                    onClick={() => updateCategory(category.id, { isActive: !category.isActive })}
                    className={`p-2 rounded-xl border transition-colors ${
                      category.isActive
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/50'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                    title={category.isActive ? 'Visible to customers' : 'Hidden from customers'}
                  >
                    {category.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                )}

                {/* Edit */}
                {canEdit && (
                  <button
                    onClick={() => handleOpenEdit(category)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-colors"
                    title="Edit category"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}

                {/* Delete (Owner & Admin only) */}
                {canDelete && (
                  <button
                    onClick={() => setDeletingCategory(category)}
                    className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-400 transition-colors"
                    title="Delete category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Form Modal */}
      <CategoryFormModal
        isOpen={isModalOpen}
        category={editingCategory}
        onClose={() => setIsModalOpen(false)}
        onSave={(data) => {
          if (editingCategory) {
            updateCategory(editingCategory.id, data);
          } else {
            createCategory(data);
          }
        }}
        restaurantId={restaurant.id}
      />

      {/* Delete Confirmation Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-red-800/60 p-6 space-y-4 shadow-2xl">
            <h3 className="font-serif-luxury text-xl font-bold text-white">
              Delete Menu Category?
            </h3>
            <p className="text-sm text-zinc-400">
              Are you sure you want to delete category <span className="text-white font-semibold">{deletingCategory.name}</span>? Dishes assigned to this category will become uncategorized.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteCategory(deletingCategory.id);
                  setDeletingCategory(null);
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
