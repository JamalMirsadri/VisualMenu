import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Exclude noise from SSE heartbeats
    if (!req.path.endsWith('/events')) {
      const logEntry = {
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      };
      // Simple concise stdout logger
      if (res.statusCode >= 400) {
        console.warn(`[HTTP] ${logEntry.method} ${logEntry.path} ${logEntry.status} - ${logEntry.durationMs}ms [${logEntry.requestId}]`);
      }
    }
  });

  next();
}
