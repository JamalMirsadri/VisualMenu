import { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  errorCode?: string;
  keyGenerator?: (req: Request) => string;
}

interface ClientBucket {
  count: number;
  resetTime: number;
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, ClientBucket>();
  private windowMs: number;
  private max: number;
  private message: string;
  private errorCode: string;
  private keyGenerator: (req: Request) => string;
  private cleanupTimer: NodeJS.Timeout;

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.message = options.message || 'Too many requests. Please try again later.';
    this.errorCode = options.errorCode || 'RATE_LIMIT_EXCEEDED';
    this.keyGenerator =
      options.keyGenerator ||
      ((req: Request) => {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string') {
          return forwarded.split(',')[0].trim();
        }
        return req.ip || req.socket.remoteAddress || '127.0.0.1';
      });

    // Clean up expired buckets periodically (every 60s)
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets.entries()) {
        if (now > bucket.resetTime) {
          this.buckets.delete(key);
        }
      }
    }, 60000);
    this.cleanupTimer.unref(); // Prevent keeping Node process alive
  }

  public middleware = (req: Request, res: Response, next: NextFunction): void => {
    // Check for explicit test bypass header if running tests
    if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-ratelimit'] === 'true') {
      next();
      return;
    }

    const key = this.keyGenerator(req);
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetTime) {
      bucket = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.buckets.set(key, bucket);
    } else {
      bucket.count++;
    }

    const remaining = Math.max(0, this.max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', this.max.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetTime / 1000).toString());

    if (bucket.count > this.max) {
      res.setHeader('Retry-After', resetSeconds.toString());
      res.status(429).json({
        success: false,
        errorCode: this.errorCode,
        message: this.message,
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    next();
  };

  public reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }
}

/**
 * 1. Login Rate Limiter
 * 15 requests per 5 minutes per IP
 */
export const loginLimiterInstance = new SlidingWindowRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 15,
  message: 'Too many login attempts. Please try again after 5 minutes.',
  errorCode: 'TOO_MANY_ATTEMPTS',
});
export const loginRateLimiter = loginLimiterInstance.middleware;

/**
 * 2. Order Creation Rate Limiter
 * 30 orders per minute per IP
 */
export const orderCreationLimiterInstance = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Order creation rate limit exceeded. Please wait a moment before submitting another order.',
  errorCode: 'ORDER_RATE_LIMIT_EXCEEDED',
});
export const orderCreationRateLimiter = orderCreationLimiterInstance.middleware;

/**
 * 3. Customer Order Tracking Rate Limiter
 * 120 polling requests per minute per IP
 */
export const orderTrackingLimiterInstance = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Order tracking rate limit exceeded. Please try again in a moment.',
  errorCode: 'TRACKING_RATE_LIMIT_EXCEEDED',
});
export const orderTrackingRateLimiter = orderTrackingLimiterInstance.middleware;

/**
 * 4. Payment Creation Rate Limiter
 * 30 payment attempts per minute per IP
 */
export const paymentCreationLimiterInstance = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Payment initiation rate limit exceeded. Please wait a moment before trying again.',
  errorCode: 'PAYMENT_RATE_LIMIT_EXCEEDED',
});
export const paymentCreationRateLimiter = paymentCreationLimiterInstance.middleware;

