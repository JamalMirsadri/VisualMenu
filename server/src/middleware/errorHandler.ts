import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export interface ApiError extends Error {
  statusCode?: number;
  errorCode?: string;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log unexpected errors
  if (process.env.NODE_ENV !== 'test') {
    console.error('API Error:', err);
  }

  // Handle Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      res.status(409).json({
        success: false,
        message: `Unique constraint violation: record with this ${target} already exists.`,
        errorCode: 'DUPLICATE_RESOURCE',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'The requested record was not found.',
        errorCode: 'RESOURCE_NOT_FOUND',
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'Foreign key constraint violation: referenced resource does not exist or cannot be modified.',
        errorCode: 'FOREIGN_KEY_VIOLATION',
      });
      return;
    }
  }

  // Handle Prisma Validation Errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      message: 'Invalid data format or missing required fields in database query.',
      errorCode: 'VALIDATION_ERROR',
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const isServerError = statusCode >= 500;

  // Never leak internal messages (SQL errors, stack traces, secrets, internal
  // IDs) to customers on unexpected server errors. Expected client errors (4xx)
  // carry an intentional, safe message set by the throwing service.
  const message = isServerError
    ? 'An unexpected internal server error occurred.'
    : err.message || 'An unexpected error occurred.';
  const errorCode = isServerError
    ? 'INTERNAL_SERVER_ERROR'
    : err.errorCode || 'BAD_REQUEST';

  res.status(statusCode).json({
    success: false,
    message,
    errorCode,
  });
}
