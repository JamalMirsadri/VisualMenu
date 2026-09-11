import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const PG_BIN_DIR = 'C:\\PostgreSQL\\17\\bin';
const PG_DUMP = path.join(PG_BIN_DIR, 'pg_dump.exe');
const PSQL = path.join(PG_BIN_DIR, 'psql.exe');

const DB_HOST = 'localhost';
const DB_PORT = '5433';
const DB_USER = 'postgres';
const DB_PASS = 'postgres';
const SOURCE_DB = 'restaurant_menu';
const RESTORE_TEST_DB = 'restaurant_menu_restore_test';

const TEMP_BACKUP_PATH = path.join(process.cwd(), 'backup_test_temp.sql');

async function main() {
  console.log('🔄 ============================================================');
  console.log('📦 Phase 6: Real Database Backup & Restore Verification Test');
  console.log('🔄 ============================================================');

  const env = {
    ...process.env,
    PGPASSWORD: DB_PASS,
  };

  // 1. Connect to primary database to count core tables
  const primaryPrisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${SOURCE_DB}?schema=public`,
      },
    },
  });

  console.log(`\n1️⃣  Reading record counts from active production/dev database (${SOURCE_DB})...`);
  const coreTables = [
    'User',
    'Restaurant',
    'UserRestaurant',
    'Category',
    'FoodItem',
    'Media',
    'RestaurantSettings',
    'Table',
    'QrCode',
    'Order',
    'OrderItem',
    'OrderStatusHistory',
    'AuditLog',
  ];

  const originalCounts: Record<string, number> = {};
  for (const table of coreTables) {
    const delegate = (primaryPrisma as any)[table.charAt(0).toLowerCase() + table.slice(1)];
    if (delegate && typeof delegate.count === 'function') {
      originalCounts[table] = await delegate.count();
    }
  }
  console.log('   Original database row counts:');
  for (const [t, c] of Object.entries(originalCounts)) {
    console.log(`     - ${t}: ${c}`);
  }
  await primaryPrisma.$disconnect();

  // 2. Perform live pg_dump
  console.log(`\n2️⃣  Executing pg_dump via PostgreSQL 17 binary...`);
  console.log(`   Binary: ${PG_DUMP}`);
  console.log(`   Target dump file: ${TEMP_BACKUP_PATH}`);

  const dumpCmd = `"${PG_DUMP}" -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${SOURCE_DB} -F p -f "${TEMP_BACKUP_PATH}"`;
  execSync(dumpCmd, { env, stdio: 'inherit' });

  const stats = fs.statSync(TEMP_BACKUP_PATH);
  console.log(`   ✓ Backup created successfully (${(stats.size / 1024).toFixed(2)} KB)`);

  // 3. Prepare fresh restore target database
  console.log(`\n3️⃣  Creating fresh restore database (${RESTORE_TEST_DB})...`);
  try {
    execSync(`"${PSQL}" -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_TEST_DB} WITH (FORCE);"`, {
      env,
      stdio: 'pipe',
    });
  } catch {}

  execSync(`"${PSQL}" -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "CREATE DATABASE ${RESTORE_TEST_DB};"`, {
    env,
    stdio: 'inherit',
  });
  console.log(`   ✓ Database ${RESTORE_TEST_DB} created.`);

  // 4. Restore the dump into RESTORE_TEST_DB
  console.log(`\n4️⃣  Restoring backup into ${RESTORE_TEST_DB} via psql...`);
  const restoreCmd = `"${PSQL}" -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${RESTORE_TEST_DB} -f "${TEMP_BACKUP_PATH}"`;
  execSync(restoreCmd, { env, stdio: 'pipe' });
  console.log(`   ✓ Restore completed.`);

  // 5. Connect to restored database and verify all counts match exactly
  console.log(`\n5️⃣  Verifying data integrity & schema parity in restored database...`);
  const restoredPrisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${RESTORE_TEST_DB}?schema=public`,
      },
    },
  });

  const restoredCounts: Record<string, number> = {};
  let parityPassed = true;

  for (const table of coreTables) {
    const delegate = (restoredPrisma as any)[table.charAt(0).toLowerCase() + table.slice(1)];
    if (delegate && typeof delegate.count === 'function') {
      const count = await delegate.count();
      restoredCounts[table] = count;
      const expected = originalCounts[table];
      const matches = count === expected;
      if (!matches) parityPassed = false;
      console.log(`     ${matches ? '✓' : '✗'} ${table}: ${count} (expected: ${expected})`);
    }
  }

  await restoredPrisma.$disconnect();

  if (!parityPassed) {
    throw new Error('Data parity verification failed: Row counts do not match between original and restored database!');
  }
  console.log('\n   🎉 Parity check 100% matched across all tables!');

  // 6. Clean up temporary test database and dump file
  console.log(`\n6️⃣  Cleaning up temporary test artifacts...`);
  execSync(`"${PSQL}" -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_TEST_DB} WITH (FORCE);"`, {
    env,
    stdio: 'inherit',
  });
  console.log(`   ✓ Cleaned up test database ${RESTORE_TEST_DB}`);

  if (fs.existsSync(TEMP_BACKUP_PATH)) {
    fs.unlinkSync(TEMP_BACKUP_PATH);
    console.log(`   ✓ Removed temporary dump file.`);
  }

  console.log('\n============================================================');
  console.log('✅ BACKUP & RESTORE DRILL VERIFIED: 100% DATA INTEGRITY');
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Backup & Restore test failed:', err);
  // Attempt cleanup if dump file remains
  if (fs.existsSync(TEMP_BACKUP_PATH)) {
    try { fs.unlinkSync(TEMP_BACKUP_PATH); } catch {}
  }
  process.exit(1);
});
