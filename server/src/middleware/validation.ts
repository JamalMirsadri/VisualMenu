import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id?: string | string[]): boolean {
  const value = Array.isArray(id) ? id[0] : id;
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Validate that the named route params are valid UUIDs.
 * Accepts either a single param name or a list of names (historical call sites
 * used both `'id'` and `['id']`; normalize here so both are honored).
 */
export function validateUuidParams(paramNames: string | string[]) {
  const names = Array.isArray(paramNames) ? paramNames : [paramNames];
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const param of names) {
      const val = req.params[param];
      if (val && !isValidUuid(val)) {
        res.status(400).json({
          success: false,
          message: `Invalid identifier format for '${param}'. Must be a valid UUID.`,
          errorCode: 'INVALID_UUID',
        });
        return;
      }
    }
    next();
  };
}

/**
 * Validate that a category belongs to the specified restaurant
 */
export async function validateCategoryOwnership(
  categoryId: string,
  restaurantId: string
): Promise<boolean> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { restaurantId: true },
  });
  return cat !== null && cat.restaurantId === restaurantId;
}
