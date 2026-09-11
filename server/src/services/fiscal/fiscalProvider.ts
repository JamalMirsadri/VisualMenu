import { Prisma, FiscalDocumentType, FiscalDocumentStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../../prisma';

export interface IssueDocumentParams {
  restaurantId: string;
  orderId: string;
  paymentId?: string;
  documentType?: FiscalDocumentType;
  customerName?: string;
  customerTaxId?: string;
  customerTaxCountry?: string;
  customerEmail?: string;
  customerAddress?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface FiscalProvider {
  name: string;
  issueDocument(params: IssueDocumentParams): Promise<any>;
  cancelDocument(documentId: string, reason: string): Promise<any>;
  getDocument(documentId: string): Promise<any>;
}

/**
 * Standard Technical Invoicing & Receipt Provider
 * 
 * Generates sequential, tamper-evident receipts with immutable historical item snapshots.
 * Note: While compliant with technical snapshot integrity, legal certification under
 * Portuguese Tax Law (AT / e-Fatura) requires external certified provider integration.
 */
export class StandardFiscalProvider implements FiscalProvider {
  public name = 'STANDARD_TECHNICAL_RECEIPT';

  public async issueDocument(params: IssueDocumentParams) {
    const {
      restaurantId,
      orderId,
      paymentId,
      documentType = FiscalDocumentType.RECEIPT,
      customerName,
      customerTaxId,
      customerTaxCountry = 'PT',
      customerEmail,
      customerAddress,
      metadata,
    } = params;

    // 1. Fetch Order with Items and Table
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        restaurant: true,
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.restaurantId !== restaurantId) {
      throw new Error('Restaurant ID mismatch on order document issuance.');
    }

    const currentYear = new Date().getFullYear().toString();
    const series = currentYear;

    // 2. Atomically calculate next sequence number for this restaurant and series
    return await prisma.$transaction(async (tx) => {
      // Find current highest sequence number for this series
      const lastDoc = await tx.fiscalDocument.findFirst({
        where: {
          restaurantId,
          series,
        },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      const nextSequence = (lastDoc?.sequenceNumber || 0) + 1;
      const paddedNumber = String(nextSequence).padStart(5, '0');
      const documentPrefix = documentType === FiscalDocumentType.INVOICE ? 'FT' : 'REC';
      const documentNumber = `${documentPrefix}-${series}-${paddedNumber}`;

      // 3. Freeze item snapshot
      const itemsSnapshot = order.items.map((item) => ({
        id: item.id,
        foodName: item.foodNameSnapshot,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        lineTotal: Number(item.lineTotal),
        customerNote: item.customerNote,
      }));

      const hash = createHash('sha256')
        .update(`${restaurantId}:${series}:${nextSequence}:${order.total}:${order.customerTaxId || 'NONE'}`)
        .digest('hex');

      const mergedMetadata = {
        ...(metadata || {}),
        hash,
        issuedVia: 'StandardFiscalProvider',
      };

      // 4. Create immutable FiscalDocument
      const fiscalDoc = await tx.fiscalDocument.create({
        data: {
          restaurantId,
          orderId,
          paymentId: paymentId || null,
          documentNumber,
          series,
          sequenceNumber: nextSequence,
          documentType,
          status: FiscalDocumentStatus.ISSUED,
          currency: order.currency,
          subtotal: order.subtotal,
          tax: order.tax,
          serviceCharge: order.serviceCharge,
          discount: order.discount,
          total: order.total,
          customerName: customerName || order.customerName || null,
          customerTaxId: customerTaxId || order.customerTaxId || null,
          customerTaxCountry: customerTaxCountry || order.customerTaxCountry || 'PT',
          customerEmail: customerEmail || order.customerEmail || null,
          customerAddress: customerAddress || null,
          itemsSnapshot: itemsSnapshot as any,
          metadata: mergedMetadata,
        },
      });

      return fiscalDoc;
    });
  }

  public async cancelDocument(documentId: string, reason: string) {
    const existing = await prisma.fiscalDocument.findUnique({
      where: { id: documentId },
    });

    if (!existing) {
      throw new Error(`Fiscal document ${documentId} not found.`);
    }

    if (existing.status === FiscalDocumentStatus.CANCELLED) {
      return existing;
    }

    return await prisma.fiscalDocument.update({
      where: { id: documentId },
      data: {
        status: FiscalDocumentStatus.CANCELLED,
        cancelledAt: new Date(),
        metadata: {
          ...(typeof existing.metadata === 'object' && existing.metadata !== null
            ? (existing.metadata as any)
            : {}),
          cancellationReason: reason,
        },
      },
    });
  }

  public async getDocument(documentId: string) {
    return await prisma.fiscalDocument.findUnique({
      where: { id: documentId },
      include: {
        order: {
          include: {
            table: true,
            restaurant: true,
          },
        },
        payment: true,
      },
    });
  }
}

export const defaultFiscalProvider = new StandardFiscalProvider();
