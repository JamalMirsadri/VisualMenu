import dotenv from 'dotenv';
dotenv.config();

import { app } from './app';
import { prisma } from './prisma';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`🚀 REST API Server running on http://localhost:${PORT}`);
});

// Graceful Shutdown
const shutdown = async () => {
  console.log('Shutting down server gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('PostgreSQL connection disconnected.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
