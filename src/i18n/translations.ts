export type SupportedLanguage = 'en' | 'pt' | 'fa';

export interface TranslationDictionary {
  menu: string;
  categories: string;
  allCategories: string;
  ingredients: string;
  allergens: string;
  calories: string;
  prepTime: string;
  orderNow: string;
  addToCart: string;
  table: string;
  viewDetails: string;
  close: string;
  back: string;
  spicy: string;
  featured: string;
  available: string;
  soldOut: string;
  cart: string;
  cartEmpty: string;
  subtotal: string;
  tax: string;
  serviceCharge: string;
  total: string;
  placeOrder: string;
  orderSuccess: string;
  trackOrder: string;
  orderStatus: string;
  specialInstructions: string;
  allergensDisclaimer: string;
  switchLanguage: string;
  mins: string;
  kcal: string;
  desktopPreviewNotice: string;
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    menu: 'Visual Menu',
    categories: 'Categories',
    allCategories: 'All',
    ingredients: 'Ingredients',
    allergens: 'Allergens',
    calories: 'Calories',
    prepTime: 'Preparation',
    orderNow: 'Order Now',
    addToCart: 'Add to Order',
    table: 'Table',
    viewDetails: 'Details',
    close: 'Close',
    back: 'Back',
    spicy: 'Spicy',
    featured: "Chef's Special",
    available: 'Available',
    soldOut: 'Sold Out',
    cart: 'Your Order',
    cartEmpty: 'Your order is empty',
    subtotal: 'Subtotal',
    tax: 'Tax',
    serviceCharge: 'Service Charge',
    total: 'Total',
    placeOrder: 'Confirm Order',
    orderSuccess: 'Order Placed Successfully',
    trackOrder: 'Track Live Status',
    orderStatus: 'Order Status',
    specialInstructions: 'Special Instructions',
    allergensDisclaimer: 'Please inform staff of severe allergies.',
    switchLanguage: 'Language',
    mins: 'mins',
    kcal: 'kcal',
    desktopPreviewNotice: 'Interactive Food Experience',
  },
  pt: {
    menu: 'Cardápio Visual',
    categories: 'Categorias',
    allCategories: 'Todos',
    ingredients: 'Ingredientes',
    allergens: 'Alérgenos',
    calories: 'Calorias',
    prepTime: 'Preparo',
    orderNow: 'Pedir Agora',
    addToCart: 'Adicionar ao Pedido',
    table: 'Mesa',
    viewDetails: 'Detalhes',
    close: 'Fechar',
    back: 'Voltar',
    spicy: 'Picante',
    featured: 'Especial do Chef',
    available: 'Disponível',
    soldOut: 'Esgotado',
    cart: 'Seu Pedido',
    cartEmpty: 'Seu pedido está vazio',
    subtotal: 'Subtotal',
    tax: 'Imposto',
    serviceCharge: 'Taxa de Serviço',
    total: 'Total',
    placeOrder: 'Confirmar Pedido',
    orderSuccess: 'Pedido Enviado com Sucesso',
    trackOrder: 'Acompanhar em Tempo Real',
    orderStatus: 'Status do Pedido',
    specialInstructions: 'Instruções Especiais',
    allergensDisclaimer: 'Informe a equipe em caso de alergias graves.',
    switchLanguage: 'Idioma',
    mins: 'min',
    kcal: 'kcal',
    desktopPreviewNotice: 'Experiência Gastronômica Interativa',
  },
  fa: {
    menu: 'منوی تصویری',
    categories: 'دسته‌بندی‌ها',
    allCategories: 'همه',
    ingredients: 'مواد اولیه',
    allergens: 'حساسیت‌زاها',
    calories: 'کالری',
    prepTime: 'زمان آماده‌سازی',
    orderNow: 'ثبت سفارش',
    addToCart: 'افزودن به سفارش',
    table: 'میز',
    viewDetails: 'جزئیات',
    close: 'بستن',
    back: 'بازگشت',
    spicy: 'تند',
    featured: 'پیشنهاد سرآشپز',
    available: 'موجود',
    soldOut: 'ناموجود',
    cart: 'سفارش شما',
    cartEmpty: 'سبد سفارش شما خالی است',
    subtotal: 'جمع جزء',
    tax: 'مالیات',
    serviceCharge: 'حق سرویس',
    total: 'مجموع نهایی',
    placeOrder: 'تایید و ثبت نهایی',
    orderSuccess: 'سفارش با موفقیت ثبت شد',
    trackOrder: 'پیگیری لحظه‌ای',
    orderStatus: 'وضعیت سفارش',
    specialInstructions: 'یادداشت یا توضیحات خاص',
    allergensDisclaimer: 'لطفاً هرگونه حساسیت شدید را به کادر سالن اطلاع دهید.',
    switchLanguage: 'زبان',
    mins: 'دقیقه',
    kcal: 'کالری',
    desktopPreviewNotice: 'تجربه تعاملی غذا',
  },
};

export function getLanguageDirection(language?: string): 'rtl' | 'ltr' {
  if (!language) return 'ltr';
  const clean = language.toLowerCase().trim();
  return clean === 'fa' || clean === 'ar' || clean === 'he' || clean === 'ur' ? 'rtl' : 'ltr';
}

export function getTranslations(language?: string): TranslationDictionary {
  if (!language) return TRANSLATIONS.en;
  const clean = language.toLowerCase().trim() as SupportedLanguage;
  return TRANSLATIONS[clean] || TRANSLATIONS.en;
}
