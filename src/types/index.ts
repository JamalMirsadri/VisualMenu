export type ThemeId = 'DARK_LUXURY' | 'LIGHT_MINIMAL' | 'WARM_RESTAURANT' | 'MODERN_GLASS';
export type PresentationMode = 'INDIVIDUAL_VIDEO' | 'SHARED_ENVIRONMENT' | 'VISUAL_IMAGE';
export type CategoryNavStyle = 'PILLS' | 'TEXT' | 'MINIMAL' | 'ICON_PLUS_TEXT';
export type ProgressIndicatorStyle = 'BARS' | 'DOTS' | 'NUMBERS' | 'NONE';
export type FoodInfoPosition = 'BOTTOM' | 'SIDE' | 'OVERLAY';
export type LightingPreset = 'WARM' | 'COOL' | 'DRAMATIC' | 'NATURAL';
export type FoodEntranceAnimation = 'FADE_UP' | 'SCALE_UP' | 'SLIDE_RIGHT' | 'SMOOTH';
export type FoodExitAnimation = 'FADE_DOWN' | 'SCALE_DOWN' | 'SLIDE_LEFT' | 'SMOOTH';
export type CameraMotion = 'GENTLE_ZOOM' | 'SLOW_PAN' | 'STATIC';
export type OverlayStyle = 'SUBTLE' | 'MEDIUM' | 'HEAVY' | 'GRADIENT';
export type CardStyle = 'ROUNDED_LG' | 'ROUNDED_XL' | 'ROUNDED_2XL' | 'SQUARE' | 'GLASS';
export type ButtonStyle = 'PILL' | 'ROUNDED' | 'SQUARE' | 'OUTLINE';
export type TextStyle = 'SANS' | 'SERIF' | 'MODERN';

export interface RestaurantTheme {
  primaryColor: string;
  accentColor: string;
  darkLuxury: boolean;
}

export interface RestaurantSettings {
  id?: string;
  restaurantId?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  theme: string; // DARK_LUXURY | LIGHT_MINIMAL | WARM_RESTAURANT | MODERN_GLASS
  presentationMode: 'INDIVIDUAL_VIDEO' | 'SHARED_ENVIRONMENT' | 'VISUAL_IMAGE' | 'individual' | 'shared-environment' | 'reels' | string;
  language: string;
  secondaryLanguage?: string;
  showPrices: boolean;
  showCalories: boolean;
  showPreparationTime: boolean;
  textStyle?: string;
  buttonStyle?: string;
  backgroundStyle?: string;
  cardStyle?: string;
  animationStyle?: string;
  categoryStyle?: string;
  foodInfoPosition?: string;
  progressIndicatorStyle?: string;
  environmentBackground?: string;
  tableSurface?: string;
  lightingPreset?: string;
  foodEntranceAnimation?: string;
  foodExitAnimation?: string;
  cameraMotion?: string;
  overlayStyle?: string;
  showAllergens?: boolean;
  showIngredients?: boolean;
  showFavoriteButton?: boolean;
  showDetailsButton?: boolean;
  showOrderButton?: boolean;
  taxEnabled?: boolean;
  taxRate?: number | string;
  serviceChargeEnabled?: boolean;
  serviceChargeRate?: number | string;
  kdsWarningMinutes?: number;
  kdsUrgentMinutes?: number;
}

export interface Table {
  id: string;
  restaurantId: string;
  number: string;
  name: string;
  capacity: number;
  location?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderItemStatus =
  | 'PENDING'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'CANCELLED';

export interface OrderItem {
  id: string;
  orderId: string;
  foodItemId: string;
  foodNameSnapshot: string;
  unitPrice: number | string;
  quantity: number;
  lineTotal: number | string;
  customerNote?: string | null;
  status: OrderItemStatus;
}

export interface OrderStatusHistoryItem {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  changedByUserId?: string | null;
  changedByUser?: { id: string; name: string; email: string } | null;
  metadata?: any;
  createdAt: string;
}

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';

export type PaymentMethod = 'CASH' | 'CARD' | 'MBWAY';

export type PaymentStatus =
  | 'UNPAID'
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type PaymentTransactionType =
  | 'AUTHORIZATION'
  | 'CAPTURE'
  | 'VOID'
  | 'REFUND'
  | 'WEBHOOK_NOTIFICATION';

export type FiscalDocumentType =
  | 'INVOICE'
  | 'RECEIPT'
  | 'SIMPLIFIED_INVOICE'
  | 'CREDIT_NOTE';

export type FiscalDocumentStatus = 'ISSUED' | 'CANCELLED' | 'RECTIFIED';

export interface PaymentTransaction {
  id: string;
  paymentId: string;
  type: PaymentTransactionType;
  amount: number | string;
  currency: string;
  providerTransactionId?: string | null;
  status: string;
  rawPayload?: any;
  createdAt: string;
}

export interface FiscalDocument {
  id: string;
  restaurantId: string;
  orderId?: string | null;
  paymentId?: string | null;
  documentType: FiscalDocumentType;
  series: string;
  documentNumber: string;
  customerNif?: string | null;
  customerName?: string | null;
  customerTaxCountry?: string | null;
  subtotal: number | string;
  taxAmount: number | string;
  total: number | string;
  currency: string;
  snapshot: any;
  status: FiscalDocumentStatus;
  issuedAt: string;
  hash?: string | null;
}

export interface CustomerFiscalProfile {
  id: string;
  customerId: string;
  nif: string;
  legalName: string;
  taxCountry: string;
  billingAddress?: string | null;
  billingPostalCode?: string | null;
  billingCity?: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  restaurantId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  consentGiven: boolean;
  consentTimestamp?: string | null;
  createdAt: string;
  fiscalProfiles?: CustomerFiscalProfile[];
  orders?: Partial<Order>[];
  _count?: { orders: number };
}

export interface Payment {
  id: string;
  restaurantId: string;
  orderId: string;
  method: PaymentMethod;
  provider: string;
  providerPaymentId?: string | null;
  status: PaymentStatus;
  amount: number | string;
  currency: string;
  refundedAmount: number | string;
  amountReceived?: number | string | null;
  changeGiven?: number | string | null;
  receivedByUserId?: string | null;
  receivedByUser?: { id: string; name: string; email: string } | null;
  idempotencyKey?: string | null;
  metadata?: any;
  authorizedAt?: string | null;
  capturedAt?: string | null;
  failedAt?: string | null;
  refundedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  transactions?: PaymentTransaction[];
  fiscalDocuments?: FiscalDocument[];
  order?: Partial<Order>;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId?: string | null;
  publicToken: string;
  idempotencyKey?: string | null;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number | string;
  tax: number | string;
  discount: number | string;
  serviceCharge: number | string;
  total: number | string;
  currency: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  nif?: string | null;
  customerFiscalName?: string | null;
  customerTaxCountry?: string | null;
  customerNote?: string | null;
  cancellationReason?: string | null;
  assignedWaiterUserRestaurantId?: string | null;
  priority?: 'NORMAL' | 'HIGH' | 'URGENT';
  assignedWaiter?: {
    id: string;
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  } | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  table?: Table | null;
  items: OrderItem[];
  statusHistory?: OrderStatusHistoryItem[];
  payments?: Payment[];
  receipts?: FiscalDocument[];
  restaurant?: Restaurant;
}

export type TableOperationalState =
  | 'AVAILABLE'
  | 'ORDER_PENDING'
  | 'ORDER_ACTIVE'
  | 'PREPARING'
  | 'READY_TO_SERVE'
  | 'SERVED'
  | 'AWAITING_PAYMENT'
  | 'PAID';

export interface TableOperationalInfo {
  id: string;
  number: string;
  name: string;
  capacity: number;
  location?: string | null;
  active: boolean;
  state: TableOperationalState;
  activeOrderCount: number;
  activeOrders: Order[];
  assignedWaiters: Array<{
    userRestaurantId: string;
    userId: string;
    name: string;
    email: string;
  }>;
  totalUnpaidAmount: number;
  lastStateChangeAt: string | null;
  minutesInCurrentState: number;
}

export interface FloorSummary {
  totalTables: number;
  availableTables: number;
  occupiedTables: number;
  ordersPreparing: number;
  ordersReadyToServe: number;
  awaitingPayment: number;
  totalActiveOrders: number;
  tables: TableOperationalInfo[];
}

export interface RestaurantMember {
  id: string;
  userId?: string;
  membershipId: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  joinedAt: string;
  createdAt?: string;
  user?: { id: string; name: string; email: string };
}

export interface CartItem {
  food: FoodItem;
  quantity: number;
  customerNote?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logo: string;
  coverImage?: string;
  description: string;
  phone: string;
  address: string;
  website: string;
  currency: string;
  currencySymbol: string;
  primaryLanguage: string;
  secondaryLanguage: string;
  openingHours: string;
  active?: boolean;
  isActive: boolean;
  isMenuActive: boolean;
  themeColor?: string;
  theme: RestaurantTheme;
  settings?: RestaurantSettings;
  favicon?: string;
}


export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  image?: string;
  order: number;
  isActive: boolean;
}

export interface FoodItem {
  id: string;
  restaurantId: string;
  name: string;
  tagline?: string;
  description?: string;
  price: number;
  currency: string;
  currencySymbol: string;
  categoryId: string;
  image?: string | null;
  video?: string | null;
  ingredients: string[];
  allergens: string[];
  spicyLevel?: number; // 0 to 3
  preparationTime?: number; // minutes
  available: boolean;
  featured: boolean;
  order: number;
  calories?: number;
}

export interface MediaItem {
  id: string;
  restaurantId?: string;
  foodItemId?: string | null;
  foodItem?: { id: string; name: string } | null;
  title?: string;
  filename?: string | null;
  type: 'image' | 'video' | 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl?: string | null;
  duration?: string | null;
  size?: number | null;
  mimeType?: string | null;
  altText?: string | null;
  isPrimary?: boolean;
  width?: number | null;
  height?: number | null;
  desktopUrl?: string | null;
  mobileUrl?: string | null;
  posterUrl?: string | null;
  sourceType?: 'UPLOAD' | 'EXTERNAL_URL' | string;
  tags?: string[];
  createdAt?: string;
}

export type PlatformRole = 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT' | 'PLATFORM_VIEWER';

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PlatformMetrics {
  totalRestaurants: number;
  activeRestaurants: number;
  inactiveRestaurants: number;
  totalUsers: number;
  platformUsers: number;
  ordersToday: number;
  openOrders: number;
  paymentsToday: number;
  revenueToday: number;
  totalRevenue: number;
  systemHealth: {
    database: string;
    uptimeSeconds: number;
    timestamp: string;
  };
}

export type ProvisioningStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type OwnerInvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'NONE';

export interface OwnerInvitationInfo {
  id: string;
  status: OwnerInvitationStatus;
  invitedEmail: string;
  invitedName: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface CreateRestaurantProvisioningInput {
  name: string;
  slug: string;
  legalName?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  currency?: string;
  currencySymbol?: string;
  ownerName: string;
  ownerEmail: string;
  theme?: string;
  presentationMode?: string;
  language?: string;
  taxRate?: number;
  serviceChargeRate?: number;
}

export interface PlatformRestaurantItem {
  id: string;
  name: string;
  slug: string;
  tagline?: string | null;
  logo?: string | null;
  address?: string | null;
  currency: string;
  currencySymbol: string;
  defaultLanguage: string;
  active: boolean;
  provisioningStatus?: ProvisioningStatus;
  createdAt: string;
  owner?: {
    id: string;
    name: string;
    email: string;
  } | null;
  plan: string;
  dishCount: number;
  categoryCount: number;
  tableCount: number;
  orderCount: number;
  userCount: number;
}

export interface PlatformAuditItem {
  id: string;
  restaurantId?: string | null;
  userId?: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTIVATE' | 'DEACTIVATE' | 'CONTEXT_ENTER' | 'CONTEXT_EXIT' | string;
  entityType: string;
  entityId: string;
  actorPlatformRole?: PlatformRole | null;
  ipAddress?: string | null;
  metadata?: any;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    platformRole?: PlatformRole | null;
  } | null;
  restaurant?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface PlatformSettingsData {
  id: string;
  platformName: string;
  supportEmail: string;
  defaultCurrency: string;
  defaultLanguage: string;
  maintenanceMode: boolean;
  allowRegistration: boolean;
  systemNotice?: string | null;
  featureFlags?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// PHASE 11A — STAFF MANAGEMENT & PERMISSIONS TYPES
// -----------------------------------------------------------------------------
export type StaffRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';
export type StaffStatus = 'ACTIVE' | 'DISABLED';

export type RoleTemplate =
  | 'WAITER'
  | 'KITCHEN'
  | 'CASHIER'
  | 'HOST'
  | 'SUPERVISOR'
  | 'ACCOUNTING'
  | 'CUSTOM';

export interface PermissionDefinition {
  key: string;
  group: string;
  label: string;
  description: string;
}

export interface StaffMember {
  id: string;
  membershipId: string;
  email: string;
  name: string;
  role: StaffRole;
  jobTemplate?: string | null;
  status: StaffStatus;
  active: boolean;
  permissions: string[];
  joinedAt: string;
}

export interface StaffInvitationItem {
  id: string;
  invitedEmail: string;
  invitedName: string;
  phone?: string | null;
  role: StaffRole;
  jobTemplate?: string | null;
  stagedPermissions: string[];
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface StaffInvitationValidateResult {
  valid: boolean;
  invitedEmail: string;
  invitedName: string;
  role: StaffRole;
  jobTemplate?: string | null;
  expiresAt: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    currency: string;
    currencySymbol: string;
    defaultLanguage: string;
  };
}


