import { PaymentStatus, PaymentTransactionType } from '@prisma/client';
import { prisma } from '../../prisma';

export interface ReconciliationReport {
  restaurantId: string;
  generatedAt: string;
  totalOrders: number;
  totalOrderAmount: number;
  totalPaymentsCaptured: number;
  totalRefunds: number;
  netRevenue: number;
  totalsByMethod: Record<string, number>;
  discrepancies: Array<{
    type: string;
    orderId?: string;
    paymentId?: string;
    expected: number;
    actual: number;
    difference: number;
    message: string;
  }>;
}

export class ReconciliationService {
  /**
   * Generates a financial reconciliation report for a restaurant
   */
  public static async reconcileRestaurant(restaurantId: string, startDate?: Date, endDate?: Date): Promise<ReconciliationReport> {
    const whereDate = startDate || endDate ? {
      createdAt: {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      },
    } : {};

    const [orders, payments, transactions] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId,
          ...whereDate,
        },
        include: { payments: true },
      }),
      prisma.payment.findMany({
        where: {
          restaurantId,
          ...whereDate,
        },
        include: {
          order: true,
          transactions: true,
        },
      }),
      prisma.paymentTransaction.findMany({
        where: {
          payment: { restaurantId },
          ...whereDate,
        },
      }),
    ]);

    let totalOrderAmount = 0;
    let totalPaymentsCaptured = 0;
    let totalRefunds = 0;
    const discrepancies: ReconciliationReport['discrepancies'] = [];

    for (const order of orders) {
      const orderTotal = Number(order.total);
      totalOrderAmount += orderTotal;

      const orderPayments = order.payments;
      const successfulPayments = orderPayments.filter(p => p.status === PaymentStatus.PAID);
      const paidTotal = successfulPayments.reduce((acc, p) => acc + Number(p.amount), 0);

      // Check if order marked PAID but amounts mismatch
      if (successfulPayments.length > 0 && Math.abs(orderTotal - paidTotal) > 0.01) {
        discrepancies.push({
          type: 'ORDER_PAYMENT_MISMATCH',
          orderId: order.id,
          expected: orderTotal,
          actual: paidTotal,
          difference: Math.round((paidTotal - orderTotal) * 100) / 100,
          message: `Order #${order.orderNumber} total (€${orderTotal.toFixed(2)}) does not match captured payment (€${paidTotal.toFixed(2)}).`,
        });
      }
    }

    for (const payment of payments) {
      if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.PARTIALLY_REFUNDED || payment.status === PaymentStatus.REFUNDED) {
        totalPaymentsCaptured += Number(payment.amount);

        // Check transaction sums
        const saleTxs = payment.transactions.filter(t => t.type === PaymentTransactionType.SALE && t.status === 'SUCCESS');
        const refundTxs = payment.transactions.filter(t => (t.type === PaymentTransactionType.REFUND || t.type === PaymentTransactionType.PARTIAL_REFUND) && t.status === 'SUCCESS');

        const capturedFromTxs = saleTxs.reduce((acc, t) => acc + Number(t.amount), 0);
        const refundedFromTxs = refundTxs.reduce((acc, t) => acc + Number(t.amount), 0);

        totalRefunds += refundedFromTxs;

        if (refundedFromTxs > Number(payment.amount)) {
          discrepancies.push({
            type: 'REFUND_EXCEEDS_PAYMENT',
            paymentId: payment.id,
            orderId: payment.orderId,
            expected: Number(payment.amount),
            actual: refundedFromTxs,
            difference: Math.round((refundedFromTxs - Number(payment.amount)) * 100) / 100,
            message: `Total refunded (€${refundedFromTxs.toFixed(2)}) exceeds payment amount (€${Number(payment.amount).toFixed(2)}).`,
          });
        }
      }
    }

    const totalsByMethod: Record<string, number> = {
      CASH: 0,
      CARD: 0,
      MBWAY: 0,
      MULTIBANCO: 0,
      OTHER: 0,
    };

    for (const payment of payments) {
      if (
        payment.status === PaymentStatus.PAID ||
        payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
        payment.status === PaymentStatus.REFUNDED
      ) {
        totalsByMethod[payment.method] =
          Math.round(((totalsByMethod[payment.method] || 0) + Number(payment.amount)) * 100) / 100;
      }
    }

    return {
      restaurantId,
      generatedAt: new Date().toISOString(),
      totalOrders: orders.length,
      totalOrderAmount: Math.round(totalOrderAmount * 100) / 100,
      totalPaymentsCaptured: Math.round(totalPaymentsCaptured * 100) / 100,
      totalRefunds: Math.round(totalRefunds * 100) / 100,
      netRevenue: Math.round((totalPaymentsCaptured - totalRefunds) * 100) / 100,
      totalsByMethod,
      discrepancies,
    };
  }
}
