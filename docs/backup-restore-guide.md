# PostgreSQL Backup & Disaster Recovery Runbook

This document details the production backup, point-in-time recovery, and disaster drill procedures for the Restaurant Menu platform.

---

## 1. Automated Daily & Point-in-Time Backups

### Binary Locations
- **Database Engine**: PostgreSQL 17
- **Port**: 5433 (or standard 5432 in production)
- **Database Name**: `restaurant_menu`
- **CLI Tools**: `pg_dump`, `pg_restore`, `psql`

---

## 2. Backup Procedures

### A. Logical Dump (Standard Daily Snapshot)
Creates a plaintext SQL dump suitable for audit and cross-version migration:
```bash
pg_dump -h localhost -p 5433 -U postgres -d restaurant_menu -F p -f backups/menu_backup_$(date +%Y%m%d_%H%M%S).sql
```

### B. Custom Archive Format (Recommended for Production)
Compressed, supports parallel restore and selective table extraction:
```bash
pg_dump -h localhost -p 5433 -U postgres -d restaurant_menu -F c -b -v -f backups/menu_backup_$(date +%Y%m%d_%H%M%S).dump
```

---

## 3. Restoration Procedures

### Full Database Restore from Plaintext SQL:
1. Ensure the target database exists or create it:
   ```bash
   psql -h localhost -p 5433 -U postgres -c "CREATE DATABASE restaurant_menu_restored;"
   ```
2. Restore schema and data:
   ```bash
   psql -h localhost -p 5433 -U postgres -d restaurant_menu_restored -f backups/menu_backup.sql
   ```

### Full Database Restore from Custom Archive:
```bash
pg_restore -h localhost -p 5433 -U postgres -d restaurant_menu_restored -v backups/menu_backup.dump
```

---

## 4. Automated Backup Verification Drill

We have an automated verification test script:
```bash
npx tsx scripts/backup_restore_test.ts
```

This drill performs the following automated steps:
1. Measures record counts across all core tables (`User`, `Restaurant`, `UserRestaurant`, `Category`, `FoodItem`, `Media`, `RestaurantSettings`, `Table`, `QrCode`, `Order`, `OrderItem`, `OrderStatusHistory`, `AuditLog`).
2. Dumps the live database using `pg_dump`.
3. Creates a temporary clean database `restaurant_menu_restore_test`.
4. Restores the dump via `psql`.
5. Connects to the restored database and verifies 100% row count parity across all tables.
6. Drops the test database and deletes the temporary dump file.

---

## 5. Recovery Time Objective (RTO) & Recovery Point Objective (RPO)
- **RPO**: < 1 hour (using automated WAL archiving or hourly scheduled snapshots).
- **RTO**: < 5 minutes (automated database spin-up and restore).
