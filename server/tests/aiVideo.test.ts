import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { ensureActiveSubscription } from './helpers';
import { VideoCreditService } from '../src/services/video/videoCreditService';
import { VideoGenerationService } from '../src/services/video/videoGenerationService';

async function createTemplate(data: any) {
  return prisma.videoTemplate.create({
    data: {
      name: data.name,
      contentType: data.contentType as any,
      active: data.active !== false,
      description: data.description || null,
      aspectRatio: data.aspectRatio || '9:16',
      ...(data.variants
        ? { variants: { create: data.variants.map((v: any, i: number) => ({ name: v.name, promptTemplate: v.promptTemplate, negativePrompt: v.negativePrompt || null, active: v.active !== false, sortOrder: v.sortOrder ?? i })) } }
        : {}),
    },
    include: { variants: true },
  });
}

async function runTests() {
  console.log('🧪 AI Food Video Studio Regression Suite (21 Tests)...\n');
  let passed = 0;
  let failed = 0;
  const assert = async (num: number, desc: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/21] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/21] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let r1: any, r2: any, rc: any;
  let planOn: any, planOff: any;
  let owner1: any, owner2: any;
  let t1 = '', t2 = '', platformToken = '';
  let foodTemplate: any, drinkTemplate: any;

  try {
    // ---- Setup: platform admin ----
    platformToken = (await request(app).post('/api/auth/login').send({ email: 'platformadmin@auramenu.com', password: 'Password123!' })).body.data?.token;

    // ---- Setup: plans ----
    planOn = await prisma.subscriptionPlan.create({ data: { code: `VIDON-${unique}`, name: 'Video On', price: 49, active: true, features: ['AI_FOOD_VIDEO'], includedVideoCredits: 5 } });
    planOff = await prisma.subscriptionPlan.create({ data: { code: `VIDOFF-${unique}`, name: 'Video Off', price: 49, active: true, features: [], includedVideoCredits: 0 } });

    // ---- Setup: restaurants ----
    r1 = await prisma.restaurant.create({ data: { name: 'V1', slug: `vid1-${unique}`, active: true, timezone: 'UTC' } });
    r2 = await prisma.restaurant.create({ data: { name: 'V2', slug: `vid2-${unique}`, active: true, timezone: 'UTC' } });
    rc = await prisma.restaurant.create({ data: { name: 'VC', slug: `vidc-${unique}`, active: true, timezone: 'UTC' } });
    await ensureActiveSubscription(r1.id);
    await ensureActiveSubscription(r2.id);
    await prisma.subscription.updateMany({ where: { restaurantId: r1.id }, data: { planId: planOn.id } });
    await prisma.subscription.updateMany({ where: { restaurantId: r2.id }, data: { planId: planOff.id } });

    // ---- Setup: owners ----
    owner1 = await prisma.user.create({ data: { email: `vid-o1-${unique}@test.com`, name: 'O1', passwordHash: await bcrypt.hash('Password123!', 10) } });
    owner2 = await prisma.user.create({ data: { email: `vid-o2-${unique}@test.com`, name: 'O2', passwordHash: await bcrypt.hash('Password123!', 10) } });
    await prisma.userRestaurant.create({ data: { userId: owner1.id, restaurantId: r1.id, role: 'OWNER' } });
    await prisma.userRestaurant.create({ data: { userId: owner2.id, restaurantId: r2.id, role: 'OWNER' } });
    t1 = (await request(app).post('/api/auth/login').send({ email: `vid-o1-${unique}@test.com`, password: 'Password123!' })).body.data?.token;
    t2 = (await request(app).post('/api/auth/login').send({ email: `vid-o2-${unique}@test.com`, password: 'Password123!' })).body.data?.token;

    // ---- Setup: templates ----
    foodTemplate = await createTemplate({
      name: 'Food Cinematic',
      contentType: 'FOOD',
      variants: [
        { name: 'Steam', promptTemplate: 'Cinematic steam rise over {FOOD_NAME}' },
        { name: 'Rotate', promptTemplate: 'Slow 360 rotate of {FOOD_IMAGE}' },
        { name: 'Zoom', promptTemplate: 'Macro zoom on {FOOD_NAME} texture' },
        { name: 'Hidden', promptTemplate: 'Inactive variant', active: false },
      ],
    });
    drinkTemplate = await createTemplate({
      name: 'Drink Pour',
      contentType: 'DRINK',
      variants: [{ name: 'Pour', promptTemplate: 'Slow pour of {FOOD_NAME} into glass' }],
    });

    // =====================================================================
    // Feature gating
    // =====================================================================
    await assert(1, 'AI_FOOD_VIDEO feature gate: enabled → 200', async () => {
      const res = await request(app).get(`/api/restaurants/${r1.id}/ai-video/balance`).set('Authorization', `Bearer ${t1}`);
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    });

    await assert(2, 'AI_FOOD_VIDEO feature gate: disabled → 403', async () => {
      const res = await request(app).get(`/api/restaurants/${r2.id}/ai-video/balance`).set('Authorization', `Bearer ${t2}`);
      if (res.status !== 403 || res.body.errorCode !== 'FEATURE_NOT_AVAILABLE') throw new Error(`expected 403 FEATURE_NOT_AVAILABLE, got ${res.status} ${JSON.stringify(res.body)}`);
    });

    // =====================================================================
    // Platform template CRUD + variants
    // =====================================================================
    await assert(3, 'Platform template CRUD (create/list/update/delete)', async () => {
      const created = await request(app).post('/api/platform/video-templates').set('Authorization', `Bearer ${platformToken}`).send({ name: 'Dessert Melt', contentType: 'DESSERT', aspectRatio: '9:16' });
      if (created.status !== 201) throw new Error(`create ${created.status}`);
      const id = created.body.data.id;

      const list = await request(app).get('/api/platform/video-templates').set('Authorization', `Bearer ${platformToken}`);
      if (!list.body.data.some((t: any) => t.id === id)) throw new Error('template not in list');

      const updated = await request(app).patch(`/api/platform/video-templates/${id}`).set('Authorization', `Bearer ${platformToken}`).send({ name: 'Dessert Melt v2' });
      if (updated.body.data.name !== 'Dessert Melt v2') throw new Error('update failed');

      const del = await request(app).delete(`/api/platform/video-templates/${id}`).set('Authorization', `Bearer ${platformToken}`);
      if (del.status !== 200) throw new Error(`delete ${del.status}`);
    });

    await assert(4, 'Multiple prompt variants per template', async () => {
      const res = await request(app).get(`/api/platform/video-templates/${foodTemplate.id}`).set('Authorization', `Bearer ${platformToken}`);
      const variants = res.body.data.variants;
      if (variants.length !== 4) throw new Error(`expected 4 variants, got ${variants.length}`);
    });

    await assert(5, 'Content-type filtering (platform)', async () => {
      const res = await request(app).get('/api/platform/video-templates?contentType=FOOD').set('Authorization', `Bearer ${platformToken}`);
      const types = new Set(res.body.data.map((t: any) => t.contentType));
      if (types.size !== 1 || !types.has('FOOD')) throw new Error(`expected only FOOD, got ${[...types]}`);
    });

    await assert(6, 'Restaurant sees only active templates and active variants', async () => {
      const res = await request(app).get(`/api/restaurants/${r1.id}/ai-video/templates`).set('Authorization', `Bearer ${t1}`);
      const tpl = res.body.data.find((t: any) => t.id === foodTemplate.id);
      if (!tpl) throw new Error('food template missing');
      if (tpl.variants.length !== 3) throw new Error(`expected 3 active variants, got ${tpl.variants.length}`);
    });

    await assert(7, 'Restaurant cannot modify platform templates', async () => {
      const res = await request(app).patch(`/api/platform/video-templates/${foodTemplate.id}`).set('Authorization', `Bearer ${t1}`).send({ name: 'HACKED' });
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });

    await assert(8, 'Tenant isolation: restaurant cannot read another restaurant jobs', async () => {
      const res = await request(app).get(`/api/restaurants/${r1.id}/ai-video/jobs`).set('Authorization', `Bearer ${t2}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });

    // =====================================================================
    // Credit ledger (service-level, deterministic)
    // =====================================================================
    await assert(9, 'Subscription credit allowance (includedVideoCredits)', async () => {
      const s = await VideoCreditService.getBalanceSummary(r1.id);
      if (s.allowance !== 5) throw new Error(`allowance ${s.allowance}`);
      if (s.balance !== 5) throw new Error(`balance ${s.balance}`);
    });

    await assert(10, 'Manual credit assignment', async () => {
      await VideoCreditService.grantManual(rc.id, 3, undefined, 'test-manual');
      const s = await VideoCreditService.getBalanceSummary(rc.id);
      if (s.balance !== 3 || s.granted !== 3) throw new Error(`balance ${s.balance} granted ${s.granted}`);
    });

    await assert(11, 'Credit purchase (pack)', async () => {
      const pack = await prisma.videoCreditPack.create({ data: { name: 'Pack 10', credits: 10, price: 10, currency: 'EUR', active: true, sortOrder: 0 } });
      const result = await VideoCreditService.purchaseCredits(rc.id, pack.id, undefined);
      if (result.purchase.credits !== 10) throw new Error('purchase credits mismatch');
      const s = await VideoCreditService.getBalanceSummary(rc.id);
      if (s.balance !== 13 || s.purchased !== 10) throw new Error(`balance ${s.balance} purchased ${s.purchased}`);
    });

    await assert(12, 'Credit ledger balance equals sum of entries', async () => {
      const rows = await prisma.videoCreditLedger.findMany({ where: { restaurantId: rc.id } });
      const sum = rows.reduce((acc, r) => acc + r.amount, 0);
      const s = await VideoCreditService.getBalanceSummary(rc.id);
      if (s.balance !== sum) throw new Error(`balance ${s.balance} != sum ${sum}`);
    });

    await assert(13, 'Successful usage = -1 and media saved to Media Library', async () => {
      const before = await VideoCreditService.getBalanceSummary(rc.id);
      const job = await VideoGenerationService.startGeneration(rc.id, {
        templateId: foodTemplate.id,
        promptVariantId: foodTemplate.variants[0].id,
        productName: 'Burger',
      });
      const afterReserve = await VideoCreditService.getBalanceSummary(rc.id);
      if (afterReserve.balance !== before.balance - 1) throw new Error(`reserve not -1: ${before.balance} -> ${afterReserve.balance}`);

      const completed = await VideoGenerationService.completeGeneration(job.id, {
        url: `/uploads/restaurants/${rc.id}/ai-video-${unique}.mp4`,
        mimeType: 'video/mp4',
        filename: `ai-video-${unique}.mp4`,
      });
      if (completed.status !== 'COMPLETED') throw new Error(`status ${completed.status}`);

      const media = await prisma.media.findUnique({ where: { id: completed.outputMediaId! } });
      if (!media || media.type !== 'VIDEO') throw new Error('media not saved as VIDEO');

      const afterComplete = await VideoCreditService.getBalanceSummary(rc.id);
      if (afterComplete.balance !== before.balance - 1) throw new Error('usage not finalized at -1');
    });

    await assert(14, 'Failed generation = refund', async () => {
      const before = await VideoCreditService.getBalanceSummary(rc.id);
      const job = await VideoGenerationService.startGeneration(rc.id, { templateId: foodTemplate.id, promptVariantId: foodTemplate.variants[0].id });
      await VideoGenerationService.failGeneration(job.id, 'provider error');
      const after = await VideoCreditService.getBalanceSummary(rc.id);
      if (after.balance !== before.balance) throw new Error(`refund not applied: ${before.balance} -> ${after.balance}`);
    });

    await assert(15, 'Cancelled generation = refund', async () => {
      const before = await VideoCreditService.getBalanceSummary(rc.id);
      const job = await VideoGenerationService.startGeneration(rc.id, { templateId: foodTemplate.id, promptVariantId: foodTemplate.variants[0].id });
      await VideoGenerationService.cancelGeneration(job.id, rc.id);
      const after = await VideoCreditService.getBalanceSummary(rc.id);
      if (after.balance !== before.balance) throw new Error(`cancel refund not applied: ${before.balance} -> ${after.balance}`);
    });

    await assert(16, 'Zero-credit blocking', async () => {
      await prisma.videoCreditLedger.deleteMany({ where: { restaurantId: rc.id } });
      let blocked = false;
      try {
        await VideoCreditService.reserveCredit(rc.id, 'job:zero');
      } catch (e: any) {
        if (e.errorCode === 'INSUFFICIENT_VIDEO_CREDITS') blocked = true;
      }
      if (!blocked) throw new Error('zero-credit reservation did not block');
    });

    await assert(17, 'Concurrent generation / double-spend protection', async () => {
      await prisma.videoCreditLedger.deleteMany({ where: { restaurantId: rc.id } });
      await VideoCreditService.grantManual(rc.id, 1, undefined, 'dup-test');
      const results = await Promise.allSettled([
        VideoCreditService.reserveCredit(rc.id, 'job:dup-a'),
        VideoCreditService.reserveCredit(rc.id, 'job:dup-b'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      if (fulfilled !== 1) throw new Error(`expected exactly 1 successful reservation, got ${fulfilled}`);
      const s = await VideoCreditService.getBalanceSummary(rc.id);
      if (s.balance !== 0) throw new Error(`balance should be 0, got ${s.balance}`);
    });

    // =====================================================================
    // Platform credit administration (HTTP)
    // =====================================================================
    await assert(18, 'Platform credit packs CRUD', async () => {
      const pack = await request(app).post('/api/platform/video-credit-packs').set('Authorization', `Bearer ${platformToken}`).send({ name: 'Pack 25', credits: 25, price: 20 });
      if (pack.status !== 201) throw new Error(`create ${pack.status}`);
      const list = await request(app).get('/api/platform/video-credit-packs').set('Authorization', `Bearer ${platformToken}`);
      if (!list.body.data.some((p: any) => p.id === pack.body.data.id)) throw new Error('pack not listed');
    });

    await assert(19, 'Platform manual credit grant via API', async () => {
      const res = await request(app).post(`/api/platform/video-credits/restaurants/${r1.id}/grants`).set('Authorization', `Bearer ${platformToken}`).send({ amount: 7 });
      if (res.status !== 200) throw new Error(`grant ${res.status}`);
      if (res.body.data.balance !== 12) throw new Error(`expected balance 12 (5+7), got ${res.body.data.balance}`);
    });

    await assert(20, 'Platform restaurant credit balance + ledger', async () => {
      const res = await request(app).get(`/api/platform/video-credits/restaurants/${r1.id}`).set('Authorization', `Bearer ${platformToken}`);
      if (res.status !== 200) throw new Error(`detail ${res.status}`);
      if (!Array.isArray(res.body.data.ledger)) throw new Error('ledger missing');
      if (res.body.data.balance !== 12) throw new Error(`expected 12, got ${res.body.data.balance}`);
    });

    await assert(21, 'Restaurant admin blocked from platform credit routes', async () => {
      const res = await request(app).get('/api/platform/video-credit-packs').set('Authorization', `Bearer ${t1}`);
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    for (const r of [r1, r2, rc]) {
      if (r?.id) await RestaurantDeletionService.hardDelete(r.id).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: { in: [`vid-o1-${unique}@test.com`, `vid-o2-${unique}@test.com`] } } }).catch(() => {});
    for (const p of [planOn, planOff]) if (p?.id) await prisma.subscriptionPlan.deleteMany({ where: { id: p.id } }).catch(() => {});
    await prisma.videoTemplate.deleteMany({ where: { id: { in: [foodTemplate?.id, drinkTemplate?.id].filter(Boolean) } } }).catch(() => {});
    await prisma.videoCreditPack.deleteMany({ where: { name: { in: ['Pack 10', 'Pack 25'] } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nAI Food Video Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
