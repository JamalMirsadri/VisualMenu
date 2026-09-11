import { Role, PrismaClient } from '@prisma/client';

export type PermissionKey =
  // GENERAL
  | 'VIEW_DASHBOARD'
  // ORDERS
  | 'VIEW_ORDERS'
  | 'VIEW_ORDER_DETAILS'
  | 'UPDATE_ORDER_STATUS'
  | 'CONFIRM_ORDER'
  | 'CANCEL_ORDER'
  | 'MARK_ORDER_SERVED'
  | 'MARK_ORDER_COMPLETED'
  // KITCHEN
  | 'VIEW_KITCHEN'
  | 'VIEW_KITCHEN_ORDERS'
  | 'UPDATE_KITCHEN_STATUS'
  | 'CONFIRM_PREPARATION'
  | 'MARK_READY'
  // TABLES
  | 'VIEW_TABLES'
  | 'MANAGE_TABLES'
  | 'MANAGE_TABLE_QR'
  | 'VIEW_FLOOR'
  | 'ASSIGN_ORDERS'
  | 'TRANSFER_TABLE'
  // MENU
  | 'VIEW_MENU'
  | 'MANAGE_MENU'
  | 'MANAGE_CATEGORIES'
  | 'MANAGE_FOODS'
  | 'MANAGE_FOOD_PRICES'
  | 'TOGGLE_FOOD_AVAILABILITY'
  // MEDIA
  | 'VIEW_MEDIA'
  | 'UPLOAD_MEDIA'
  | 'MANAGE_MEDIA'
  // CUSTOMERS
  | 'VIEW_CUSTOMERS'
  | 'MANAGE_CUSTOMERS'
  | 'VIEW_CUSTOMER_FISCAL_DATA'
  // PAYMENTS
  | 'VIEW_PAYMENTS'
  | 'PROCESS_PAYMENTS'
  | 'CONFIRM_CASH_PAYMENT'
  | 'VIEW_PAYMENT_STATUS'
  // FISCAL
  | 'VIEW_FISCAL'
  | 'MANAGE_FISCAL_SETTINGS'
  | 'VIEW_NIF_DATA'
  | 'MANAGE_RECEIPTS'
  // STAFF
  | 'VIEW_STAFF'
  | 'CREATE_STAFF'
  | 'EDIT_STAFF'
  | 'DISABLE_STAFF'
  | 'MANAGE_STAFF_PERMISSIONS'
  // RESTAURANT SETTINGS
  | 'VIEW_RESTAURANT_SETTINGS'
  | 'MANAGE_RESTAURANT_SETTINGS'
  // BRANDING
  | 'VIEW_BRANDING'
  | 'MANAGE_BRANDING'
  // REPORTING
  | 'VIEW_REPORTS'
  | 'VIEW_FINANCIAL_REPORTS'
  | 'VIEW_SALES_REPORTS'
  // AUDIT
  | 'VIEW_AUDIT_LOGS'
  // QR
  | 'VIEW_QR_CODES'
  | 'MANAGE_QR_CODES'
  // LEGACY ALIASES (Phase 5/9 backward compatibility)
  | 'MANAGE_USERS'
  | 'MANAGE_RESTAURANT'
  | 'TOGGLE_AVAILABILITY';

// For backward compatibility with existing imports
export type Permission = PermissionKey;

export interface PermissionDefinition {
  key: PermissionKey;
  group: string;
  label: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // GENERAL
  {
    key: 'VIEW_DASHBOARD',
    group: 'General',
    label: 'View Dashboard',
    description: 'Access the main restaurant operations dashboard and real-time activity metrics.',
  },

  // ORDERS
  {
    key: 'VIEW_ORDERS',
    group: 'Orders',
    label: 'View Orders',
    description: 'Access the live dining room orders feed and order list.',
  },
  {
    key: 'VIEW_ORDER_DETAILS',
    group: 'Orders',
    label: 'View Order Details',
    description: 'Inspect full item snapshots, special instructions, and customer details on tickets.',
  },
  {
    key: 'UPDATE_ORDER_STATUS',
    group: 'Orders',
    label: 'Update Order Status',
    description: 'Advance or transition orders through the lifecycle pipeline.',
  },
  {
    key: 'CONFIRM_ORDER',
    group: 'Orders',
    label: 'Confirm Order',
    description: 'Acknowledge incoming customer orders and send them to the kitchen.',
  },
  {
    key: 'CANCEL_ORDER',
    group: 'Orders',
    label: 'Cancel Order',
    description: 'Void or cancel an active dining room order.',
  },
  {
    key: 'MARK_ORDER_SERVED',
    group: 'Orders',
    label: 'Mark Order Served',
    description: 'Confirm dishes have been delivered to the customer table.',
  },
  {
    key: 'MARK_ORDER_COMPLETED',
    group: 'Orders',
    label: 'Mark Order Completed',
    description: 'Complete the dining session after service and payment settlement.',
  },

  // KITCHEN
  {
    key: 'VIEW_KITCHEN',
    group: 'Kitchen',
    label: 'View Kitchen KDS',
    description: 'Access the Kitchen Display System interface.',
  },
  {
    key: 'VIEW_KITCHEN_ORDERS',
    group: 'Kitchen',
    label: 'View Kitchen Orders',
    description: 'View active cook orders, prep queues, and ticket timers.',
  },
  {
    key: 'UPDATE_KITCHEN_STATUS',
    group: 'Kitchen',
    label: 'Update Kitchen Status',
    description: 'Change order and individual line item statuses inside the kitchen.',
  },
  {
    key: 'CONFIRM_PREPARATION',
    group: 'Kitchen',
    label: 'Confirm Preparation',
    description: 'Move order tickets into active preparation on the line.',
  },
  {
    key: 'MARK_READY',
    group: 'Kitchen',
    label: 'Mark Ready for Service',
    description: 'Notify waiters and floor staff that dishes are plated and ready at the pass.',
  },

  // TABLES
  {
    key: 'VIEW_TABLES',
    group: 'Tables',
    label: 'View Tables',
    description: 'View dining room layout, table numbers, and occupancy state.',
  },
  {
    key: 'MANAGE_TABLES',
    group: 'Tables',
    label: 'Manage Tables',
    description: 'Add, edit, move, or delete dining tables in the room.',
  },
  {
    key: 'MANAGE_TABLE_QR',
    group: 'Tables',
    label: 'Manage Table QR Codes',
    description: 'Generate, download, and configure dynamic table QR codes.',
  },

  // MENU
  {
    key: 'VIEW_MENU',
    group: 'Menu',
    label: 'View Menu',
    description: 'View menu catalog, category listings, and dish configurations.',
  },
  {
    key: 'MANAGE_MENU',
    group: 'Menu',
    label: 'Manage Menu Structure',
    description: 'Full administrative control over restaurant menu offerings.',
  },
  {
    key: 'MANAGE_CATEGORIES',
    group: 'Menu',
    label: 'Manage Categories',
    description: 'Create, reorder, rename, and delete menu categories.',
  },
  {
    key: 'MANAGE_FOODS',
    group: 'Menu',
    label: 'Manage Food Items',
    description: 'Create, update descriptions, ingredients, allergens, and remove dishes.',
  },
  {
    key: 'MANAGE_FOOD_PRICES',
    group: 'Menu',
    label: 'Manage Food Prices',
    description: 'Modify prices, currencies, and promotional pricing for dishes.',
  },
  {
    key: 'TOGGLE_FOOD_AVAILABILITY',
    group: 'Menu',
    label: 'Toggle Dish Availability',
    description: '86 or un-86 items in real time when ingredients run out.',
  },

  // MEDIA
  {
    key: 'VIEW_MEDIA',
    group: 'Media',
    label: 'View Media Library',
    description: 'Browse the restaurant photo and video asset library.',
  },
  {
    key: 'UPLOAD_MEDIA',
    group: 'Media',
    label: 'Upload Media',
    description: 'Upload high-resolution photography and cinematic MP4 videos.',
  },
  {
    key: 'MANAGE_MEDIA',
    group: 'Media',
    label: 'Manage Media Assets',
    description: 'Replace media files, edit alt texts, link dishes, and delete assets.',
  },

  // CUSTOMERS
  {
    key: 'VIEW_CUSTOMERS',
    group: 'Customers',
    label: 'View Customers Directory',
    description: 'View guest contact directory, order counts, and dining history.',
  },
  {
    key: 'MANAGE_CUSTOMERS',
    group: 'Customers',
    label: 'Manage Customers',
    description: 'Update customer profiles, VIP tags, and contact preferences.',
  },
  {
    key: 'VIEW_CUSTOMER_FISCAL_DATA',
    group: 'Customers',
    label: 'View Customer Fiscal / NIF Data',
    description: 'Access sensitive tax identification numbers (NIF/VAT) and billing addresses.',
  },

  // PAYMENTS
  {
    key: 'VIEW_PAYMENTS',
    group: 'Payments',
    label: 'View Payments Ledger',
    description: 'Inspect transaction receipts, amounts, and settlement statuses.',
  },
  {
    key: 'PROCESS_PAYMENTS',
    group: 'Payments',
    label: 'Process Digital Payments',
    description: 'Initiate Card or MB WAY terminal requests from the floor.',
  },
  {
    key: 'CONFIRM_CASH_PAYMENT',
    group: 'Payments',
    label: 'Confirm Cash Payment',
    description: 'Acknowledge cash drawer transactions and compute server change.',
  },
  {
    key: 'VIEW_PAYMENT_STATUS',
    group: 'Payments',
    label: 'View Payment Status',
    description: 'Check whether a dining table ticket has been marked paid or pending.',
  },

  // FISCAL
  {
    key: 'VIEW_FISCAL',
    group: 'Fiscal',
    label: 'View Fiscal Documents',
    description: 'Browse sequential fiscal receipts and audit tax breakdowns.',
  },
  {
    key: 'MANAGE_FISCAL_SETTINGS',
    group: 'Fiscal',
    label: 'Manage Fiscal Settings',
    description: 'Configure restaurant VAT series, legal tax identifiers, and certification data.',
  },
  {
    key: 'VIEW_NIF_DATA',
    group: 'Fiscal',
    label: 'View NIF Tax Ledgers',
    description: 'Export and review tax records for fiscal authorities.',
  },
  {
    key: 'MANAGE_RECEIPTS',
    group: 'Fiscal',
    label: 'Manage Fiscal Receipts',
    description: 'Issue, reprint, or void technical fiscal receipts.',
  },

  // STAFF
  {
    key: 'VIEW_STAFF',
    group: 'Staff',
    label: 'View Staff & Team',
    description: 'View employee directory, roles, and status within the restaurant.',
  },
  {
    key: 'CREATE_STAFF',
    group: 'Staff',
    label: 'Create / Invite Staff',
    description: 'Issue new onboarding invitations and add team members.',
  },
  {
    key: 'EDIT_STAFF',
    group: 'Staff',
    label: 'Edit Staff Profiles',
    description: 'Update employee contact details and job titles.',
  },
  {
    key: 'DISABLE_STAFF',
    group: 'Staff',
    label: 'Disable / Remove Staff',
    description: 'Suspend restaurant access or delete team memberships.',
  },
  {
    key: 'MANAGE_STAFF_PERMISSIONS',
    group: 'Staff',
    label: 'Manage Staff Permissions',
    description: 'Customize individual permissions across the matrix for employees.',
  },

  // RESTAURANT SETTINGS
  {
    key: 'VIEW_RESTAURANT_SETTINGS',
    group: 'Restaurant Settings',
    label: 'View Restaurant Settings',
    description: 'Inspect restaurant operational hours, currency, and general config.',
  },
  {
    key: 'MANAGE_RESTAURANT_SETTINGS',
    group: 'Restaurant Settings',
    label: 'Manage Restaurant Settings',
    description: 'Update restaurant legal identity, contact info, service charge, and operational policies.',
  },

  // BRANDING
  {
    key: 'VIEW_BRANDING',
    group: 'Branding',
    label: 'View Branding Studio',
    description: 'Inspect restaurant visual themes, color tokens, and logo assets.',
  },
  {
    key: 'MANAGE_BRANDING',
    group: 'Branding',
    label: 'Manage Branding Studio',
    description: 'Modify luxury color palettes, typography, theme presets, and presentation modes.',
  },

  // REPORTING
  {
    key: 'VIEW_REPORTS',
    group: 'Reporting',
    label: 'View General Reports',
    description: 'Access daily service counts and basic operational summaries.',
  },
  {
    key: 'VIEW_FINANCIAL_REPORTS',
    group: 'Reporting',
    label: 'View Financial Reports',
    description: 'Inspect cash drawer balances, revenue summaries, and payment reconciliation.',
  },
  {
    key: 'VIEW_SALES_REPORTS',
    group: 'Reporting',
    label: 'View Sales Analytics',
    description: 'Examine top-selling dishes, category performance, and hourly volume.',
  },

  // AUDIT
  {
    key: 'VIEW_AUDIT_LOGS',
    group: 'Audit',
    label: 'View Audit Logs',
    description: 'Inspect tamper-evident system logs and operational activity records.',
  },

  // QR
  {
    key: 'VIEW_QR_CODES',
    group: 'QR',
    label: 'View QR Codes',
    description: 'Browse and test QR codes for digital menus and dining tables.',
  },
  {
    key: 'MANAGE_QR_CODES',
    group: 'QR',
    label: 'Manage QR Codes',
    description: 'Create customized restaurant menu and table QR destinations.',
  },
];

export type RoleTemplate =
  | 'WAITER'
  | 'KITCHEN'
  | 'CASHIER'
  | 'HOST'
  | 'SUPERVISOR'
  | 'ACCOUNTING'
  | 'CUSTOM';

export const ROLE_TEMPLATES: Record<RoleTemplate, PermissionKey[]> = {
  WAITER: [
    'VIEW_DASHBOARD',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'CONFIRM_ORDER',
    'UPDATE_ORDER_STATUS',
    'MARK_ORDER_SERVED',
    'VIEW_KITCHEN',
    'VIEW_KITCHEN_ORDERS',
    'CONFIRM_PREPARATION',
    'MARK_READY',
    'VIEW_TABLES',
    'VIEW_PAYMENTS',
    'CONFIRM_CASH_PAYMENT',
    'VIEW_PAYMENT_STATUS',
  ],

  KITCHEN: [
    'VIEW_DASHBOARD',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'VIEW_KITCHEN',
    'VIEW_KITCHEN_ORDERS',
    'UPDATE_KITCHEN_STATUS',
    'CONFIRM_PREPARATION',
    'MARK_READY',
  ],

  CASHIER: [
    'VIEW_DASHBOARD',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'MARK_ORDER_COMPLETED',
    'VIEW_PAYMENTS',
    'PROCESS_PAYMENTS',
    'CONFIRM_CASH_PAYMENT',
    'VIEW_PAYMENT_STATUS',
    'VIEW_CUSTOMERS',
  ],

  HOST: [
    'VIEW_DASHBOARD',
    'VIEW_TABLES',
    'VIEW_QR_CODES',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'VIEW_CUSTOMERS',
  ],

  SUPERVISOR: [
    'VIEW_DASHBOARD',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'UPDATE_ORDER_STATUS',
    'CONFIRM_ORDER',
    'CANCEL_ORDER',
    'MARK_ORDER_SERVED',
    'MARK_ORDER_COMPLETED',
    'VIEW_KITCHEN',
    'VIEW_KITCHEN_ORDERS',
    'UPDATE_KITCHEN_STATUS',
    'CONFIRM_PREPARATION',
    'MARK_READY',
    'VIEW_TABLES',
    'MANAGE_TABLES',
    'VIEW_MENU',
    'TOGGLE_FOOD_AVAILABILITY',
    'VIEW_CUSTOMERS',
    'MANAGE_CUSTOMERS',
    'VIEW_PAYMENTS',
    'PROCESS_PAYMENTS',
    'CONFIRM_CASH_PAYMENT',
    'VIEW_PAYMENT_STATUS',
    'VIEW_REPORTS',
  ],

  ACCOUNTING: [
    'VIEW_DASHBOARD',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'VIEW_PAYMENTS',
    'VIEW_PAYMENT_STATUS',
    'VIEW_FISCAL',
    'VIEW_NIF_DATA',
    'MANAGE_RECEIPTS',
    'VIEW_CUSTOMERS',
    'VIEW_CUSTOMER_FISCAL_DATA',
    'VIEW_REPORTS',
    'VIEW_FINANCIAL_REPORTS',
    'VIEW_SALES_REPORTS',
    'VIEW_AUDIT_LOGS',
  ],

  CUSTOM: [],
};

// Default fallback permissions for existing Phase 1-10 role memberships
export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  [Role.OWNER]: PERMISSION_CATALOG.map((p) => p.key),
  [Role.ADMIN]: [
    'VIEW_DASHBOARD',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'UPDATE_ORDER_STATUS',
    'CONFIRM_ORDER',
    'CANCEL_ORDER',
    'MARK_ORDER_SERVED',
    'MARK_ORDER_COMPLETED',
    'VIEW_KITCHEN',
    'VIEW_KITCHEN_ORDERS',
    'UPDATE_KITCHEN_STATUS',
    'CONFIRM_PREPARATION',
    'MARK_READY',
    'VIEW_TABLES',
    'MANAGE_TABLES',
    'MANAGE_TABLE_QR',
    'VIEW_MENU',
    'MANAGE_MENU',
    'MANAGE_CATEGORIES',
    'MANAGE_FOODS',
    'MANAGE_FOOD_PRICES',
    'TOGGLE_FOOD_AVAILABILITY',
    'VIEW_MEDIA',
    'UPLOAD_MEDIA',
    'MANAGE_MEDIA',
    'VIEW_CUSTOMERS',
    'MANAGE_CUSTOMERS',
    'VIEW_CUSTOMER_FISCAL_DATA',
    'VIEW_PAYMENTS',
    'PROCESS_PAYMENTS',
    'CONFIRM_CASH_PAYMENT',
    'VIEW_PAYMENT_STATUS',
    'VIEW_FISCAL',
    'MANAGE_FISCAL_SETTINGS',
    'VIEW_NIF_DATA',
    'MANAGE_RECEIPTS',
    'VIEW_STAFF',
    'CREATE_STAFF',
    'EDIT_STAFF',
    'DISABLE_STAFF',
    'MANAGE_STAFF_PERMISSIONS',
    'VIEW_RESTAURANT_SETTINGS',
    'MANAGE_RESTAURANT_SETTINGS',
    'VIEW_BRANDING',
    'MANAGE_BRANDING',
    'VIEW_REPORTS',
    'VIEW_FINANCIAL_REPORTS',
    'VIEW_SALES_REPORTS',
    'VIEW_AUDIT_LOGS',
    'VIEW_QR_CODES',
    'MANAGE_QR_CODES',
    // Backward compatibility aliases
    'MANAGE_USERS',
    'MANAGE_RESTAURANT',
    'TOGGLE_AVAILABILITY',
  ],
  [Role.MANAGER]: [
    'VIEW_DASHBOARD',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'UPDATE_ORDER_STATUS',
    'CONFIRM_ORDER',
    'CANCEL_ORDER',
    'MARK_ORDER_SERVED',
    'MARK_ORDER_COMPLETED',
    'VIEW_KITCHEN',
    'VIEW_KITCHEN_ORDERS',
    'UPDATE_KITCHEN_STATUS',
    'CONFIRM_PREPARATION',
    'MARK_READY',
    'VIEW_TABLES',
    'MANAGE_TABLES',
    'VIEW_MENU',
    'MANAGE_MENU',
    'MANAGE_CATEGORIES',
    'MANAGE_FOODS',
    'TOGGLE_FOOD_AVAILABILITY',
    'VIEW_MEDIA',
    'UPLOAD_MEDIA',
    'VIEW_CUSTOMERS',
    'MANAGE_CUSTOMERS',
    'VIEW_PAYMENTS',
    'PROCESS_PAYMENTS',
    'CONFIRM_CASH_PAYMENT',
    'VIEW_PAYMENT_STATUS',
    'VIEW_REPORTS',
    'VIEW_QR_CODES',
    // Backward compatibility aliases
    'TOGGLE_AVAILABILITY',
  ],
  [Role.STAFF]: [
    'VIEW_DASHBOARD',
    'VIEW_ORDERS',
    'VIEW_ORDER_DETAILS',
    'UPDATE_ORDER_STATUS',
    'MARK_ORDER_SERVED',
    'VIEW_KITCHEN',
    'VIEW_KITCHEN_ORDERS',
    'CONFIRM_PREPARATION',
    'MARK_READY',
    'VIEW_TABLES',
    'VIEW_PAYMENTS',
    'CONFIRM_CASH_PAYMENT',
    'VIEW_PAYMENT_STATUS',
    'TOGGLE_FOOD_AVAILABILITY',
    // Backward compatibility aliases
    'TOGGLE_AVAILABILITY',
  ],
};

/**
 * Normalizes legacy permission queries to modern catalog keys
 */
export function normalizePermissionKey(permission: string): string[] {
  switch (permission) {
    case 'MANAGE_USERS':
      return ['MANAGE_USERS', 'VIEW_STAFF', 'CREATE_STAFF', 'EDIT_STAFF', 'DISABLE_STAFF', 'MANAGE_STAFF_PERMISSIONS'];
    case 'MANAGE_RESTAURANT':
      return ['MANAGE_RESTAURANT', 'MANAGE_RESTAURANT_SETTINGS', 'VIEW_RESTAURANT_SETTINGS'];
    case 'TOGGLE_AVAILABILITY':
      return ['TOGGLE_AVAILABILITY', 'TOGGLE_FOOD_AVAILABILITY'];
    case 'VIEW_FLOOR':
      return ['VIEW_FLOOR', 'VIEW_TABLES', 'VIEW_ORDERS'];
    case 'ASSIGN_ORDERS':
      return ['ASSIGN_ORDERS', 'UPDATE_ORDER_STATUS', 'MANAGE_TABLES'];
    case 'TRANSFER_TABLE':
      return ['TRANSFER_TABLE', 'MANAGE_TABLES', 'UPDATE_ORDER_STATUS'];
    default:
      return [permission];
  }
}

/**
 * Checks whether a role or membership possesses a given permission.
 * OWNER always has full access.
 */
export function hasPermission(
  role: Role,
  permission: string,
  customPermissions?: string[]
): boolean {
  if (role === Role.OWNER) {
    return true;
  }

  const equivalentKeys = normalizePermissionKey(permission);

  // If custom relational permissions are present, evaluate them
  if (customPermissions !== undefined) {
    return equivalentKeys.some((k) => customPermissions.includes(k));
  }

  // Fallback to role defaults
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  return equivalentKeys.some((k) => rolePerms.includes(k as PermissionKey));
}

/**
 * Deterministically seeds the permissions table in PostgreSQL
 */
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const perm of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {
        group: perm.group,
        label: perm.label,
        description: perm.description,
        active: true,
      },
      create: {
        key: perm.key,
        group: perm.group,
        label: perm.label,
        description: perm.description,
        active: true,
      },
    });
  }
}
