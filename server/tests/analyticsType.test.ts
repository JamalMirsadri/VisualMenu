import './setup';
import { prisma } from '../src/prisma';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { classifyItemKind } from '../src/services/analytics/classification';
import { AnalyticsService } from '../src/services/analytics/analyticsService';

async function createCategory(restaurantId: string, name: string, slug: string) {
  return prisma.category.create({ data: { restaurantId, name, slug } });
}

async function createFood(restaurantId: string, categoryId: string, name: string, slug: string, analyticsType: string | null) {
  return prisma.foodItem.create({
    data: { restaurantId, categoryId, name, slug, price: 10, analyticsType: analyticsType as any },
  });
}

async function createOrder(restaurantId: string, orderNumber: string, createdAt: string, items: { foodId: string; name: string }[]) {
  const subtotal = items.length * 10;
  await prisma.order.create({
    data: {
      restaurantId,
      orderNumber,
      status: 'PENDING',
      subtotal,
      tax: 0,
      total: subtotal,
      createdAt: new Date(createdAt),
      items: {
        create: items.map((i) => ({
          foodItemId: i.foodId,
          foodNameSnapshot: i.name,
          unitPrice: 10,
          quantity: 1,
          lineTotal: 10,
        })),
      },
    },
  });
}

async function runTests() {
  console.log('🧪 Analytics Type Regression Suite (8 Tests)...\n');
  let passed = 0;
  let failed = 0;
  const assert = async (num: number, desc: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/8] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/8] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let r1: any, r2: any;

  try {
    // ----- Unit: explicit type + heuristic fallback -----
    await assert(1, 'Explicit type wins over category name', () => {
      if (classifyItemKind('DRINK', 'specials', 'Specials', 'Chef Surprise') !== 'DRINK') throw new Error('explicit DRINK not respected');
      if (classifyItemKind('FOOD', 'beverages', 'Beverages', 'Cola') !== 'FOOD') throw new Error('explicit FOOD not respected over beverage category');
    });

    await assert(2, 'Explicit OTHER is preserved', () => {
      if (classifyItemKind('OTHER', 'kids-menu', 'Kids Menu', 'Toy Meal') !== 'OTHER') throw new Error('explicit OTHER not respected');
    });

    await assert(3, 'NULL type uses legacy fallback (drink/dessert)', () => {
      if (classifyItemKind(null, 'beverages', 'Beverages', 'Cola') !== 'DRINK') throw new Error('legacy DRINK fallback failed');
      if (classifyItemKind(undefined, 'desserts', 'Desserts', 'Cake') !== 'DESSERT') throw new Error('legacy DESSERT fallback failed');
    });

    await assert(4, 'NULL type with custom category falls back to FOOD', () => {
      if (classifyItemKind(null, 'kids-menu', 'Kids Menu', 'Nuggets') !== 'FOOD') throw new Error('legacy default FOOD fallback failed');
    });

    // ----- Integration -----
    r1 = await prisma.restaurant.create({ data: { name: 'R1', slug: `atype1-${unique}`, active: true, timezone: 'UTC' } });
    r2 = await prisma.restaurant.create({ data: { name: 'R2', slug: `atype2-${unique}`, active: true, timezone: 'UTC' } });

    const kidsMenu = await createCategory(r1.id, 'Kids Menu', 'kids-menu');
    const beverages = await createCategory(r1.id, 'Beverages', 'beverages');
    const desserts = await createCategory(r1.id, 'Desserts', 'desserts');

    const kidBurger = await createFood(r1.id, kidsMenu.id, 'Kid Burger', `kid-burger-${unique}`, 'FOOD');
    const specialDrink = await createFood(r1.id, kidsMenu.id, 'Special Smoothie', `special-smoothie-${unique}`, 'DRINK');
    const legacyCola = await createFood(r1.id, beverages.id, 'Legacy Cola', `legacy-cola-${unique}`, null);
    const cake = await createFood(r1.id, desserts.id, 'Cake', `cake-${unique}`, null);
    const otherItem = await createFood(r1.id, kidsMenu.id, 'Mystery Item', `mystery-${unique}`, 'OTHER');

    await createOrder(r1.id, 'R1-O1', '2026-09-15T10:00:00Z', [
      { foodId: kidBurger.id, name: 'Kid Burger' },
      { foodId: specialDrink.id, name: 'Special Smoothie' },
      { foodId: legacyCola.id, name: 'Legacy Cola' },
      { foodId: cake.id, name: 'Cake' },
      { foodId: otherItem.id, name: 'Mystery Item' },
    ]);

    // R2 isolation marker
    const r2cat = await createCategory(r2.id, 'Main Course', 'mains');
    const r2food = await createFood(r2.id, r2cat.id, 'R2 Secret', `r2-secret-${unique}`, 'FOOD');
    await createOrder(r2.id, 'R2-O1', '2026-09-15T10:00:00Z', [{ foodId: r2food.id, name: 'R2 Secret' }]);

    const data = await AnalyticsService.getAnalytics(r1.id, { period: 'month', date: '2026-09' });

    await assert(5, 'Explicit FOOD/DRINK/DESSERT classification in analytics', async () => {
      const foods = (data.topFoods || []).map((x: any) => x.name);
      const drinks = (data.topDrinks || []).map((x: any) => x.name);
      const desserts = (data.topDesserts || []).map((x: any) => x.name);
      if (!foods.includes('Kid Burger')) throw new Error(`Kid Burger missing from topFoods: ${foods}`);
      if (!drinks.includes('Special Smoothie')) throw new Error(`Special Smoothie missing from topDrinks: ${drinks}`);
      if (!drinks.includes('Legacy Cola')) throw new Error(`Legacy Cola (fallback) missing from topDrinks: ${drinks}`);
      if (!desserts.includes('Cake')) throw new Error(`Cake missing from topDesserts: ${desserts}`);
    });

    await assert(6, 'OTHER type excluded from food/drink/dessert rankings', async () => {
      const foods = (data.topFoods || []).map((x: any) => x.name);
      const drinks = (data.topDrinks || []).map((x: any) => x.name);
      const desserts = (data.topDesserts || []).map((x: any) => x.name);
      if (foods.includes('Mystery Item') || drinks.includes('Mystery Item') || desserts.includes('Mystery Item')) {
        throw new Error('OTHER item leaked into a ranking');
      }
    });

    await assert(7, 'Combinations remain correct with explicit types', async () => {
      const fd = data.combinations.foodDrink.find((x: any) => x.combination.join('+') === 'Kid Burger+Special Smoothie');
      const fdd = data.combinations.foodDrinkDessert.find((x: any) => x.combination.join('+') === 'Kid Burger+Special Smoothie+Cake');
      if (!fd || fd.count !== 1) throw new Error(`foodDrink missing: ${JSON.stringify(data.combinations.foodDrink)}`);
      if (!fdd || fdd.count !== 1) throw new Error(`foodDrinkDessert missing: ${JSON.stringify(data.combinations.foodDrinkDessert)}`);
    });

    await assert(8, 'Tenant isolation remains intact', async () => {
      const foods = (data.topFoods || []).map((x: any) => x.name);
      if (foods.includes('R2 Secret')) throw new Error('R2 product leaked into R1 analytics');
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    if (r1?.id) await RestaurantDeletionService.hardDelete(r1.id).catch(() => {});
    if (r2?.id) await RestaurantDeletionService.hardDelete(r2.id).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nAnalytics Type Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
