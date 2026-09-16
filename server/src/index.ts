import dotenv from 'dotenv';
dotenv.config();

import { app } from './app';
import { prisma } from './prisma';
import { getJwtSecret } from './config';
import { seedPermissions } from './constants/permissions';
import { SubscriptionScheduler } from './services/subscription/subscriptionScheduler';

// Fail fast if JWT_SECRET is missing (no insecure fallback).
getJwtSecret();

// Log the selected AI video generation provider at startup.
console.log(`[VideoGeneration] provider: ${process.env.VIDEO_GENERATION_PROVIDER || 'MOCK'}`);

const PORT = process.env.PORT || 3001;

async function bootstrap(): Promise<void> {
  // Seed the permissions catalog idempotently on startup. The UI renders the
  // catalog from a constant, but permission persistence resolves keys against
  // the `permissions` table — an empty table silently drops every grant.
  try {
    await seedPermissions(prisma);
  } catch (err) {
    console.error('[Permissions] failed to seed catalog:', err);
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 REST API Server running on http://localhost:${PORT}`);
    SubscriptionScheduler.start();
  });

  // Graceful Shutdown
  const shutdown = async () => {
    console.log('Shutting down server gracefully...');
    SubscriptionScheduler.stop();
    server.close(async () => {
      await prisma.$disconnect();
      console.log('PostgreSQL connection disconnected.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrap();
