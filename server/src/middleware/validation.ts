import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id?: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Validate that params with :id, :restaurantId, or :categoryId are valid UUIDs
 */
export function validateUuidParams(paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const param of paramNames) {
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
