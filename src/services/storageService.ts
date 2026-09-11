/**
 * @deprecated
 * PHASE 2 MIGRATION COMPLETE:
 * This local-storage service has been superseded by the PostgreSQL database
 * managed via Prisma and the backend REST API (`/api/*`).
 *
 * All domain data (Restaurants, Categories, Foods, Media, Settings, QR)
 * is authoritatively stored in PostgreSQL.
 * DO NOT use this service for business data.
 */

import { INITIAL_CATEGORIES, INITIAL_FOODS, INITIAL_MEDIA, INITIAL_RESTAURANT } from '../data/seedData';
import type { Category, FoodItem, MediaItem, Restaurant } from '../types';

const RESTAURANT_KEY = 'aura_restaurant_v1';
const CATEGORIES_KEY = 'aura_categories_v1';
const FOODS_KEY = 'aura_foods_v1';
const MEDIA_KEY = 'aura_media_v1';
const SYNC_EVENT = 'aura_data_updated';

type DataListener = () => void;
const listeners = new Set<DataListener>();

function notifyChange() {
  listeners.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('Error in storage listener', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  }
}

class StorageService {
  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('aura_')) {
          notifyChange();
        }
      });
      window.addEventListener(SYNC_EVENT, () => {
        listeners.forEach(cb => {
          try {
            cb();
          } catch (e) {
            console.error('Error in storage listener', e);
          }
        });
      });
    }
  }

  subscribe(listener: DataListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // --- Restaurant ---
  getRestaurant(_slug?: string): Restaurant {
    try {
      const raw = localStorage.getItem(RESTAURANT_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // fallback
    }
    this.saveRestaurant(INITIAL_RESTAURANT);
    return INITIAL_RESTAURANT;
  }

  updateRestaurant(data: Partial<Restaurant>): Restaurant {
    const current = this.getRestaurant();
    const updated: Restaurant = { ...current, ...data };
    this.saveRestaurant(updated);
    notifyChange();
    return updated;
  }

  private saveRestaurant(rest: Restaurant): void {
    try {
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(rest));
    } catch (e) {
      console.error('Failed to persist restaurant', e);
    }
  }

  // --- Categories ---
  getCategories(): Category[] {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      if (raw) {
        const parsed: Category[] = JSON.parse(raw);
        return parsed.sort((a, b) => a.order - b.order);
      }
    } catch {
      // fallback
    }
    this.saveCategories(INITIAL_CATEGORIES);
    return [...INITIAL_CATEGORIES].sort((a, b) => a.order - b.order);
  }

  createCategory(data: Omit<Category, 'id'>): Category {
    const categories = this.getCategories();
    const newCategory: Category = {
      ...data,
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      order: data.order || categories.length + 1,
    };
    categories.push(newCategory);
    this.saveCategories(categories);
    notifyChange();
    return newCategory;
  }

  updateCategory(id: string, data: Partial<Category>): Category {
    const categories = this.getCategories();
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) throw new Error(`Category ${id} not found`);

    const updated = { ...categories[index], ...data };
    categories[index] = updated;
    this.saveCategories(categories);
    notifyChange();
    return updated;
  }

  deleteCategory(id: string): void {
    const categories = this.getCategories().filter(c => c.id !== id);
    this.saveCategories(categories);
    notifyChange();
  }

  reorderCategories(categoryIds: string[]): Category[] {
    const categories = this.getCategories();
    const updated = categories.map(cat => {
      const idx = categoryIds.indexOf(cat.id);
      return idx !== -1 ? { ...cat, order: idx + 1 } : cat;
    });
    this.saveCategories(updated);
    notifyChange();
    return updated.sort((a, b) => a.order - b.order);
  }

  private saveCategories(categories: Category[]): void {
    try {
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    } catch (e) {
      console.error('Failed to persist categories', e);
    }
  }

  // --- Foods ---
  getFoods(filter?: { categoryId?: string; availableOnly?: boolean }): FoodItem[] {
    let list: FoodItem[] = [];
    try {
      const raw = localStorage.getItem(FOODS_KEY);
      if (raw) {
        list = JSON.parse(raw);
      } else {
        list = INITIAL_FOODS;
        this.saveFoods(list);
      }
    } catch {
      list = INITIAL_FOODS;
    }

    list = [...list].sort((a, b) => a.order - b.order);

    if (filter?.categoryId) {
      list = list.filter(f => f.categoryId === filter.categoryId);
    }
    if (filter?.availableOnly) {
      list = list.filter(f => f.available);
    }
    return list;
  }

  getFoodById(id: string): FoodItem | undefined {
    return this.getFoods().find(f => f.id === id);
  }

  createFood(data: Omit<FoodItem, 'id'>): FoodItem {
    const foods = this.getFoods();
    const newFood: FoodItem = {
      ...data,
      id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      order: data.order || foods.length + 1,
    };
    foods.push(newFood);
    this.saveFoods(foods);
    notifyChange();
    return newFood;
  }

  updateFood(id: string, data: Partial<FoodItem>): FoodItem {
    const foods = this.getFoods();
    const index = foods.findIndex(f => f.id === id);
    if (index === -1) throw new Error(`Food ${id} not found`);

    const updated = { ...foods[index], ...data };
    foods[index] = updated;
    this.saveFoods(foods);
    notifyChange();
    return updated;
  }

  deleteFood(id: string): void {
    const foods = this.getFoods().filter(f => f.id !== id);
    this.saveFoods(foods);
    notifyChange();
  }

  duplicateFood(id: string): FoodItem {
    const food = this.getFoodById(id);
    if (!food) throw new Error(`Food ${id} not found`);

    const duplicated: Omit<FoodItem, 'id'> = {
      ...food,
      name: `${food.name} (Copy)`,
      order: food.order + 0.1,
    };
    return this.createFood(duplicated);
  }

  reorderFoods(foodIds: string[]): FoodItem[] {
    const foods = this.getFoods();
    const updated = foods.map(food => {
      const idx = foodIds.indexOf(food.id);
      return idx !== -1 ? { ...food, order: idx + 1 } : food;
    });
    this.saveFoods(updated);
    notifyChange();
    return updated.sort((a, b) => a.order - b.order);
  }

  private saveFoods(foods: FoodItem[]): void {
    try {
      localStorage.setItem(FOODS_KEY, JSON.stringify(foods));
    } catch (e) {
      console.error('Failed to persist foods', e);
    }
  }

  // --- Media ---
  getMedia(): MediaItem[] {
    try {
      const raw = localStorage.getItem(MEDIA_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // fallback
    }
    this.saveMedia(INITIAL_MEDIA);
    return INITIAL_MEDIA;
  }

  addMedia(item: Omit<MediaItem, 'id' | 'createdAt'>): MediaItem {
    const list = this.getMedia();
    const newMedia: MediaItem = {
      ...item,
      id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    list.unshift(newMedia);
    this.saveMedia(list);
    notifyChange();
    return newMedia;
  }

  deleteMedia(id: string): void {
    const list = this.getMedia().filter(m => m.id !== id);
    this.saveMedia(list);
    notifyChange();
  }

  private saveMedia(media: MediaItem[]): void {
    try {
      localStorage.setItem(MEDIA_KEY, JSON.stringify(media));
    } catch (e) {
      console.error('Failed to persist media', e);
    }
  }

  // --- Reset All Data ---
  resetToDefaults(): void {
    try {
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(INITIAL_RESTAURANT));
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(INITIAL_CATEGORIES));
      localStorage.setItem(FOODS_KEY, JSON.stringify(INITIAL_FOODS));
      localStorage.setItem(MEDIA_KEY, JSON.stringify(INITIAL_MEDIA));
      notifyChange();
    } catch (e) {
      console.error('Failed to reset defaults', e);
    }
  }
}

export const storageService = new StorageService();
