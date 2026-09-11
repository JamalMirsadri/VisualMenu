import React, { useEffect, useState } from 'react';
import { Cake, Flame, Leaf, Sparkles, Utensils, Wine, X } from 'lucide-react';
import type { Category } from '../../types';

interface CategoryFormModalProps {
  isOpen: boolean;
  category?: Category | null;
  onClose: () => void;
  onSave: (data: Omit<Category, 'id'>) => void;
  restaurantId: string;
}

const ICON_OPTIONS = [
  { label: 'Sparkles', value: 'Sparkles', icon: Sparkles },
  { label: 'Utensils', value: 'Utensils', icon: Utensils },
  { label: 'Flame', value: 'Flame', icon: Flame },
  { label: 'Leaf', value: 'Leaf', icon: Leaf },
  { label: 'Cake', value: 'Cake', icon: Cake },
  { label: 'Wine', value: 'Wine', icon: Wine },
];

export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  isOpen,
  category,
  onClose,
  onSave,
  restaurantId,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Utensils');
  const [image, setImage] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [order, setOrder] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description);
      setIcon(category.icon || 'Utensils');
      setImage(category.image || '');
      setIsActive(category.isActive);
      setOrder(category.order);
    } else {
      setName('');
      setDescription('');
      setIcon('Utensils');
      setImage('');
      setIsActive(true);
      setOrder(1);
    }
    setError('');
  }, [category, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    onSave({
      restaurantId,
      name: name.trim(),
      slug,
      description: description.trim(),
      icon,
      image: image.trim() || undefined,
      isActive,
      order: Number(order) || 1,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-zinc-100 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold font-serif-luxury text-amber-400 mb-4">
          {category ? 'Edit Category' : 'Create Category'}
        </h2>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Category Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grill, Starters, Desserts"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short poetic or culinary description for this category"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          {/* Icon Selector */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Category Icon
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {ICON_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setIcon(opt.value)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs transition-all ${
                    icon === opt.value
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <opt.icon className="w-4 h-4" />
                  <span className="text-[10px]">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
              Cover Image URL (Optional)
            </label>
            <input
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-medium">
                Display Order
              </label>
              <input
                type="number"
                min="1"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                />
                <span className="text-xs font-medium text-zinc-300">Category Active</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold uppercase tracking-wider shadow-lg shadow-amber-500/20"
            >
              Save Category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
