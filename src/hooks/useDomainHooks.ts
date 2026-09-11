import { useCallback, useEffect, useState } from 'react';
import { restaurantService } from '../services/restaurantService';
import { categoryService } from '../services/categoryService';
import { foodService } from '../services/foodService';
import type { Category, FoodItem, Restaurant } from '../types';

export function useRestaurant(slug: string = 'demo-restaurant') {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRestaurant = useCallback(async () => {
    try {
      setLoading(true);
      const data = await restaurantService.getBySlug(slug);
      setRestaurant(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch restaurant');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchRestaurant();
  }, [fetchRestaurant]);

  return { restaurant, loading, error, refetch: fetchRestaurant };
}

export function useCategories(restaurantId?: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setLoading(true);
      const data = await categoryService.getByRestaurant(restaurantId);
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return { categories, loading, error, refetch: fetchCategories };
}

export function useFoods(restaurantId?: string, categoryId?: string) {
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFoods = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setLoading(true);
      const data = await foodService.getByRestaurant(restaurantId, { categoryId });
      setFoods(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch foods');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, categoryId]);

  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  return { foods, loading, error, refetch: fetchFoods };
}
