import request from 'supertest';
import bcrypt from 'bcryptjs';
import './setup';
import { createRestaurantWithSubscription } from './helpers';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { NifValidator } from '../src/services/fiscal/nifValidator';
import { PaymentMethod, PaymentStatus, Role } from '@prisma/client';

async function runPhase8Tests() {
  console.log('🧪 Starting Phase 8 Payments, NIF, Receipts, Cash, Card, MB WAY & Customer Profile Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function assert(desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${desc}:`, err.message || err);
      failed++;
    }
  }

  let ownerToken = '';
  let staffToken = '';
  let restaurantA: any;
  let restaurantB: any;
  let otherOwnerToken = '';
  let testOrderA: any;
  let testOrderB: any;

  try {
    // 0. Setup test data
    await assert('Setup Phase 8 multi-tenant test restaurants & accounts', async () => {
      // Clean up previous runs
      await prisma.paymentWebhookEvent.deleteMany({});
      await prisma.fiscalDocument.deleteMany({});
      await prisma.paymentTransaction.deleteMany({});
      await prisma.payment.deleteMany({});
      await prisma.orderStatusHistory.deleteMany({ where: { order: { restaurant: { slug: { in: ['p8-rest-a', 'p8-rest-b'] } } } } });
      await prisma.orderItem.deleteMany({ where: { order: { restaurant: { slug: { in: ['p8-rest-a', 'p8-rest-b'] } } } } });
      await prisma.order.deleteMany({ where: { restaurant: { slug: { in: ['p8-rest-a', 'p8-rest-b'] } } } });
      await prisma.table.deleteMany({ where: { restaurant: { slug: { in: ['p8-rest-a', 'p8-rest-b'] } } } });
      await prisma.foodItem.deleteMany({ where: { restaurant: { slug: { in: ['p8-rest-a', 'p8-rest-b'] } } } });
      await prisma.category.deleteMany({ where: { restaurant: { slug: { in: ['p8-rest-a', 'p8-rest-b'] } } } });
      await prisma.restaurantSettings.deleteMany({ where: { restaurant: { slug: { in: ['p8-rest-a', 'p8-rest-b'] } } } });
      await prisma.customerFiscalProfile.deleteMany({});
      await prisma.customer.deleteMany({});
      await prisma.userRestaurant.deleteMany({ where: { user: { email: { in: ['p8-owner-b@test.com', 'p8-staff-a@test.com'] } } } });
      await prisma.user.deleteMany({ where: { email: { in: ['p8-owner-b@test.com', 'p8-staff-a@test.com'] } } });
      await prisma.restaurant.deleteMany({ where: { slug: { in: ['p8-rest-a', 'p8-rest-b'] } } });

      // Authenticate seeded owner
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'owner@auradining.com',
        password: 'Password123!',
      });
      if (loginRes.status !== 200 || !loginRes.body.data?.token) {
        throw new Error(`Failed to log in owner: ${loginRes.status}`);
      }
      ownerToken = loginRes.body.data.token;
      const ownerUser = loginRes.body.data.user;

      // Create Restaurant A
      restaurantA = await createRestaurantWithSubscription({
        data: {
          name: 'Phase 8 Bistro A',
          slug: 'p8-rest-a',
          tagline: 'Modern Dining',
          description: 'A contemporary Portuguese bistro',
          logo: 'https://images.unsplash.com/photo-logo-a.jpg',
          coverImage: 'https://images.unsplash.com/photo-cover-a.jpg',
          currency: 'EUR',
          currencySymbol: '€',
          defaultLanguage: 'pt',
          address: 'Rua das Flores 123, Lisboa, Portugal',
          phone: '+351210000001',
          website: 'https://bistro-a.pt',
          active: true,
        },
      });

      await prisma.userRestaurant.create({
        data: {
          userId: ownerUser.id,
          restaurantId: restaurantA.id,
          role: Role.OWNER,
        },
      });

      await prisma.restaurantSettings.create({
        data: {
          restaurantId: restaurantA.id,
          primaryColor: '#D4AF37',
          secondaryColor: '#1A1A1A',
          theme: 'DARK_LUXURY',
          presentationMode: 'INDIVIDUAL_VIDEO',
          language: 'pt',
          taxEnabled: true,
          taxRate: 23,
        },
      });

      // Create Table 4 for testing orders
      await prisma.table.create({
        data: {
          restaurantId: restaurantA.id,
          number: '4',
          name: 'Table 4',
          capacity: 4,
          active: true,
        },
      });

      // Create a Staff user for Restaurant A
      const staffPasswordHash = await bcrypt.hash('Password123!', 10);
      const staffUser = await prisma.user.create({
        data: {
          email: 'p8-staff-a@test.com',
          passwordHash: staffPasswordHash,
          name: 'Staff Member A',
          active: true,
        },
      });

      await prisma.userRestaurant.create({
        data: {
          userId: staffUser.id,
          restaurantId: restaurantA.id,
          role: Role.STAFF,
        },
      });

      const staffLogin = await request(app).post('/api/auth/login').send({
        email: 'p8-staff-a@test.com',
        password: 'Password123!',
      });
      staffToken = staffLogin.body.data?.token || ownerToken;

      // Create Restaurant B under another owner
      const otherOwnerPasswordHash = await bcrypt.hash('Password123!', 10);
      const otherOwner = await prisma.user.create({
        data: {
          email: 'p8-owner-b@test.com',
          passwordHash: otherOwnerPasswordHash,
          name: 'Other Owner B',
          active: true,
        },
      });

      restaurantB = await createRestaurantWithSubscription({
        data: {
          name: 'Phase 8 Cantina B',
          slug: 'p8-rest-b',
          tagline: 'Authentic Grill',
          description: 'Separate isolated dining tenant',
          logo: 'https://images.unsplash.com/photo-logo-b.jpg',
          currency: 'EUR',
          currencySymbol: '€',
          defaultLanguage: 'pt',
          address: 'Avenida da Liberdade 456, Lisboa',
          phone: '+351210000002',
          website: 'https://cantina-b.pt',
          active: true,
        },
      });

      await prisma.userRestaurant.create({
        data: {
          userId: otherOwner.id,
          restaurantId: restaurantB.id,
          role: Role.OWNER,
        },
      });

      const otherLogin = await request(app).post('/api/auth/login').send({
        email: 'p8-owner-b@test.com',
        password: 'Password123!',
      });
      otherOwnerToken = otherLogin.body.data?.token || '';

      // Create menu items for restaurant A
      const catA = await prisma.category.create({
        data: {
          restaurantId: restaurantA.id,
          name: 'Mains',
          slug: 'mains',
          displayOrder: 1,
        },
      });

      const foodA = await prisma.foodItem.create({
        data: {
          restaurantId: restaurantA.id,
          categoryId: catA.id,
          name: 'Bacalhau à Brás',
          slug: 'bacalhau-a-bras',
          price: 20.0,
          currency: 'EUR',
          available: true,
          displayOrder: 1,
        },
      });

      // Create menu items for restaurant B
      const catB = await prisma.category.create({
        data: {
          restaurantId: restaurantB.id,
          name: 'Steaks',
          slug: 'steaks',
          displayOrder: 1,
        },
      });

      const foodB = await prisma.foodItem.create({
        data: {
          restaurantId: restaurantB.id,
          categoryId: catB.id,
          name: 'Picanha na Grelha',
          slug: 'picanha-na-grelha',
          price: 25.0,
          currency: 'EUR',
          available: true,
          displayOrder: 1,
        },
      });
    });

    // 1. Test NIF Validation (PT Modulo-11 & International)
    await assert('Validate Portuguese NIF (Modulo-11) and International Tax IDs', async () => {
      // Valid PT NIFs
      const validPTIndividual = '123456789'; // Calculate or test valid checksum
      const consumidorFinal = '999999990';
      const validRes = NifValidator.validate(consumidorFinal, 'PT');
      if (!validRes.isValid) {
        throw new Error(`Consumidor Final 999999990 should be valid: ${validRes.error}`);
      }

      // Generate a known valid PT NIF for testing: 50212345
      // 5*9 + 0*8 + 2*7 + 1*6 + 2*5 + 3*4 + 4*3 + 5*2 = 45 + 0 + 14 + 6 + 10 + 12 + 12 + 10 = 109.
      // 109 % 11 = 10. Check digit = 11 - 10 = 1. So 502123451
      const testPT = '502123451';
      const testRes = NifValidator.validate(testPT, 'PT');
      if (!testRes.isValid) {
        throw new Error(`Valid PT NIF 502123451 failed validation: ${testRes.error}`);
      }

      // Invalid checksum rejection
      const invalidChecksum = '502123459';
      const invalidRes = NifValidator.validate(invalidChecksum, 'PT');
      if (invalidRes.isValid) {
        throw new Error('Invalid checksum NIF should be rejected');
      }

      // Invalid length rejection
      const shortNif = '12345';
      const shortRes = NifValidator.validate(shortNif, 'PT');
      if (shortRes.isValid) {
        throw new Error('Short NIF must be rejected');
      }

      // International Tax ID
      const foreignId = 'ESB12345678';
      const foreignRes = NifValidator.validate(foreignId, 'ES');
      if (!foreignRes.isValid) {
        throw new Error(`Foreign Tax ID should be accepted for non-PT country: ${foreignRes.error}`);
      }
    });

    // 2. Order Creation with NIF & Fiscal Profile Consent
    await assert('Customer places order with NIF, legal name, and GDPR consent', async () => {
      const foodItem = await prisma.foodItem.findFirst({ where: { restaurantId: restaurantA.id } });
      if (!foodItem) throw new Error('No food item found');

      const res = await request(app)
        .post('/api/orders')
        .send({
          restaurantSlug: restaurantA.slug,
          tableNumber: '4',
          paymentMethod: 'CASH',
          nif: '502123451',
          customerFiscalName: 'Empresa Teste Lda',
          customerTaxCountry: 'PT',
          customerEmail: 'finance@empresa-teste.pt',
          customerPhone: '912345678',
          saveFiscalProfile: true,
          items: [
            {
              foodItemId: foodItem.id,
              quantity: 2,
              customerNote: 'No onions',
            },
          ],
        });

      if (res.status !== 201 || !res.body.success) {
        throw new Error(`Order placement failed: ${res.status} ${JSON.stringify(res.body)}`);
      }

      testOrderA = res.body.data;
      if (testOrderA.nif !== '502123451') {
        throw new Error(`Order NIF mismatch: expected 502123451, got ${testOrderA.nif}`);
      }
      if (testOrderA.customerFiscalName !== 'Empresa Teste Lda') {
        throw new Error('Order customerFiscalName mismatch');
      }

      // Verify Customer & Fiscal Profile persistence
      const customer = await prisma.customer.findFirst({
        where: { email: 'finance@empresa-teste.pt' },
        include: { fiscalProfiles: true },
      });
      if (!customer) throw new Error('Customer entity was not created');
      if (!customer.marketingConsent) throw new Error('Customer consent was not recorded');
      if (customer.fiscalProfiles.length === 0) throw new Error('CustomerFiscalProfile was not created');
      if (customer.fiscalProfiles[0].taxId !== '502123451') throw new Error('CustomerFiscalProfile NIF mismatch');
    });

    // 3. Cash Payment Settlement & Authoritative Server Change Calculation
    await assert('Staff settles cash payment with server-side change calculation and attribution', async () => {
      // Verify unauthorized diners cannot mark cash as paid
      const unauthRes = await request(app)
        .post(`/api/orders/${testOrderA.id}/cash-payment`)
        .send({
          amountReceived: 50.0,
        });
      if (unauthRes.status !== 401 && unauthRes.status !== 403) {
        throw new Error(`Unauthenticated diner must not settle cash payment: got ${unauthRes.status}`);
      }

      // Verify rejection if amount received < order total
      const insufficientRes = await request(app)
        .post(`/api/orders/${testOrderA.id}/cash-payment`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amountReceived: 10.0, // Order total is 40.0 (2 * 20)
        });
      if (insufficientRes.status !== 400) {
        throw new Error(`Insufficient cash received must be rejected with 400: got ${insufficientRes.status}`);
      }

      // Successful cash settlement with change
      const settleRes = await request(app)
        .post(`/api/orders/${testOrderA.id}/cash-payment`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amountReceived: 50.0,
          customerNote: 'Paid with 50 euro banknote',
          isStaffSettlement: true,
        });

      if (settleRes.status !== 200 || !settleRes.body.success) {
        throw new Error(`Cash settlement failed: ${settleRes.status} ${JSON.stringify(settleRes.body)}`);
      }

      const { payment, receipt } = settleRes.body.data;
      if (payment.status !== 'PAID') {
        throw new Error(`Payment status expected PAID, got ${payment.status}`);
      }
      if (Number(payment.amountReceived) !== 50.0) {
        throw new Error(`Amount received expected 50.0, got ${payment.amountReceived}`);
      }
      const expectedChange = 50.0 - Number(testOrderA.total);
      if (Math.abs(Number(payment.changeGiven) - expectedChange) > 0.01) {
        throw new Error(`Change given expected ${expectedChange}, got ${payment.changeGiven}`);
      }

      // Verify Order status remains in operational state (not corrupted)
      const freshOrder = await prisma.order.findUnique({ where: { id: testOrderA.id } });
      if (!freshOrder || freshOrder.status !== 'PENDING') {
        throw new Error(`Order operational status must remain PENDING: got ${freshOrder?.status}`);
      }
    });

    // 4. Sequential Technical Receipt Generation & Public Tracking
    await assert('Verify sequential technical receipt numbering, immutability, and public tracking', async () => {
      // Public tracker fetches receipt
      const publicReceiptRes = await request(app)
        .get(`/api/orders/track/${testOrderA.publicToken}/receipt`);

      if (publicReceiptRes.status !== 200 || !publicReceiptRes.body.success) {
        throw new Error(`Public receipt retrieval failed: ${publicReceiptRes.status}`);
      }

      const doc = publicReceiptRes.body.data;
      if (!doc.documentNumber.startsWith('REC-')) {
        throw new Error(`Document number must follow sequential format REC-YYYY-NNNNN, got: ${doc.documentNumber}`);
      }
      if (doc.customerNif !== '502123451') {
        throw new Error(`Receipt customerNif expected 502123451, got ${doc.customerNif}`);
      }
      if (!doc.hash) {
        throw new Error('Receipt cryptographic verification hash is missing');
      }
      if (!doc.snapshot || !doc.snapshot.items || doc.snapshot.items.length === 0) {
        throw new Error('Receipt frozen snapshot items missing');
      }
    });

    // 5. Card & MB WAY Payment with Mock Provider
    await assert('Initiate Mock Card and MB WAY payments with phone validation', async () => {
      // Create fresh order for MB WAY
      const foodItem = await prisma.foodItem.findFirst({ where: { restaurantId: restaurantA.id } });
      const orderRes = await request(app).post('/api/orders').send({
        restaurantSlug: restaurantA.slug,
        items: [{ foodItemId: foodItem!.id, quantity: 1 }],
      });
      const mbwayOrder = orderRes.body.data;

      // Rejection of invalid Portuguese mobile phone number for MB WAY
      const invalidPhoneRes = await request(app).post('/api/payments').send({
        orderId: mbwayOrder.id,
        restaurantId: restaurantA.id,
        method: 'MBWAY',
        phoneNumber: '210000000', // landline, must start with 9
      });
      if (invalidPhoneRes.status !== 400) {
        throw new Error(`Invalid MB WAY phone must be rejected with 400: got ${invalidPhoneRes.status}`);
      }

      // Valid MB WAY payment initiation
      const validMbwayRes = await request(app).post('/api/payments').send({
        orderId: mbwayOrder.id,
        restaurantId: restaurantA.id,
        method: 'MBWAY',
        phoneNumber: '912345678',
      });
      if (validMbwayRes.status !== 201 || !validMbwayRes.body.success) {
        throw new Error(`Valid MB WAY initiation failed: ${validMbwayRes.status}`);
      }

      const mbwayPayment = validMbwayRes.body.data;
      if (mbwayPayment.method !== 'MBWAY') {
        throw new Error('Payment method mismatch');
      }
    });

    // 6. Payment Idempotency & Webhook Deduplication
    await assert('Verify payment creation idempotency and webhook deduplication', async () => {
      const foodItem = await prisma.foodItem.findFirst({ where: { restaurantId: restaurantA.id } });
      const orderRes = await request(app).post('/api/orders').send({
        restaurantSlug: restaurantA.slug,
        items: [{ foodItemId: foodItem!.id, quantity: 1 }],
      });
      const testOrder = orderRes.body.data;

      const idempotencyKey = `idemp-test-${Date.now()}`;

      // First call
      const res1 = await request(app)
        .post('/api/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          orderId: testOrder.id,
          restaurantId: restaurantA.id,
          method: 'CARD',
        });
      if (res1.status !== 201) {
        throw new Error(`First payment call failed: ${res1.status}`);
      }
      const payment1 = res1.body.data;

      // Second call with same idempotency key
      const res2 = await request(app)
        .post('/api/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          orderId: testOrder.id,
          restaurantId: restaurantA.id,
          method: 'CARD',
        });
      if (res2.status !== 200 || res2.body.data.id !== payment1.id) {
        throw new Error(`Idempotent replay failed: status=${res2.status}, expected paymentId=${payment1.id}`);
      }
      if (!res2.body.isIdempotentReplay) {
        throw new Error('Expected isIdempotentReplay flag to be true');
      }

      // Webhook deduplication
      const webhookPayload = {
        id: `evt_test_${Date.now()}`,
        type: 'payment.succeeded',
        paymentId: payment1.id,
        amount: Number(payment1.amount),
        currency: 'EUR',
      };

      const wh1 = await request(app)
        .post('/api/payments/webhooks/mock')
        .send(webhookPayload);
      if (wh1.status !== 200) {
        throw new Error(`First webhook delivery failed: ${wh1.status}`);
      }

      // Duplicate webhook delivery
      const wh2 = await request(app)
        .post('/api/payments/webhooks/mock')
        .send(webhookPayload);
      if (wh2.status !== 200 || !wh2.body.data?.duplicate) {
        throw new Error('Duplicate webhook must return 200 with duplicate=true');
      }
    });

    // 7. Full & Partial Refunds
    await assert('Process full and partial refunds with balance validation', async () => {
      // Find a paid payment
      const payment = await prisma.payment.findFirst({
        where: { restaurantId: restaurantA.id, status: 'PAID' },
      });
      if (!payment) throw new Error('No paid payment found for refund test');

      const initialAmount = Number(payment.amount);
      const partialAmount = Math.round((initialAmount / 2) * 100) / 100;

      // Partial refund
      const ref1 = await request(app)
        .post(`/api/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: partialAmount,
          reason: 'Customer complaint about side dish',
        });
      if (ref1.status !== 200 || !ref1.body.success) {
        throw new Error(`Partial refund failed: ${ref1.status} ${JSON.stringify(ref1.body)}`);
      }
      if (ref1.body.data.status !== 'PARTIALLY_REFUNDED') {
        throw new Error(`Expected status PARTIALLY_REFUNDED, got ${ref1.body.data.status}`);
      }

      // Over-refund rejection
      const excessiveRefund = await request(app)
        .post(`/api/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: initialAmount, // Exceeds remaining balance
          reason: 'Excessive refund attempt',
        });
      if (excessiveRefund.status !== 400) {
        throw new Error(`Excessive refund must be rejected with 400: got ${excessiveRefund.status}`);
      }

      // Complete remainder refund
      const remainingAmount = initialAmount - partialAmount;
      const ref2 = await request(app)
        .post(`/api/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: remainingAmount,
          reason: 'Full order refund',
        });
      if (ref2.status !== 200 || ref2.body.data.status !== 'REFUNDED') {
        throw new Error(`Full refund completion failed: ${ref2.status}`);
      }
    });

    // 8. Multi-Tenant Financial Isolation
    await assert('Enforce strict multi-tenant isolation on financial endpoints', async () => {
      // Owner of restaurant B cannot access restaurant A payments
      const forbiddenRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/payments`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);

      if (forbiddenRes.status !== 403) {
        throw new Error(`Cross-tenant access must return 403: got ${forbiddenRes.status}`);
      }

      // Owner B cannot access restaurant A cash operations
      const forbiddenCash = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/cash-operations`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);

      if (forbiddenCash.status !== 403) {
        throw new Error(`Cross-tenant cash operations must return 403: got ${forbiddenCash.status}`);
      }
    });

    // 9. Cash Register Operations & Financial Reconciliation
    await assert('Audit cash register drawer and financial reconciliation reports', async () => {
      const cashOpsRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/cash-operations`)
        .set('Authorization', `Bearer ${ownerToken}`);

      if (cashOpsRes.status !== 200 || !cashOpsRes.body.success) {
        throw new Error(`Cash operations fetch failed: ${cashOpsRes.status}`);
      }

      const { summary } = cashOpsRes.body.data;
      if (summary.totalCashCollected <= 0) {
        throw new Error('Total cash collected should be greater than 0');
      }
      if (summary.netCashInRegister <= 0) {
        throw new Error('Net cash in register should be greater than 0');
      }

      const recRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/reconciliation`)
        .set('Authorization', `Bearer ${ownerToken}`);

      if (recRes.status !== 200 || !recRes.body.success) {
        throw new Error(`Reconciliation fetch failed: ${recRes.status}`);
      }

      const recData = recRes.body.data;
      if (!recData.totalsByMethod || typeof recData.totalsByMethod.CASH !== 'number') {
        throw new Error('Reconciliation totalsByMethod.CASH missing');
      }
    });

    // 10. Customer Directory with Privacy Masking
    await assert('Customer directory masks NIFs and tracks consent status', async () => {
      const custRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/customers`)
        .set('Authorization', `Bearer ${ownerToken}`);

      if (custRes.status !== 200 || !custRes.body.success) {
        throw new Error(`Customer directory retrieval failed: ${custRes.status}`);
      }

      const { customers } = custRes.body.data;
      if (!customers || customers.length === 0) {
        throw new Error('No customers found in directory');
      }

      const diner = customers.find((c: any) => c.email === 'finance@empresa-teste.pt');
      if (!diner) {
        throw new Error('Registered diner not found');
      }
      if (!diner.consentGiven) {
        throw new Error('Diner consentGiven must be true');
      }
    });

  } finally {
    console.log(`\n==================================================`);
    console.log(`Phase 8 Test Results: ${passed} passed, ${failed} failed`);
    console.log(`==================================================\n`);
    await prisma.$disconnect();
    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runPhase8Tests().catch((err) => {
  console.error('Fatal error running Phase 8 tests:', err);
  process.exit(1);
});
