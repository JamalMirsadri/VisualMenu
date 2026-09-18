import request from 'supertest';
import './setup';
import { app } from '../src/app';
import { errorHandler } from '../src/middleware/errorHandler';

function invokeErrorHandler(err: any): { statusCode: number; body: any } {
  let statusCode = 0;
  let body: any = null;
  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (b: any) => {
      body = b;
      return res;
    },
  };
  errorHandler(err, {} as any, res, {} as any);
  return { statusCode, body };
}

async function runTests() {
  const TOTAL = 3;
  console.log(`🛡️ Games + Loyalty Security Hardening Test Suite (${TOTAL} Tests)...\n`);
  let passed = 0;
  let failed = 0;
  const assert = async (num: number, desc: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/${TOTAL}] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/${TOTAL}] ${desc}:`, err.message || err);
      failed++;
    }
  };

  try {
    await assert(1, 'Game action endpoints are rate-limited (429)', async () => {
      const rid = '00000000-0000-4000-8000-000000000000';
      // The action rate limiter runs first, so empty-body requests still count.
      for (let i = 0; i < 60; i++) {
        await request(app).post(`/api/restaurants/${rid}/games/private`).send({});
      }
      const res = await request(app).post(`/api/restaurants/${rid}/games/private`).send({});
      if (res.status !== 429 || res.body.errorCode !== 'GAME_RATE_LIMIT_EXCEEDED') {
        throw new Error(`expected 429 GAME_RATE_LIMIT_EXCEEDED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    });

    await assert(2, 'Error handler hides internal details on unexpected (5xx) errors', async () => {
      const err: any = new Error('Secret SQL: SELECT password FROM users WHERE id=123');
      const { statusCode, body } = invokeErrorHandler(err);
      if (statusCode !== 500) throw new Error(`expected 500, got ${statusCode}`);
      if (body.errorCode !== 'INTERNAL_SERVER_ERROR') throw new Error(`wrong errorCode: ${body.errorCode}`);
      const raw = JSON.stringify(body);
      if (raw.includes('Secret') || raw.includes('SELECT') || raw.includes('password') || raw.includes('users')) {
        throw new Error(`leaked internal details: ${raw}`);
      }
    });

    await assert(3, 'Error handler preserves safe client (4xx) errors', async () => {
      const err: any = new Error('This game is already full.');
      err.statusCode = 409;
      err.errorCode = 'GAME_FULL';
      const { statusCode, body } = invokeErrorHandler(err);
      if (statusCode !== 409) throw new Error(`expected 409, got ${statusCode}`);
      if (body.message !== 'This game is already full.' || body.errorCode !== 'GAME_FULL') {
        throw new Error(`4xx not preserved: ${JSON.stringify(body)}`);
      }
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  }

  console.log(`\nSecurity Hardening Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
