import { Prisma, PaymentMethod, PaymentStatus, PaymentTransactionType, AuditAction } from '@prisma/client';
import { prisma } from '../../prisma';
import { AuditService } from '../auditService';
import { defaultFiscalProvider } from '../fiscal/fiscalProvider';
import { realtimeService } from '../realtimeService';

export interface ConfirmCashPaymentInput {
  orderId: string;
  restaurantId: string;
  staffUserId: string;
  amountReceived?: number;
  notes?: string;
}

export class CashPaymentService {
  /**
   * Settles an order's payment with cash.
   * Executed exclusively by authenticated staff with restaurant authorization.
   */
  public static async confirmCashPayment(input: ConfirmCashPaymentInput) {
    const { orderId, restaurantId, staffUserId, amountReceived, notes } = input;

    // 1. Fetch Order and verify restaurant ownership
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: { include: { settings: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!order) {
      const err: any = new Error(`Order ${orderId} was not found.`);
      err.statusCode = 404;
      err.errorCode = 'ORDER_NOT_FOUND';
      throw err;
    }

    if (order.restaurantId !== restaurantId) {
      const err: any = new Error('Order does not belong to this restaurant.');
      err.statusCode = 403;
      err.errorCode = 'ACCESS_DENIED';
      throw err;
    }

    // 2. Authoritative server-side calculation
    const amountDueDecimal = new Prisma.Decimal(order.total);
    const amountDueNum = Number(order.total);

    let amountReceivedDecimal = amountDueDecimal;
    let changeGivenDecimal = new Prisma.Decimal('0.00');

    if (amountReceived !== undefined && amountReceived !== null) {
      const receivedNum = Number(amountReceived);
      if (isNaN(receivedNum) || receivedNum < amountDueNum) {
        const err: any = new Error(
          `Amount received (€${receivedNum.toFixed(2)}) is less than total amount due (€${amountDueNum.toFixed(2)}).`
        );
        err.statusCode = 400;
        err.errorCode = 'INSUFFICIENT_CASH_RECEIVED';
        throw err;
      }
      amountReceivedDecimal = new Prisma.Decimal(receivedNum.toFixed(2));
      const changeNum = Math.round((receivedNum - amountDueNum) * 100) / 100;
      changeGivenDecimal = new Prisma.Decimal(changeNum.toFixed(2));
    }

    // 3. Check existing payment state
    const existingPayment = order.payments[0];
    if (existingPayment && existingPayment.status === PaymentStatus.PAID) {
      const err: any = new Error('This order has already been paid in full.');
      err.statusCode = 400;
      err.errorCode = 'ORDER_ALREADY_PAID';
      throw err;
    }

    // 4. Atomic PostgreSQL Transaction: Payment, Transaction, Receipt, Audit
    const result = await prisma.$transaction(async (tx) => {
      let paymentRecord;

      if (existingPayment && existingPayment.status !== PaymentStatus.PAID) {
        paymentRecord = await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            method: PaymentMethod.CASH,
            provider: 'MANUAL_CASH',
            status: PaymentStatus.PAID,
            amount: amountDueDecimal,
            receivedByUserId: staffUserId,
            amountReceived: amountReceivedDecimal,
            changeGiven: changeGivenDecimal,
            completedAt: new Date(),
            metadata: {
              ...(typeof existingPayment.metadata === 'object' && existingPayment.metadata !== null
                ? (existingPayment.metadata as any)
                : {}),
              cashNotes: notes || undefined,
            },
          },
        });
      } else {
        paymentRecord = await tx.payment.create({
          data: {
            restaurantId,
            orderId,
            method: PaymentMethod.CASH,
            provider: 'MANUAL_CASH',
            status: PaymentStatus.PAID,
            amount: amountDueDecimal,
            currency: order.currency,
            receivedByUserId: staffUserId,
            amountReceived: amountReceivedDecimal,
            changeGiven: changeGivenDecimal,
            completedAt: new Date(),
            metadata: notes ? { cashNotes: notes } : null,
          },
        });
      }

      // Record immutable SALE transaction
      await tx.paymentTransaction.create({
        data: {
          paymentId: paymentRecord.id,
          type: PaymentTransactionType.SALE,
          amount: amountDueDecimal,
          currency: order.currency,
          status: 'SUCCESS',
          metadata: {
            method: 'CASH',
            amountReceived: amountReceivedDecimal.toString(),
            changeGiven: changeGivenDecimal.toString(),
            receivedByUserId: staffUserId,
          },
        },
      });

      return paymentRecord;
    });

    // 5. Generate Technical Fiscal Document / Receipt
    let receipt;
    try {
      receipt = await defaultFiscalProvider.issueDocument({
        restaurantId,
        orderId,
        paymentId: result.id,
        customerTaxId: order.customerTaxId || undefined,
        customerTaxCountry: order.customerTaxCountry || undefined,
        customerName: order.customerName || undefined,
        customerEmail: order.customerEmail || undefined,
      });
    } catch (docErr) {
      console.error('Error generating fiscal receipt for cash payment:', docErr);
    }

    // 6. Record Audit Log
    await AuditService.log({
      restaurantId,
      userId: staffUserId,
      action: AuditAction.CREATE,
      entityType: 'CashPayment',
      entityId: result.id,
      newValues: {
        orderId,
        amountDue: amountDueDecimal.toString(),
        amountReceived: amountReceivedDecimal.toString(),
        changeGiven: changeGivenDecimal.toString(),
        status: PaymentStatus.PAID,
      },
    });

    // 7. Emit Real-time SSE event to customer and staff
    realtimeService.notifyPaymentStatusChanged(
      restaurantId,
      order.publicToken,
      {
        paymentId: result.id,
        orderId,
        status: PaymentStatus.PAID,
        method: PaymentMethod.CASH,
        amount: Number(result.amount),
        currency: result.currency,
        amountReceived: Number(result.amountReceived),
        changeGiven: Number(result.changeGiven),
        receiptNumber: receipt?.documentNumber,
      },
      order
    );

    return {
      payment: result,
      receipt,
    };
  }
}
