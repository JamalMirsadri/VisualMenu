import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import './setup';
import { createRestaurantWithSubscription } from './helpers';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { Role, StaffStatus, AuditAction } from '@prisma/client';
import { PERMISSION_CATALOG, ROLE_TEMPLATES } from '../src/constants/permissions';

async function runStaffTests() {
  console.log('🚀 Starting Phase 11A: Restaurant Staff Management, Custom Permissions & RBAC Test Suite...\n');
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

  // Test state variables
  let restaurantA: any = null;
  let restaurantB: any = null;
  let ownerAToken = '';
  let ownerAUser: any = null;
  let ownerBToken = '';
  let ownerBUser: any = null;
  let directStaffUser: any = null;
  let directStaffToken = '';
  let invitedStaffToken = '';
  let invitedStaffRawToken = '';
  let invitedStaffId = '';
  let resendRawToken = '';
  let revokedInvitationId = '';
  let revokedRawToken = '';

  const timestamp = Date.now();
  const ownerAEmail = `owner-a-${timestamp}@teststaff.com`;
  const ownerBEmail = `owner-b-${timestamp}@teststaff.com`;
  const directStaffEmail = `direct-staff-${timestamp}@teststaff.com`;
  const invitedStaffEmail = `invited-staff-${timestamp}@teststaff.com`;
  const multiTenantEmail = `multi-staff-${timestamp}@teststaff.com`;

  try {
    // -------------------------------------------------------------------------
    // 1. DATABASE SEEDING & PERMISSION CATALOG VERIFICATION
    // -------------------------------------------------------------------------
    await assert('1. Permission catalog has 51 total permissions seeded in PostgreSQL', async () => {
      const count = await prisma.permission.count();
      if (count < 51) throw new Error(`Expected at least 51 permissions, found ${count}`);
    });

    await assert('2. Catalog covers all 15 functional groups and standard role templates', async () => {
      const allPerms = await prisma.permission.findMany();
      const groups = new Set(allPerms.map((p) => p.group));
      const requiredGroups = [
        'General', 'Orders', 'Kitchen', 'Tables', 'Menu', 'Media',
        'Customers', 'Payments', 'Fiscal', 'Staff', 'Restaurant Settings',
        'Branding', 'Reporting', 'Audit', 'QR'
      ];
      for (const rg of requiredGroups) {
        if (!groups.has(rg)) throw new Error(`Missing required permission group: ${rg}`);
      }

      const templates = Object.keys(ROLE_TEMPLATES);
      if (!templates.includes('WAITER') || !templates.includes('KITCHEN') || !templates.includes('CASHIER')) {
        throw new Error('Role templates missing expected job roles');
      }
    });

    // -------------------------------------------------------------------------
    // 2. SETUP TEST RESTAURANTS & OWNERS
    // -------------------------------------------------------------------------
    await assert('3. Setup Restaurant A & Restaurant B with verified Owners', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);

      // Create Owner A
      ownerAUser = await prisma.user.create({
        data: {
          email: ownerAEmail,
          name: 'Owner Alice',
          passwordHash,
          active: true,
        },
      });

      restaurantA = await createRestaurantWithSubscription({
        data: {
          name: `Bistro Alpha ${timestamp}`,
          slug: `bistro-alpha-${timestamp}`,
          currency: 'EUR',
          currencySymbol: '€',
          defaultLanguage: 'pt',
          userRestaurants: {
            create: {
              userId: ownerAUser.id,
              role: Role.OWNER,
              status: StaffStatus.ACTIVE,
            },
          },
        },
      });

      // Login Owner A
      const loginResA = await request(app).post('/api/auth/login').send({
        email: ownerAEmail,
        password: 'Password123!',
      });
      ownerAToken = loginResA.body.data.token;

      // Create Owner B
      ownerBUser = await prisma.user.create({
        data: {
          email: ownerBEmail,
          name: 'Owner Bob',
          passwordHash,
          active: true,
        },
      });

      restaurantB = await createRestaurantWithSubscription({
        data: {
          name: `Lounge Beta ${timestamp}`,
          slug: `lounge-beta-${timestamp}`,
          currency: 'EUR',
          currencySymbol: '€',
          defaultLanguage: 'pt',
          userRestaurants: {
            create: {
              userId: ownerBUser.id,
              role: Role.OWNER,
              status: StaffStatus.ACTIVE,
            },
          },
        },
      });

      const loginResB = await request(app).post('/api/auth/login').send({
        email: ownerBEmail,
        password: 'Password123!',
      });
      ownerBToken = loginResB.body.data.token;
    });

    // -------------------------------------------------------------------------
    // 3. CATALOG API ENDPOINT
    // -------------------------------------------------------------------------
    await assert('4. GET /api/restaurants/:id/staff-permissions-catalog returns catalog & templates', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/staff-permissions-catalog`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data.permissions || res.body.data.permissions.length < 51) {
        throw new Error(`Expected 51 permissions in catalog response, got ${res.body.data.permissions?.length}`);
      }
      if (!res.body.data.templates.WAITER || !res.body.data.templates.KITCHEN) {
        throw new Error('Templates not properly returned in catalog');
      }
    });

    // -------------------------------------------------------------------------
    // 4. DIRECT STAFF CREATION (WITH TEMPORARY PASSWORD)
    // -------------------------------------------------------------------------
    await assert('5. Owner can directly create staff with password and template permissions', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          email: directStaffEmail,
          name: 'Direct Waiter',
          role: 'STAFF',
          jobTemplate: 'WAITER',
          permissions: ['VIEW_ORDERS', 'VIEW_ORDER_DETAILS', 'CONFIRM_ORDER'],
          password: 'Password123!',
        });

      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (!res.body.data.member) throw new Error('Expected member in response');
      if (res.body.data.member.email !== directStaffEmail.toLowerCase()) throw new Error('Incorrect email returned');
      if (res.body.data.member.permissions.length !== 3) {
        throw new Error(`Expected 3 permissions, got ${res.body.data.member.permissions.length}`);
      }

      directStaffUser = res.body.data.member;

      // Verify UserRestaurantPermission rows in PostgreSQL
      const dbPermCount = await prisma.userRestaurantPermission.count({
        where: { userRestaurantId: directStaffUser.membershipId },
      });
      if (dbPermCount !== 3) throw new Error(`Expected 3 UserRestaurantPermission rows in DB, got ${dbPermCount}`);
    });

    await assert('6. Duplicate staff creation in same restaurant returns 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          email: directStaffEmail,
          name: 'Direct Waiter Duplicate',
          role: 'STAFF',
          jobTemplate: 'WAITER',
          password: 'Password123!',
        });

      if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
      if (res.body.errorCode !== 'ALREADY_MEMBER') throw new Error(`Expected ALREADY_MEMBER, got ${res.body.errorCode}`);
    });

    await assert('7. Input validation prevents invalid email or invalid role (400)', async () => {
      const invalidEmail = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ email: 'invalid-email', name: 'Test', role: 'STAFF' });
      if (invalidEmail.status !== 400) throw new Error(`Expected 400 for invalid email, got ${invalidEmail.status}`);

      const invalidRole = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ email: 'valid@test.com', name: 'Test', role: 'SUPER_HERO' });
      if (invalidRole.status !== 400) throw new Error(`Expected 400 for invalid role, got ${invalidRole.status}`);
    });

    // -------------------------------------------------------------------------
    // 5. CRYPTOGRAPHIC STAFF INVITATION LIFECYCLE
    // -------------------------------------------------------------------------
    await assert('8. Owner can create cryptographic staff invitation (raw token returned, hash in DB)', async () => {
      const res = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          email: invitedStaffEmail,
          name: 'Carlos Kitchen',
          role: 'STAFF',
          jobTemplate: 'KITCHEN',
          permissions: ['VIEW_KITCHEN', 'VIEW_KITCHEN_ORDERS', 'CONFIRM_PREPARATION', 'MARK_READY'],
        });

      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
      const inv = res.body.data.invitation;
      if (!inv || !inv.rawToken) throw new Error('Expected rawToken in invitation response');
      if (inv.rawToken.length !== 64) throw new Error(`Expected 64-char hex token, got length ${inv.rawToken.length}`);

      invitedStaffRawToken = inv.rawToken;
      invitedStaffId = inv.id;

      // Verify that rawToken is NOT in DB, only SHA-256 hash
      const dbInv = await prisma.staffInvitation.findUnique({ where: { id: inv.id } });
      if (!dbInv) throw new Error('Invitation not found in DB');
      if (dbInv.tokenHash === invitedStaffRawToken) throw new Error('CRITICAL: Raw token stored in DB instead of hash!');

      const expectedHash = crypto.createHash('sha256').update(invitedStaffRawToken).digest('hex');
      if (dbInv.tokenHash !== expectedHash) throw new Error('Token hash does not match computed SHA-256 hash');
    });

    await assert('9. Public GET /api/staff/invitations/:token validates token and returns metadata', async () => {
      const res = await request(app).get(`/api/staff/invitations/${invitedStaffRawToken}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.data.invitedEmail !== invitedStaffEmail.toLowerCase()) {
        throw new Error(`Expected ${invitedStaffEmail}, got ${res.body.data.invitedEmail}`);
      }
      if (res.body.data.restaurant.id !== restaurantA.id) throw new Error('Mismatched restaurant in invitation');
      if (res.body.data.role !== 'STAFF' || res.body.data.jobTemplate !== 'KITCHEN') {
        throw new Error('Mismatched role/template');
      }
    });

    await assert('10. Invalid token returns 404 INVITATION_NOT_FOUND', async () => {
      const res = await request(app).get('/api/staff/invitations/invalid-fake-token-0000000000000000');
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
      if (res.body.errorCode !== 'INVITATION_NOT_FOUND') throw new Error(`Expected INVITATION_NOT_FOUND, got ${res.body.errorCode}`);
    });

    await assert('11. Invitee accepts invitation, sets password, and receives JWT token', async () => {
      const res = await request(app)
        .post(`/api/staff/invitations/${invitedStaffRawToken}/accept`)
        .send({
          password: 'Password123!',
          name: 'Carlos Kitchen Verified',
        });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      if (!res.body.data.token) throw new Error('Expected JWT session token in response');
      invitedStaffToken = res.body.data.token;

      // Check user restaurant membership created with staged permissions
      const user = await prisma.user.findUnique({
        where: { email: invitedStaffEmail.toLowerCase() },
        include: {
          userRestaurants: {
            include: { permissions: { include: { permission: true } } },
          },
        },
      });

      if (!user) throw new Error('User was not created');
      const ur = user.userRestaurants.find((m) => m.restaurantId === restaurantA.id);
      if (!ur) throw new Error('UserRestaurant not created for restaurant A');
      if (ur.role !== 'STAFF' || ur.jobTemplate !== 'KITCHEN') throw new Error('Role or jobTemplate mismatch');
      if (ur.permissions.length !== 4) throw new Error(`Expected 4 staged permissions, got ${ur.permissions.length}`);

      // Verify invitation marked accepted
      const inv = await prisma.staffInvitation.findUnique({ where: { id: invitedStaffId } });
      if (!inv?.acceptedAt) throw new Error('Invitation acceptedAt was not stamped');
    });

    await assert('12. Re-accepting already accepted invitation returns 410 INVITATION_ALREADY_ACCEPTED', async () => {
      const res = await request(app)
        .post(`/api/staff/invitations/${invitedStaffRawToken}/accept`)
        .send({ password: 'Password123!' });

      if (res.status !== 410) throw new Error(`Expected 410, got ${res.status}`);
      if (res.body.errorCode !== 'INVITATION_ALREADY_ACCEPTED') {
        throw new Error(`Expected INVITATION_ALREADY_ACCEPTED, got ${res.body.errorCode}`);
      }
    });

    // -------------------------------------------------------------------------
    // 6. INVITATION RESEND & REVOCATION
    // -------------------------------------------------------------------------
    await assert('13. Resending invitation revokes old token and generates fresh active token', async () => {
      // Create another invitation
      const initial = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          email: `resend-${timestamp}@teststaff.com`,
          name: 'Resend Candidate',
          role: 'STAFF',
          jobTemplate: 'CASHIER',
        });

      const oldToken = initial.body.data.invitation.rawToken;
      const invId = initial.body.data.invitation.id;

      // Resend
      const resendRes = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/staff/invitations/${invId}/resend`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (resendRes.status !== 200) throw new Error(`Expected 200, got ${resendRes.status}`);
      resendRawToken = resendRes.body.data.invitation.rawToken;
      if (resendRawToken === oldToken) throw new Error('Resend should issue a distinct cryptographic token');

      // Old token must be rejected as revoked (410)
      const oldCheck = await request(app).get(`/api/staff/invitations/${oldToken}`);
      if (oldCheck.status !== 410) throw new Error(`Expected 410 for old token, got ${oldCheck.status}`);
      if (oldCheck.body.errorCode !== 'INVITATION_REVOKED') {
        throw new Error(`Expected INVITATION_REVOKED, got ${oldCheck.body.errorCode}`);
      }

      // New token must be valid (200)
      const newCheck = await request(app).get(`/api/staff/invitations/${resendRawToken}`);
      if (newCheck.status !== 200) throw new Error(`Expected 200 for new token, got ${newCheck.status}`);
    });

    await assert('14. Revoking an invitation prevents acceptance (410 INVITATION_REVOKED)', async () => {
      const initial = await request(app)
        .post(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          email: `revoke-${timestamp}@teststaff.com`,
          name: 'Revoke Candidate',
          role: 'STAFF',
        });

      revokedRawToken = initial.body.data.invitation.rawToken;
      revokedInvitationId = initial.body.data.invitation.id;

      const revokeRes = await request(app)
        .delete(`/api/restaurants/${restaurantA.id}/staff/invitations/${revokedInvitationId}`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (revokeRes.status !== 200) throw new Error(`Expected 200, got ${revokeRes.status}`);

      // Attempt to accept revoked invitation
      const acceptRes = await request(app)
        .post(`/api/staff/invitations/${revokedRawToken}/accept`)
        .send({ password: 'Password123!' });

      if (acceptRes.status !== 410) throw new Error(`Expected 410, got ${acceptRes.status}`);
      if (acceptRes.body.errorCode !== 'INVITATION_REVOKED') {
        throw new Error(`Expected INVITATION_REVOKED, got ${acceptRes.body.errorCode}`);
      }
    });

    // -------------------------------------------------------------------------
    // 7. FINE-GRAINED RBAC ENFORCEMENT & DYNAMIC MATRIX UPDATES
    // -------------------------------------------------------------------------
    await assert('15. Invited staff with KITCHEN permissions can access /api/restaurants/:id/staff with VIEW_STAFF? No: 403', async () => {
      // Carlos Kitchen only has KITCHEN permissions, lacks VIEW_STAFF
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${invitedStaffToken}`);

      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (res.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') {
        throw new Error(`Expected INSUFFICIENT_PERMISSIONS, got ${res.body.errorCode}`);
      }
    });

    await assert('16. Direct staff with WAITER permissions lacks VIEW_STAFF -> /staff returns 403', async () => {
      const loginStaff = await request(app).post('/api/auth/login').send({
        email: directStaffEmail,
        password: 'Password123!',
      });
      directStaffToken = loginStaff.body.data.token;

      // Does NOT have VIEW_STAFF -> 403
      const staffRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${directStaffToken}`);
      if (staffRes.status !== 403) throw new Error(`Expected 403, got ${staffRes.status}`);
      if (staffRes.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') {
        throw new Error(`Expected INSUFFICIENT_PERMISSIONS, got ${staffRes.body.errorCode}`);
      }
    });

    await assert('17. Owner dynamically grants VIEW_STAFF to direct staff via PUT /permissions', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${restaurantA.id}/staff/${directStaffUser.id}/permissions`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          permissions: ['VIEW_ORDERS', 'VIEW_ORDER_DETAILS', 'CONFIRM_ORDER', 'VIEW_STAFF'],
          jobTemplate: 'SUPERVISOR',
        });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.data.permissions.includes('VIEW_STAFF')) {
        throw new Error('VIEW_STAFF was not returned in updated permissions');
      }

      // Subsequent request by staff immediately succeeds without re-login!
      const staffRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${directStaffToken}`);
      if (staffRes.status !== 200) throw new Error(`Expected 200 after permission grant, got ${staffRes.status}`);
    });

    await assert('18. Owner revokes VIEW_STAFF -> subsequent request immediately blocked (403)', async () => {
      await request(app)
        .put(`/api/restaurants/${restaurantA.id}/staff/${directStaffUser.id}/permissions`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          permissions: ['VIEW_ORDERS', 'VIEW_ORDER_DETAILS'],
        });

      const staffRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/staff`)
        .set('Authorization', `Bearer ${directStaffToken}`);
      if (staffRes.status !== 403) throw new Error(`Expected 403 after revocation, got ${staffRes.status}`);
      if (staffRes.body.errorCode !== 'INSUFFICIENT_PERMISSIONS') {
        throw new Error(`Expected INSUFFICIENT_PERMISSIONS, got ${staffRes.body.errorCode}`);
      }
    });

    await assert('19. Owner permissions cannot be restricted (CANNOT_RESTRICT_OWNER)', async () => {
      const res = await request(app)
        .put(`/api/restaurants/${restaurantA.id}/staff/${ownerAUser.id}/permissions`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ permissions: ['VIEW_DASHBOARD'] });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (res.body.errorCode !== 'CANNOT_RESTRICT_OWNER') {
        throw new Error(`Expected CANNOT_RESTRICT_OWNER, got ${res.body.errorCode}`);
      }
    });

    // -------------------------------------------------------------------------
    // 8. STAFF DISABLING / ENABLING & MULTI-TENANT ISOLATION
    // -------------------------------------------------------------------------
    await assert('20. Disabling staff immediately returns 403 STAFF_DISABLED on all requests', async () => {
      const disableRes = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/staff/${directStaffUser.id}/status`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ status: 'DISABLED' });

      if (disableRes.status !== 200) throw new Error(`Expected 200, got ${disableRes.status}`);

      // Requests by direct staff are now immediately blocked
      const testRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders`)
        .set('Authorization', `Bearer ${directStaffToken}`);

      if (testRes.status !== 403) throw new Error(`Expected 403, got ${testRes.status}`);
      if (testRes.body.errorCode !== 'STAFF_DISABLED') {
        throw new Error(`Expected STAFF_DISABLED, got ${testRes.body.errorCode}`);
      }
    });

    await assert('21. Enabling staff restores access immediately', async () => {
      const enableRes = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/staff/${directStaffUser.id}/status`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ status: 'ACTIVE' });

      if (enableRes.status !== 200) throw new Error(`Expected 200, got ${enableRes.status}`);

      const testRes = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders`)
        .set('Authorization', `Bearer ${directStaffToken}`);

      if (testRes.status !== 200) throw new Error(`Expected 200 after enabling, got ${testRes.status}`);
    });

    await assert('22. Multi-tenant isolation: Disabling user in Restaurant A does NOT affect Restaurant B', async () => {
      // Create user belonging to BOTH restaurant A and restaurant B
      const multiUser = await prisma.user.create({
        data: {
          email: multiTenantEmail,
          name: 'Multi Restaurant Worker',
          passwordHash: await bcrypt.hash('Password123!', 10),
          active: true,
          userRestaurants: {
            create: [
              { restaurantId: restaurantA.id, role: Role.STAFF, status: StaffStatus.ACTIVE },
              { restaurantId: restaurantB.id, role: Role.STAFF, status: StaffStatus.ACTIVE },
            ],
          },
        },
      });

      const multiLogin = await request(app).post('/api/auth/login').send({
        email: multiTenantEmail,
        password: 'Password123!',
      });
      const multiToken = multiLogin.body.data.token;

      // Disable user in Restaurant A only
      await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/staff/${multiUser.id}/status`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ status: 'DISABLED' });

      // Restaurant A request -> 403 STAFF_DISABLED
      const reqA = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/orders`)
        .set('Authorization', `Bearer ${multiToken}`);
      if (reqA.status !== 403 || reqA.body.errorCode !== 'STAFF_DISABLED') {
        throw new Error(`Expected 403 STAFF_DISABLED in Restaurant A, got ${reqA.status}`);
      }

      // Restaurant B request -> 200 OK (unaffected!)
      const reqB = await request(app)
        .get(`/api/restaurants/${restaurantB.id}/orders`)
        .set('Authorization', `Bearer ${multiToken}`);
      if (reqB.status !== 200) {
        throw new Error(`Expected 200 in Restaurant B, got ${reqB.status}`);
      }
    });

    await assert('23. Sole active Owner cannot be disabled (SOLE_OWNER_PROTECTION)', async () => {
      const res = await request(app)
        .patch(`/api/restaurants/${restaurantA.id}/staff/${ownerAUser.id}/status`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ status: 'DISABLED' });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (res.body.errorCode !== 'SOLE_OWNER_PROTECTION') {
        throw new Error(`Expected SOLE_OWNER_PROTECTION, got ${res.body.errorCode}`);
      }
    });

    // -------------------------------------------------------------------------
    // 9. STAFF REMOVAL & SOLE OWNER DELETION PROTECTION
    // -------------------------------------------------------------------------
    await assert('24. Removing staff removes UserRestaurant, preserves global User account', async () => {
      const res = await request(app)
        .delete(`/api/restaurants/${restaurantA.id}/staff/${directStaffUser.id}`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

      // Verify UserRestaurant deleted
      const ur = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: directStaffUser.id,
            restaurantId: restaurantA.id,
          },
        },
      });
      if (ur) throw new Error('UserRestaurant was not deleted');

      // Verify global User record still exists
      const globalUser = await prisma.user.findUnique({ where: { id: directStaffUser.id } });
      if (!globalUser) throw new Error('CRITICAL: Global User was deleted when removing staff membership!');
    });

    await assert('25. Sole Owner cannot be removed (SOLE_OWNER_REMOVAL)', async () => {
      const res = await request(app)
        .delete(`/api/restaurants/${restaurantA.id}/staff/${ownerAUser.id}`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (res.body.errorCode !== 'SOLE_OWNER_REMOVAL') {
        throw new Error(`Expected SOLE_OWNER_REMOVAL, got ${res.body.errorCode}`);
      }
    });

    // -------------------------------------------------------------------------
    // 10. AUDIT LOGGING VERIFICATION
    // -------------------------------------------------------------------------
    await assert('26. Audit logs recorded for staff actions', async () => {
      const auditActions = await prisma.auditLog.findMany({
        where: { restaurantId: restaurantA.id },
        select: { action: true },
      });

      const actions = new Set(auditActions.map((a) => a.action));
      const expectedActions = [
        AuditAction.STAFF_CREATE,
        AuditAction.STAFF_INVITATION_CREATE,
        AuditAction.STAFF_INVITATION_ACCEPT,
        AuditAction.STAFF_PERMISSION_GRANT,
        AuditAction.STAFF_DISABLE,
        AuditAction.STAFF_ENABLE,
        AuditAction.STAFF_REMOVE,
      ];

      for (const exp of expectedActions) {
        if (!actions.has(exp)) throw new Error(`Missing expected audit log action: ${exp}`);
      }
    });

    // -------------------------------------------------------------------------
    // 11. BACKWARD COMPATIBILITY VERIFICATION
    // -------------------------------------------------------------------------
    await assert('27. Legacy GET /api/restaurants/:id/users still returns members list', async () => {
      const res = await request(app)
        .get(`/api/restaurants/${restaurantA.id}/users`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.body.data)) throw new Error('Expected data array');
    });

    await assert('28. Auth /me includes populated permissions array for each restaurant assignment', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ownerAToken}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const r = res.body.data.restaurants.find((item: any) => item.id === restaurantA.id);
      if (!r) throw new Error('Restaurant A missing in /me');
      if (!Array.isArray(r.permissions) || r.permissions.length < 50) {
        throw new Error(`Owner expected to have all catalog permissions in /me, got ${r.permissions?.length}`);
      }
    });

  } finally {
    // Cleanup created test records
    try {
      if (restaurantA?.id) {
        await prisma.staffInvitation.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.auditLog.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.userRestaurantPermission.deleteMany({
          where: { userRestaurant: { restaurantId: restaurantA.id } },
        });
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurantA.id } });
        await prisma.restaurant.delete({ where: { id: restaurantA.id } });
      }
      if (restaurantB?.id) {
        await prisma.staffInvitation.deleteMany({ where: { restaurantId: restaurantB.id } });
        await prisma.auditLog.deleteMany({ where: { restaurantId: restaurantB.id } });
        await prisma.userRestaurantPermission.deleteMany({
          where: { userRestaurant: { restaurantId: restaurantB.id } },
        });
        await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurantB.id } });
        await prisma.restaurant.delete({ where: { id: restaurantB.id } });
      }
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [ownerAEmail, ownerBEmail, directStaffEmail, invitedStaffEmail, multiTenantEmail],
          },
        },
      });
    } catch (cleanupErr) {
      // Ignore cleanup error
    }
  }

  console.log(`\n========================================`);
  console.log(`Phase 11A Staff & RBAC Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStaffTests().catch((err) => {
  console.error('Unhandled test execution failure:', err);
  process.exit(1);
});
