import { useCallback, useEffect, useState } from 'react';
import { restaurantService } from '../services/restaurantService';
import type { Category, FoodItem, Restaurant } from '../types';

const FAVORITES_KEY = 'aura_user_favorites';

export function useMenuData(slug: string = 'demo-restaurant', tableNumber?: string) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [table, setTable] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await restaurantService.getPublicMenu(slug, tableNumber);
      const restaurantWithSettings = {
        ...data.restaurant,
        settings: data.settings || data.restaurant.settings,
      };
      setRestaurant(restaurantWithSettings);
      setCategories(data.categories);
      setFoods(data.foods);
      setTable(data.table || null);
    } catch (err: any) {
      console.error('Failed to load menu from API:', err);
      setError(err.message || 'Failed to load restaurant menu');
    } finally {
      setLoading(false);
    }
  }, [slug, tableNumber]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleFavorite = (foodId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(foodId) ? prev.filter((id) => id !== foodId) : [...prev, foodId];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save favorites', e);
      }
      return next;
    });
  };

  return {
    restaurant,
    categories,
    foods,
    table,
    favorites,
    loading,
    error,
    toggleFavorite,
    reload: loadData,
  };
}

// Reusable alias hook
export const useMenu = useMenuData;
