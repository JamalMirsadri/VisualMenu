import express from 'express';
import cors from 'cors';
import path from 'path';
import { prisma } from './prisma';
import { publicMenuRouter } from './routes/publicMenuRoutes';
import { authRouter } from './routes/authRoutes';
import { restaurantRouter } from './routes/restaurantRoutes';
import { categoryRouter } from './routes/categoryRoutes';
import { foodRouter } from './routes/foodRoutes';
import { mediaRouter } from './routes/mediaRoutes';
import { settingsRouter } from './routes/settingsRoutes';
import { qrRouter } from './routes/qrRoutes';
import { tableRouter } from './routes/tableRoutes';
import { orderRouter } from './routes/orderRoutes';
import { realtimeRouter } from './routes/realtimeRoutes';
import { userRouter } from './routes/userRoutes';
import { auditRouter } from './routes/auditRoutes';
import { paymentRouter } from './routes/paymentRoutes';
import { customerRouter } from './routes/customerRoutes';
import { platformRouter } from './routes/platformRoutes';
import { ownerInvitationRouter } from './routes/ownerInvitationRoutes';
import { staffRouter } from './routes/staffRoutes';
import { staffInvitationRouter } from './routes/staffInvitationRoutes';
import { subscriptionRouter } from './routes/subscriptionRoutes';
import { notificationRouter } from './routes/notificationRoutes';
import { errorHandler } from './middleware/errorHandler';
import { authenticateToken } from './middleware/authMiddleware';
import { requireActiveSubscription } from './middleware/subscriptionMiddleware';
import { requestLogger } from './middleware/requestLogger';

export const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(requestLogger);

// Static file serving for uploaded media assets
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health Check with Database Connectivity Ping
app.get('/api/health', async (_req, res) => {
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - dbStart;

    res.json({
      status: 'healthy',
      database: {
        status: 'connected',
        latencyMs: dbLatencyMs,
      },
      dbLatencyMs,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'degraded',
      database: {
        status: 'disconnected',
        error: process.env.NODE_ENV === 'production' ? 'Database connection unavailable' : (err?.message || 'Database error'),
      },
      timestamp: new Date().toISOString(),
    });
  }

});

// -----------------------------------------------------------------------------
// 1. PUBLIC ROUTES (Customer Menu, Ordering, SSE Tracking, Authentication & Owner Onboarding)
// -----------------------------------------------------------------------------
app.use('/api/menu', publicMenuRouter);
app.use('/api/auth', authRouter);
app.use('/api/owner', ownerInvitationRouter);
app.use('/api/staff', staffInvitationRouter);
app.use('/api', realtimeRouter); // Includes public /orders/track/:token/events and protected SSE
app.use('/api', orderRouter); // Includes public POST /api/orders, cash settlement, receipts and customer order tracking
app.use('/api', paymentRouter); // Includes public /payments, /payments/:id, webhooks and protected admin /restaurants/:id/payments
app.use('/api', customerRouter); // Includes public fiscal profile save and protected admin customer directory

// -----------------------------------------------------------------------------
// 2. PROTECTED ADMIN & MANAGEMENT ROUTES (Enforced server-side)
// -----------------------------------------------------------------------------
app.use('/api/subscriptions', subscriptionRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/restaurants', authenticateToken, requireActiveSubscription(), restaurantRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), categoryRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), foodRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), mediaRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), settingsRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), qrRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), tableRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), userRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), staffRouter);
app.use('/api', authenticateToken, requireActiveSubscription(), auditRouter);
app.use('/api/platform', authenticateToken, platformRouter);

// Centralized Error Handling
app.use(errorHandler);
