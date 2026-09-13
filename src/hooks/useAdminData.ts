import { useCallback, useEffect, useState } from 'react';
import { restaurantService } from '../services/restaurantService';
import { categoryService } from '../services/categoryService';
import { foodService } from '../services/foodService';
import { mediaService } from '../services/mediaService';
import { useAuth } from '../context/AuthContext';
import type { Category, FoodItem, MediaItem, Restaurant } from '../types';

export function useAdminData() {
  const { activeRestaurant } = useAuth();
  const restaurantId = activeRestaurant?.id || '';

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      setError('No restaurant is assigned to your account.');
      setRestaurant(null);
      setCategories([]);
      setFoods([]);
      setMedia([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Fetch restaurant by its UUID (tenant identifier), never by slug.
      const rest = await restaurantService.getById(restaurantId);
      setRestaurant(rest);

      // Concurrently fetch categories, foods, and media. Keep whatever loads and
      // surface a clear error for any sub-resource that failed (never silently
      // collapse a backend error into an empty list).
      const [catsRes, foodsRes, mediaRes] = await Promise.allSettled([
        categoryService.getByRestaurant(rest.id),
        foodService.getByRestaurant(rest.id, { includeDeleted: false }),
        mediaService.getByRestaurant(rest.id),
      ]);

      setCategories(catsRes.status === 'fulfilled' ? catsRes.value : []);
      setFoods(foodsRes.status === 'fulfilled' ? foodsRes.value : []);
      setMedia(mediaRes.status === 'fulfilled' ? mediaRes.value : []);

      const failedLabels: string[] = [];
      if (catsRes.status === 'rejected') failedLabels.push('categories');
      if (foodsRes.status === 'rejected') failedLabels.push('dishes');
      if (mediaRes.status === 'rejected') failedLabels.push('media');

      if (failedLabels.length > 0) {
        setError(
          `Couldn't load ${failedLabels.join(', ')} from the server. Showing available data — retry to reload.`
        );
      }
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
      setError(err.message || 'Failed to fetch restaurant admin data');
      setRestaurant(null);
      setCategories([]);
      setFoods([]);
      setMedia([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Restaurant
  const updateRestaurant = async (data: Partial<Restaurant>) => {
    if (!restaurant) return;
    try {
      const updated = await restaurantService.update(restaurant.id, data);
      setRestaurant(updated);
      return updated;
    } catch (err: any) {
      console.error('Failed to update restaurant:', err);
      throw err;
    }
  };

  // Categories
  const createCategory = async (data: Omit<Category, 'id'>) => {
    if (!restaurant) return;
    try {
      const created = await categoryService.create(restaurant.id, data);
      setCategories((prev) => [...prev, created]);
      return created;
    } catch (err: any) {
      console.error('Failed to create category:', err);
      throw err;
    }
  };

  const updateCategory = async (id: string, data: Partial<Category>) => {
    try {
      const updated = await categoryService.update(id, data);
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    } catch (err: any) {
      console.error('Failed to update category:', err);
      throw err;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await categoryService.delete(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      console.error('Failed to delete category:', err);
      alert(err.message || 'Failed to delete category');
      throw err;
    }
  };

  const reorderCategories = async (ids: string[]) => {
    if (!restaurant) return;
    // Optimistic UI update
    setCategories((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]));
      return ids.map((id, idx) => {
        const item = map.get(id);
        return item ? { ...item, order: idx + 1 } : (item as any);
      }).filter(Boolean);
    });

    try {
      await categoryService.reorder(restaurant.id, ids);
    } catch (err) {
      console.error('Failed to persist category order:', err);
      refresh();
    }
  };

  // Foods
  const createFood = async (data: Omit<FoodItem, 'id'>) => {
    if (!restaurant) return;
    try {
      const created = await foodService.create(restaurant.id, data);
      setFoods((prev) => [...prev, created]);
      return created;
    } catch (err: any) {
      console.error('Failed to create food:', err);
      throw err;
    }
  };

  const updateFood = async (id: string, data: Partial<FoodItem>) => {
    try {
      const updated = await foodService.update(id, data);
      setFoods((prev) => prev.map((f) => (f.id === id ? updated : f)));
      return updated;
    } catch (err: any) {
      console.error('Failed to update food:', err);
      throw err;
    }
  };

  const deleteFood = async (id: string) => {
    try {
      await foodService.delete(id);
      setFoods((prev) => prev.filter((f) => f.id !== id));
    } catch (err: any) {
      console.error('Failed to delete food:', err);
      throw err;
    }
  };

  const duplicateFood = async (id: string) => {
    try {
      const duplicated = await foodService.duplicate(id);
      setFoods((prev) => [...prev, duplicated]);
      return duplicated;
    } catch (err: any) {
      console.error('Failed to duplicate food:', err);
      throw err;
    }
  };

  const reorderFoods = async (ids: string[]) => {
    if (!restaurant) return;
    // Optimistic UI update
    setFoods((prev) => {
      const map = new Map(prev.map((f) => [f.id, f]));
      return ids.map((id, idx) => {
        const item = map.get(id);
        return item ? { ...item, order: idx + 1 } : (item as any);
      }).filter(Boolean);
    });

    try {
      await foodService.reorder(restaurant.id, ids);
    } catch (err) {
      console.error('Failed to persist food order:', err);
      refresh();
    }
  };

  const toggleFoodAvailability = async (id: string, current: boolean) => {
    // Optimistic update
    setFoods((prev) => prev.map((f) => (f.id === id ? { ...f, available: !current } : f)));
    try {
      await foodService.updateAvailability(id, !current);
    } catch (err) {
      console.error('Failed to toggle availability:', err);
      // Revert on error
      setFoods((prev) => prev.map((f) => (f.id === id ? { ...f, available: current } : f)));
    }
  };

  const updateFoodPrice = async (id: string, price: number) => {
    // Optimistic update
    setFoods((prev) => prev.map((f) => (f.id === id ? { ...f, price } : f)));
    try {
      await foodService.updatePrice(id, price);
    } catch (err) {
      console.error('Failed to update price:', err);
      refresh();
    }
  };

  // Media
  const addMedia = async (item: Omit<MediaItem, 'id' | 'createdAt'>) => {
    if (!restaurant) return;
    try {
      const created = await mediaService.create(restaurant.id, item);
      setMedia((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      console.error('Failed to create media:', err);
      throw err;
    }
  };

  const replaceMedia = async (id: string, data: Partial<MediaItem>) => {
    try {
      const updated = await mediaService.replace(id, data);
      setMedia((prev) => prev.map((m) => (m.id === id ? updated : m)));
      // Also refresh foods to pick up synced image/video URLs
      if (restaurant) {
        foodService.getByRestaurant(restaurant.id, { includeDeleted: false }).then(setFoods).catch(() => {});
      }
      return updated;
    } catch (err: any) {
      console.error('Failed to replace media:', err);
      throw err;
    }
  };

  const deleteMedia = async (id: string, force?: boolean) => {
    try {
      await mediaService.delete(id, force);
      setMedia((prev) => prev.filter((m) => m.id !== id));
    } catch (err: any) {
      console.error('Failed to delete media:', err);
      throw err;
    }
  };

  return {
    restaurant,
    categories,
    foods,
    media,
    loading,
    error,
    updateRestaurant,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    createFood,
    updateFood,
    deleteFood,
    duplicateFood,
    reorderFoods,
    toggleFoodAvailability,
    updateFoodPrice,
    addMedia,
    replaceMedia,
    deleteMedia,
    refresh,
  };
}
