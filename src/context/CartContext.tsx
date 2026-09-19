import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { FoodItem, Order, CartItem, RestaurantSettings } from '../types';
import { orderService } from '../services/orderService';

interface CartContextType {
  items: CartItem[];
  tableNumber: string | null;
  restaurantSlug: string;
  currencySymbol: string;
  customerNote: string;
  isDrawerOpen: boolean;
  isSubmitting: boolean;
  activeOrder: Order | null;
  error: string | null;
  totalItemsCount: number;
  subtotal: number;
  taxEstimate: number;
  serviceChargeEstimate: number;
  totalEstimate: number;
  addPulse: number;
  settings?: RestaurantSettings;
  // Actions
  addItem: (food: FoodItem, quantity?: number, note?: string) => void;
  removeItem: (foodId: string) => void;
  updateQuantity: (foodId: string, quantity: number) => void;
  setCustomerNote: (note: string) => void;
  setTableNumber: (table: string | null) => void;
  setRestaurantContext: (slug: string, currencySymbol: string, settings?: RestaurantSettings) => void;
  openCart: () => void;
  closeCart: () => void;
  clearCart: () => void;
  submitOrder: (options?: {
    paymentMethod?: 'CASH' | 'CARD' | 'MBWAY';
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    nif?: string;
    customerFiscalName?: string;
    customerTaxCountry?: string;
    saveFiscalProfile?: boolean;
  }) => Promise<Order | null>;
  dismissActiveOrder: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [restaurantSlug, setRestaurantSlug] = useState<string>('');
  const [currencySymbol, setCurrencySymbol] = useState<string>('€');
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState<string>('');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | undefined>(undefined);
  const [addPulse, setAddPulse] = useState<number>(0);

  // Restore cart from session storage if same restaurant
  useEffect(() => {
    if (!restaurantSlug) return;
    try {
      const saved = sessionStorage.getItem(`aura_cart_${restaurantSlug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [restaurantSlug]);

  // Persist cart to session storage
  useEffect(() => {
    if (!restaurantSlug) return;
    try {
      sessionStorage.setItem(`aura_cart_${restaurantSlug}`, JSON.stringify(items));
    } catch {
      // Ignore quota errors
    }
  }, [items, restaurantSlug]);

  const setRestaurantContext = (slug: string, symbol: string, s?: RestaurantSettings) => {
    setRestaurantSlug(slug);
    setCurrencySymbol(symbol);
    if (s) setSettings(s);
  };

  const addItem = (food: FoodItem, quantity: number = 1, note?: string) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((item) => item.food.id === food.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + quantity;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          customerNote: note !== undefined ? note : updated[existingIdx].customerNote,
        };
        return updated;
      }
      return [...prev, { food, quantity, customerNote: note }];
    });
    setAddPulse((p) => p + 1);
    setError(null);
  };

  const removeItem = (foodId: string) => {
    setItems((prev) => prev.filter((item) => item.food.id !== foodId));
  };

  const updateQuantity = (foodId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(foodId);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.food.id === foodId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
    setCustomerNote('');
    setError(null);
    if (restaurantSlug) {
      sessionStorage.removeItem(`aura_cart_${restaurantSlug}`);
    }
  };

  const openCart = () => setIsDrawerOpen(true);
  const closeCart = () => setIsDrawerOpen(false);
  const dismissActiveOrder = () => setActiveOrder(null);

  // Computations
  const totalItemsCount = useMemo(
    () => items.reduce((acc, item) => acc + item.quantity, 0),
    [items]
  );

  const subtotal = useMemo(
    () =>
      Math.round(
        items.reduce((acc, item) => acc + Number(item.food.price) * item.quantity, 0) * 100
      ) / 100,
    [items]
  );

  const taxEstimate = useMemo(() => {
    if (!settings?.taxEnabled) return 0;
    const rate = Number(settings.taxRate) || 0;
    return Math.round(subtotal * (rate / 100) * 100) / 100;
  }, [subtotal, settings]);

  const serviceChargeEstimate = useMemo(() => {
    if (!settings?.serviceChargeEnabled) return 0;
    const rate = Number(settings.serviceChargeRate) || 0;
    return Math.round(subtotal * (rate / 100) * 100) / 100;
  }, [subtotal, settings]);

  const totalEstimate = useMemo(
    () => Math.round((subtotal + taxEstimate + serviceChargeEstimate) * 100) / 100,
    [subtotal, taxEstimate, serviceChargeEstimate]
  );

  const submitOrder = async (options?: {
    paymentMethod?: 'CASH' | 'CARD' | 'MBWAY';
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    nif?: string;
    customerFiscalName?: string;
    customerTaxCountry?: string;
    saveFiscalProfile?: boolean;
  }): Promise<Order | null> => {
    if (!restaurantSlug || items.length === 0) return null;

    setIsSubmitting(true);
    setError(null);

    try {
      const order = await orderService.createOrder({
        restaurantSlug,
        tableNumber: tableNumber || undefined,
        customerNote: customerNote.trim() || undefined,
        paymentMethod: options?.paymentMethod,
        customerName: options?.customerName,
        customerEmail: options?.customerEmail,
        customerPhone: options?.customerPhone,
        nif: options?.nif,
        customerFiscalName: options?.customerFiscalName,
        customerTaxCountry: options?.customerTaxCountry,
        saveFiscalProfile: options?.saveFiscalProfile,
        items: items.map((i) => ({
          foodItemId: i.food.id,
          quantity: i.quantity,
          customerNote: i.customerNote,
        })),
      });

      setActiveOrder(order);
      clearCart();
      return order;
    } catch (err: any) {
      const msg = err.message || 'Failed to place order. Please try again.';
      setError(msg);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CartContext.Provider
      value={{
        items,
        tableNumber,
        restaurantSlug,
        currencySymbol,
        customerNote,
        isDrawerOpen,
        isSubmitting,
        activeOrder,
        error,
        totalItemsCount,
        subtotal,
        taxEstimate,
        serviceChargeEstimate,
        totalEstimate,
        addPulse,
        settings,
        addItem,
        removeItem,
        updateQuantity,
        setCustomerNote,
        setTableNumber,
        setRestaurantContext,
        openCart,
        closeCart,
        clearCart,
        submitOrder,
        dismissActiveOrder,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
