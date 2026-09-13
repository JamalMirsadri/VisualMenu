import { prisma } from '../src/prisma';

/**
 * Live-DB schema verification for tenant UUID columns.
 *
 * Ensures the columns that the Prisma schema declares as `@db.Uuid` are actually
 * `uuid` typed in PostgreSQL (not `text`/`varchar`, which is the classic
 * `prisma db push` drift that produces "Error creating UUID" at runtime).
 */

const EXPECTED_UUID_COLUMNS: { table: string; column: string }[] = [
  { table: 'restaurants', column: 'id' },
  { table: 'users', column: 'id' },
  { table: 'user_restaurants', column: 'id' },
  { table: 'user_restaurants', column: 'user_id' },
  { table: 'user_restaurants', column: 'restaurant_id' },
  { table: 'categories', column: 'id' },
  { table: 'categories', column: 'restaurant_id' },
  { table: 'food_items', column: 'id' },
  { table: 'food_items', column: 'restaurant_id' },
  { table: 'food_items', column: 'category_id' },
  { table: 'subscriptions', column: 'restaurant_id' },
  { table: 'subscriptions', column: 'plan_id' },
];

interface UuidColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
}

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<UuidColumn[]>`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (data_type = 'uuid' OR udt_name = 'uuid')
  `;

  const actual = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r]));

  let failed = 0;
  for (const { table, column } of EXPECTED_UUID_COLUMNS) {
    const key = `${table}.${column}`;
    const found = actual.get(key);
    if (!found) {
      console.error(`  ✗ ${key}: NOT uuid (missing or wrong type)`);
      failed++;
    } else {
      console.log(`  ✓ ${key}: ${found.data_type}/${found.udt_name}`);
    }
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} tenant UUID column(s) are not uuid-typed.`);
    process.exit(1);
  }

  console.log(`\n✅ All ${EXPECTED_UUID_COLUMNS.length} tenant UUID columns are uuid-typed.`);
}

main()
  .catch((err) => {
    console.error('Fatal error during UUID column verification:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
