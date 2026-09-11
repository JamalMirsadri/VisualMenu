# Production Database Operations & Disaster Recovery Guide

## 1. Architecture & PostgreSQL Topology

AURA Studio utilizes PostgreSQL as the authoritative, single source of truth for all multi-tenant restaurant data, menus, digital tables, real-time orders, audit logs, and authentication credentials.

### Key Database Properties
- **Engine**: PostgreSQL 15+ (tested on PostgreSQL 17)
- **Primary Keys**: UUIDv4 (`gen_random_uuid()`) for non-enumerable, globally unique entity addressing.
- **Precision Currency**: `Decimal(10, 2)` for monetary values (strictly no floating-point arithmetic).
- **Time Standard**: UTC timestamps (`timestamptz` / `CURRENT_TIMESTAMP`) across all relations.
- **Isolation**: Tenant isolation enforced strictly at the database foreign-key layer (`restaurantId`) and validated server-side by role/permission matrix middleware.

---

## 2. Backup Procedures

### 2.1 Full Logical Backup (`pg_dump`)
Perform automated snapshots utilizing PostgreSQL's compressed custom format (`-Fc`), which supports parallel restore, selective table restoration, and built-in compression.

```powershell
# Windows PowerShell Backup Script
$DATE = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_DIR = "C:\Backups\auradb"
$BACKUP_FILE = "$BACKUP_DIR\auradb_backup_$DATE.dump"

# Ensure directory exists
if (-not (Test-Path $BACKUP_DIR)) { New-Item -ItemType Directory -Path $BACKUP_DIR }

# Execute pg_dump
& "pg_dump.exe" `
  -h localhost `
  -p 5433 `
  -U postgres `
  -d auradb `
  -F c `
  -b `
  -v `
  -f $BACKUP_FILE

Write-Output "Backup completed successfully: $BACKUP_FILE"
```

```bash
# Linux / Bash Production Snapshot Script
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/auradb"
mkdir -p "$BACKUP_DIR"

export PGPASSWORD="${DB_PASSWORD}"
pg_dump \
  -h "${DB_HOST:-localhost}" \
  -p "${DB_PORT:-5432}" \
  -U "${DB_USER:-postgres}" \
  -d "${DB_NAME:-auradb}" \
  -F c -b -v \
  -f "${BACKUP_DIR}/auradb_${TIMESTAMP}.dump"

# Retain last 14 daily backups
find "$BACKUP_DIR" -type f -name "*.dump" -mtime +14 -exec rm {} \;
echo "Backup saved: ${BACKUP_DIR}/auradb_${TIMESTAMP}.dump"
```

---

## 3. Restoration & Point-in-Time Recovery (PITR)

### 3.1 Standard Database Restoration (`pg_restore`)
To restore an existing database or spin up a staging replica from a `.dump` archive:

```bash
# 1. Terminate existing connections to auradb
psql -U postgres -p 5433 -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE datname = 'auradb' AND pid <> pg_backend_pid();"

# 2. Re-create target database (clean slate)
dropdb -h localhost -p 5433 -U postgres auradb
createdb -h localhost -p 5433 -U postgres auradb

# 3. Restore using pg_restore
pg_restore \
  -h localhost \
  -p 5433 \
  -U postgres \
  -d auradb \
  -v \
  --no-owner \
  --role=postgres \
  /path/to/backup.dump
```

### 3.2 Selective Table Restoration
If an accidental deletion occurs on a single restaurant or order partition:
```bash
pg_restore -d auradb -t "Order" -t "OrderStatusHistory" /path/to/backup.dump
```

---

## 4. Prisma Migration Management & Rollback Strategy

### 4.1 Applying Production Migrations
In staging and production pipelines, always run:
```bash
npx prisma migrate deploy
```
*Never* execute `prisma db push` in production environments, as it bypasses versioned migration history and safety validations.

### 4.2 Migration Rollback Protocol
Prisma does not have an automatic `migrate down` command by design to prevent silent data loss. When a migration must be reverted:

1. **Do NOT delete the migration directory from Git history**: Prisma tracks applied migrations in the `_prisma_migrations` table via checksum.
2. **Generate a Reverting Migration**:
   ```bash
   # Create a clean SQL migration with inverted operations
   npx prisma migrate new --name revert_feature_change
   ```
3. **Execute deploy**:
   ```bash
   npx prisma migrate deploy
   ```
4. **Emergency Hot-Fix Rollback**:
   If an in-progress migration failed and locked the database:
   ```bash
   # Mark the failed migration as rolled back in the Prisma metadata table
   npx prisma migrate resolve --rolled-back "20260908130000_phase5_saas_realtime_orders"
   ```

---

## 5. Performance Tuning & Indexing

### 5.1 Critical Production Indexes
Ensure the following compound and unique indexes remain active:
- `Order(restaurantId, createdAt)`: Supports fast tenant-scoped live order feeds and analytics.
- `Order(publicToken)`: Fast unique customer tracking lookup without exposing primary keys.
- `Order(idempotencyKey)`: Prevents double charges and duplicate order placements under high latency.
- `OrderStatusHistory(orderId, createdAt)`: High-performance status timeline reconstruction.
- `Table(restaurantId, active)`: Dynamic QR seating allocation.

### 5.2 Connection Pooling
For deployments exceeding 50 concurrent staff terminals, implement **PgBouncer** or managed pooling (AWS RDS Proxy / Supabase Pooler):
```ini
[databases]
auradb = host=127.0.0.1 port=5433 dbname=auradb pool_size=25

[pgbouncer]
pool_mode = transaction
max_client_conn = 500
default_pool_size = 20
reserve_pool_size = 5
```

---

## 6. Disaster Recovery & Health Check Integration

AURA Studio provides an integrated live health ping at:
```http
GET /api/health
```

**Response Payload**:
```json
{
  "status": "healthy",
  "database": {
    "status": "connected",
    "latencyMs": 2
  },
  "timestamp": "2026-09-08T12:00:00.000Z",
  "uptime": 3600
}
```

If the PostgreSQL query fails, the endpoint returns HTTP 503 with `"status": "degraded"` and diagnostic details, allowing orchestrators (Docker Swarm, Kubernetes, Cloud Run) to initiate automated healing.
