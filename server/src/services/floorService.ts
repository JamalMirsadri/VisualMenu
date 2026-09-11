import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export type TableOperationalState =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'ORDER_PENDING'
  | 'ORDER_ACTIVE'
  | 'PREPARING'
  | 'READY_TO_SERVE'
  | 'SERVED'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'CLEANING';

export interface FloorTableSummary {
  id: string;
  number: string;
  name: string | null;
  capacity: number;
  location: string | null;
  active: boolean;
  state: TableOperationalState;
  derivedState: TableOperationalState;
  activeOrderCount: number;
  activeOrdersCount: number;
  totalUnpaidAmount: number;
  activeOrders?: any[];
  assignedWaiters?: any[];
  activeOrder: {
    id: string;
    orderNumber: string;
    publicToken: string;
    status: string;
    priority: string;
    createdAt: string;
    customerNote?: string | null;
    customerName?: string | null;
    itemsCount: number;
    itemsSummary: Array<{
      id: string;
      name: string;
      quantity: number;
      status: string;
    }>;
    kitchenProgress: {
      pending: number;
      preparing: number;
      ready: number;
      served: number;
      total: number;
      isPartiallyReady: boolean;
      isAllReady: boolean;
    };
    assignedWaiter: {
      id: string;
      userRestaurantId: string;
      name: string;
      email: string;
    } | null;
    payment?: {
      status: string;
      method?: string;
      total?: number;
      amountDue?: number;
      isPaid: boolean;
    };
    elapsedMinutes: number;
  } | null;
  qrCodeUrl?: string | null;
}

export interface FloorOverviewResponse {
  restaurantId: string;
  totalTables: number;
  availableTables: number;
  occupiedTables: number;
  ordersPreparing: number;
  ordersReadyToServe: number;
  awaitingPayment: number;
  paidCount: number;
  totalActiveOrders: number;
  summary: {
    totalTables: number;
    availableCount: number;
    occupiedCount: number;
    preparingCount: number;
    readyCount: number;
    awaitingPaymentCount: number;
    paidCount: number;
    activeOrdersCount: number;
  };
  tables: FloorTableSummary[];
}

export class FloorService {
  /**
   * Computes the derived operational state for a table based on its active orders and payment records.
   */
  public static deriveTableState(
    table: { active: boolean },
    activeOrders: any[]
  ): TableOperationalState {
    if (!table.active) {
      return 'AVAILABLE';
    }

    const unresolvedOrders = activeOrders.filter(
      (o) => !['COMPLETED', 'CANCELLED'].includes(o.status)
    );

    if (unresolvedOrders.length === 0) {
      // Check if the most recent completed order has an unsettled payment
      const recentCompleted = activeOrders.find((o) => o.status === 'COMPLETED');
      if (recentCompleted) {
        const latestPayment = recentCompleted.payments?.[0];
        if (latestPayment && !['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(latestPayment.status)) {
          return 'AWAITING_PAYMENT';
        }
      }
      return 'AVAILABLE';
    }

    // Priority 1: Ready to Serve
    const hasReady = unresolvedOrders.some((o) => o.status === 'READY');
    if (hasReady) {
      return 'READY_TO_SERVE';
    }

    // Priority 2: Preparing in Kitchen
    const isPreparing = unresolvedOrders.some(
      (o) =>
        o.status === 'PREPARING' ||
        (o.items && o.items.some((it: any) => it.status === 'PREPARING'))
    );
    if (isPreparing) {
      return 'PREPARING';
    }

    // Priority 3: Served, check payment status
    const hasServed = unresolvedOrders.some((o) => o.status === 'SERVED');
    if (hasServed) {
      const latestPayment = unresolvedOrders.find((o) => o.status === 'SERVED')?.payments?.[0];
      if (latestPayment?.status === 'PAID') {
        return 'PAID';
      }
      return 'AWAITING_PAYMENT';
    }

    // Priority 4: Confirmed (Accepted by waitstaff, waiting for kitchen)
    const hasConfirmed = unresolvedOrders.some((o) => o.status === 'CONFIRMED');
    if (hasConfirmed) {
      return 'ORDER_ACTIVE';
    }

    // Priority 5: Pending customer submission
    const hasPending = unresolvedOrders.some((o) => o.status === 'PENDING');
    if (hasPending) {
      return 'ORDER_PENDING';
    }

    return 'OCCUPIED';
  }

  /**
   * Retrieves full floor state for a restaurant with permission-aware field filtering.
   */
  public static async getRestaurantFloorState(
    restaurantId: string,
    options: {
      canViewPayments?: boolean;
      canViewCustomers?: boolean;
      allowPaymentMetrics?: boolean;
      filterAssignedUserId?: string;
    } = {}
  ): Promise<FloorOverviewResponse> {
    const canViewPayments = Boolean(options.canViewPayments || options.allowPaymentMetrics);

    const tables = await prisma.table.findMany({
      where: { restaurantId },
      orderBy: [{ number: 'asc' }],
      include: {
        qrCodes: {
          where: { active: true },
          select: { slug: true, targetValue: true },
        },
        orders: {
          where: { status: { notIn: ['CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            items: true,
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            assignedWaiter: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    let availableCount = 0;
    let occupiedCount = 0;
    let preparingCount = 0;
    let readyCount = 0;
    let awaitingPaymentCount = 0;
    let paidCount = 0;
    let totalActiveOrders = 0;

    const tableSummaries: FloorTableSummary[] = tables.map((table) => {
      const activeOrders = table.orders.filter(
        (o) => !['COMPLETED', 'CANCELLED'].includes(o.status)
      );
      totalActiveOrders += activeOrders.length;

      const derivedState = this.deriveTableState(table, table.orders);

      switch (derivedState) {
        case 'AVAILABLE':
          availableCount++;
          break;
        case 'PREPARING':
          preparingCount++;
          occupiedCount++;
          break;
        case 'READY_TO_SERVE':
          readyCount++;
          occupiedCount++;
          break;
        case 'AWAITING_PAYMENT':
          awaitingPaymentCount++;
          occupiedCount++;
          break;
        case 'PAID':
          paidCount++;
          occupiedCount++;
          break;
        default:
          occupiedCount++;
          break;
      }

      const totalUnpaidAmount = canViewPayments
        ? activeOrders.reduce((sum, o) => {
            const isPaid = o.payments?.[0]?.status === 'PAID';
            return isPaid ? sum : sum + Number(o.total || 0);
          }, 0)
        : 0;

      // Pick primary active order (most recent active, or most recent overall)
      const primaryOrder = activeOrders[0] || table.orders[0] || null;

      let activeOrderData: FloorTableSummary['activeOrder'] = null;

      if (primaryOrder) {
        const now = Date.now();
        const createdTime = new Date(primaryOrder.createdAt).getTime();
        const elapsedMinutes = Math.max(0, Math.floor((now - createdTime) / 60000));

        const items = primaryOrder.items || [];
        const pendingItems = items.filter((it: any) => it.status === 'PENDING').length;
        const preparingItems = items.filter((it: any) => it.status === 'PREPARING').length;
        const readyItems = items.filter((it: any) => it.status === 'READY').length;
        const servedItems = items.filter((it: any) => it.status === 'SERVED').length;

        const isAllReady = items.length > 0 && readyItems + servedItems === items.length;
        const isPartiallyReady = readyItems > 0 && !isAllReady;

        activeOrderData = {
          id: primaryOrder.id,
          orderNumber: primaryOrder.orderNumber,
          publicToken: primaryOrder.publicToken,
          status: primaryOrder.status,
          priority: (primaryOrder as any).priority || 'NORMAL',
          createdAt: primaryOrder.createdAt.toISOString(),
          customerNote: primaryOrder.customerNote,
          customerName: options.canViewCustomers ? primaryOrder.customerName : undefined,
          itemsCount: items.reduce((acc: number, it: any) => acc + (it.quantity || 1), 0),
          itemsSummary: items.slice(0, 5).map((it: any) => ({
            id: it.id,
            name: it.foodNameSnapshot,
            quantity: it.quantity,
            status: it.status,
          })),
          kitchenProgress: {
            pending: pendingItems,
            preparing: preparingItems,
            ready: readyItems,
            served: servedItems,
            total: items.length,
            isPartiallyReady,
            isAllReady,
          },
          assignedWaiter: primaryOrder.assignedWaiter
            ? {
                id: primaryOrder.assignedWaiter.userId,
                userRestaurantId: primaryOrder.assignedWaiter.id,
                name: primaryOrder.assignedWaiter.user?.name || 'Assigned Waiter',
                email: primaryOrder.assignedWaiter.user?.email || '',
              }
            : null,
          elapsedMinutes,
        };

        // Payment visibility gate
        if (canViewPayments) {
          const latestPayment = primaryOrder.payments?.[0];
          const isPaid = latestPayment?.status === 'PAID';
          activeOrderData.payment = {
            status: latestPayment?.status || 'UNPAID',
            method: latestPayment?.method,
            total: Number(primaryOrder.total),
            amountDue: isPaid ? 0 : Number(primaryOrder.total),
            isPaid,
          };
        }
      }

      return {
        id: table.id,
        number: table.number,
        name: table.name,
        capacity: table.capacity,
        location: table.location,
        active: table.active,
        state: derivedState,
        derivedState,
        activeOrderCount: activeOrders.length,
        activeOrdersCount: activeOrders.length,
        totalUnpaidAmount: Math.round(totalUnpaidAmount * 100) / 100,
        activeOrder: activeOrderData,
        qrCodeUrl: table.qrCodes?.[0]?.targetValue || null,
      };
    });

    return {
      restaurantId,
      totalTables: tables.length,
      availableTables: availableCount,
      occupiedTables: occupiedCount,
      ordersPreparing: preparingCount,
      ordersReadyToServe: readyCount,
      awaitingPayment: awaitingPaymentCount,
      paidCount,
      totalActiveOrders,
      summary: {
        totalTables: tables.length,
        availableCount,
        occupiedCount,
        preparingCount,
        readyCount,
        awaitingPaymentCount,
        paidCount,
        activeOrdersCount: totalActiveOrders,
      },
      tables: tableSummaries,
    };
  }
}

export const floorService = FloorService;
