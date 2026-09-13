import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface RecordAuditParams {
  restaurantId?: string;
  userId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Prisma.InputJsonValue;
}

export interface ListAuditOptions {
  page?: number;
  limit?: number;
  action?: AuditAction;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'temppassword',
  'temporarypassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'jwtsecret',
  'authorization',
  'creditcard',
  'cardnumber',
  'cvv',
  'apikey',
]);

/**
 * Deep redaction of sensitive credentials, tokens, and secrets
 */
export function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (SENSITIVE_KEYS.has(normalizedKey)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = redactSensitiveData(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}

export class AuditService {
  /**
   * Log an audit event with automated secret redaction
   */
  static async log(params: RecordAuditParams) {
    try {
      const raw =
        params.metadata ||
        (params.oldValues
          ? { oldValues: params.oldValues, newValues: params.newValues }
          : params.newValues || {});
      const jsonCompatible = JSON.parse(JSON.stringify(raw));
      const safeMetadata = redactSensitiveData(jsonCompatible);

      return await prisma.auditLog.create({
        data: {
          restaurantId: params.restaurantId,
          userId: params.userId,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          metadata: safeMetadata,
        },
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Non-blocking: audit failure should not break critical business operations
      return null;
    }
  }

  /**
   * List paginated audit logs for a restaurant with filtering
   */
  static async listByRestaurant(restaurantId: string, options: ListAuditOptions = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      restaurantId,
      ...(options.action ? { action: options.action } : {}),
      ...(options.entityType ? { entityType: options.entityType } : {}),
      ...(options.startDate || options.endDate
        ? {
            createdAt: {
              ...(options.startDate ? { gte: new Date(options.startDate) } : {}),
              ...(options.endDate ? { lte: new Date(options.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
