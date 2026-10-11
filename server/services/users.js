/**
 * Users, sessions, staff profiles and roles.
 *
 * Escalation rules (enforced here, not just in the UI):
 *  • only super admins can assign the super_admin role or edit a super admin;
 *  • nobody can grant a role/permission set they do not hold themselves;
 *  • nobody can change their own role or deactivate themselves;
 *  • system roles' permission sets are fixed for super_admin.
 */
import crypto from 'node:crypto';
import { nowIso } from '../db/database.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../http/errors.js';
import { ALL_PERMISSIONS, SYSTEM_ROLES, P } from '../../shared/permissions.js';
import { hashPassword, verifyPassword, passwordProblem } from '../auth/passwords.js';
import { audit, diff } from './audit.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ─── Roles ───────────────────────────────────────────────────────────────────

export function seedSystemRoles(db) {
  db.tx(() => {
    for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
      let role = db.get('SELECT * FROM roles WHERE key = ?', key);
      if (!role) {
        const { lastInsertRowid } = db.run(
          'INSERT INTO roles (key, name, description, is_system, is_staff) VALUES (?, ?, ?, 1, ?)', key, def.name, def.description, def.isStaff,
        );
        for (const p of def.permissions) db.run('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)', lastInsertRowid, p);
        role = { id: lastInsertRowid };
      }
      if (key === 'super_admin') {
        // Super admin always holds every permission, including ones added in later releases.
        for (const p of ALL_PERMISSIONS) db.run('INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)', role.id, p);
      }
    }
  });
}

export function rolePermissions(db, roleId) {
  return db.all('SELECT permission FROM role_permissions WHERE role_id = ?', roleId).map((r) => r.permission);
}

export function listRoles(db) {
  return db.all(`SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count FROM roles r ORDER BY r.is_staff DESC, r.id`).map((r) => ({
    id: r.id, key: r.key, name: r.name, description: r.description, isSystem: Boolean(r.is_system), isStaff: Boolean(r.is_staff),
    userCount: r.user_count, permissions: rolePermissions(db, r.id),
  }));
}

function assertCanGrant(actorPerms, actorRoleKey, permissions) {
  if (actorRoleKey === 'super_admin') return;
  const missing = permissions.filter((p) => !actorPerms.includes(p));
  if (missing.length) throw forbidden(`You cannot grant permissions you do not have: ${missing.join(', ')}`);
}

export function saveRole(db, actor, actorCtx, id, { name, description, permissions }) {
  return db.tx(() => {
    const unknown = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (unknown.length) throw badRequest('unknown_permission', `Unknown permission(s): ${unknown.join(', ')}`);
    assertCanGrant(actorCtx.permissions, actorCtx.roleKey, permissions);
    let roleId = id;
    let before = null;
    if (id) {
      const role = db.get('SELECT * FROM roles WHERE id = ?', id);
      if (!role) throw notFound('Role');
      if (role.key === 'super_admin' || role.key === 'customer') throw forbidden('This role cannot be modified');
      if (actorCtx.roleId === role.id) throw forbidden('You cannot change your own role');
      before = { name: role.name, permissions: rolePermissions(db, id) };
      db.run('UPDATE roles SET name = ?, description = ? WHERE id = ?', name, description ?? null, id);
      db.run('DELETE FROM role_permissions WHERE role_id = ?', id);
    } else {
      const key = `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}_${Date.now().toString(36)}`;
      roleId = db.run('INSERT INTO roles (key, name, description, is_system, is_staff) VALUES (?, ?, ?, 0, 1)', key, name, description ?? null).lastInsertRowid;
    }
    for (const p of new Set(permissions)) db.run('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)', roleId, p);
    audit(db, actor, id ? 'role.update' : 'role.create', 'role', roleId, before ?? undefined, { name, permissions });
    return listRoles(db).find((r) => r.id === roleId);
  });
}

export function deleteRole(db, actor, id) {
  return db.tx(() => {
    const role = db.get('SELECT * FROM roles WHERE id = ?', id);
    if (!role) throw notFound('Role');
    if (role.is_system) throw forbidden('System roles cannot be deleted');
    if (db.get('SELECT 1 FROM users WHERE role_id = ?', id)) throw conflict('role_in_use', 'Reassign the users of this role first');
    db.run('DELETE FROM roles WHERE id = ?', id);
    audit(db, actor, 'role.delete', 'role', id, { name: role.name }, undefined);
  });
}

// ─── Authentication ──────────────────────────────────────────────────────────

export async function authenticate(db, email, password) {
  const user = db.get('SELECT * FROM users WHERE email = ?', email);
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = await verifyPassword(password, user?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !ok) throw unauthorized('Incorrect email or password');
  if (!user.is_active) throw forbidden('This account is deactivated');
  db.run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
  return user;
}

export function createSession(db, userId, { days, ip, userAgent }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + days * 86400_000).toISOString();
  db.run('INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)', sha256(token), userId, expires, ip ?? null, (userAgent ?? '').slice(0, 200));
  db.run('DELETE FROM sessions WHERE expires_at < ?', nowIso());
  return { token, expires };
}

export function destroySession(db, token) {
  if (token) db.run('DELETE FROM sessions WHERE id = ?', sha256(token));
}

/** Resolve the session cookie → { user, permissions, roleKey } or null. */
export function loadSession(db, token) {
  if (!token) return null;
  const row = db.get(
    `SELECT u.*, r.key AS role_key, r.name AS role_name, r.is_staff FROM sessions s
     JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
     WHERE s.id = ? AND s.expires_at > ? AND u.is_active = 1`, sha256(token), nowIso(),
  );
  if (!row) return null;
  return { user: row, permissions: rolePermissions(db, row.role_id), roleKey: row.role_key };
}

export function publicUser(user, permissions, db) {
  const customer = db ? db.get('SELECT * FROM customers WHERE user_id = ?', user.id) : null;
  return {
    id: user.id, email: user.email, name: user.name, phone: user.phone, roleKey: user.role_key, roleName: user.role_name,
    isStaff: Boolean(user.is_staff), permissions,
    customer: customer ? { id: customer.id, phone: customer.phone, city: customer.city, address: customer.address } : null,
  };
}

export async function signupCustomer(db, { name, email, password, phone }) {
  const problem = passwordProblem(password);
  if (problem) throw badRequest('weak_password', problem);
  if (db.get('SELECT 1 FROM users WHERE email = ?', email)) throw conflict('email_taken', 'An account already exists for this email');
  const hash = await hashPassword(password);
  return db.tx(() => {
    const role = db.get(`SELECT id FROM roles WHERE key = 'customer'`);
    const { lastInsertRowid: userId } = db.run(
      'INSERT INTO users (email, name, phone, password_hash, role_id) VALUES (?, ?, ?, ?, ?)', email, name, phone ?? null, hash, role.id,
    );
    // Link to an existing customer record (e.g. a previous WhatsApp/guest customer) by phone.
    const existing = phone ? db.get('SELECT * FROM customers WHERE phone = ? AND user_id IS NULL', phone) : null;
    if (existing) db.run('UPDATE customers SET user_id = ?, email = COALESCE(email, ?), updated_at = ? WHERE id = ?', userId, email, nowIso(), existing.id);
    else db.run('INSERT INTO customers (name, phone, email, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', name, phone ?? null, email, userId, nowIso(), nowIso());
    audit(db, { userId }, 'user.signup', 'user', userId);
    return userId;
  });
}

export async function changePassword(db, userId, currentPassword, newPassword) {
  const user = db.get('SELECT * FROM users WHERE id = ?', userId);
  if (!(await verifyPassword(currentPassword, user.password_hash))) throw badRequest('wrong_password', 'Current password is incorrect');
  const problem = passwordProblem(newPassword);
  if (problem) throw badRequest('weak_password', problem);
  db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(newPassword), nowIso(), userId);
  audit(db, { userId }, 'user.password_change', 'user', userId);
}

// ─── Staff management ────────────────────────────────────────────────────────

export function listStaff(db, { includeSalary = false, search, includeInactive = true } = {}) {
  const where = ['r.is_staff = 1'];
  const params = [];
  if (!includeInactive) where.push('u.is_active = 1');
  if (search) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  return db.all(
    `SELECT u.*, r.key AS role_key, r.name AS role_name, sp.job_title, sp.hire_date, sp.salary_millimes, sp.salary_period, sp.notes AS staff_notes
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE ${where.join(' AND ')} ORDER BY u.is_active DESC, u.name`, ...params,
  ).map((u) => ({
    id: u.id, email: u.email, name: u.name, phone: u.phone, roleId: u.role_id, roleKey: u.role_key, roleName: u.role_name,
    isActive: Boolean(u.is_active), lastLoginAt: u.last_login_at, createdAt: u.created_at, jobTitle: u.job_title, hireDate: u.hire_date,
    ...(includeSalary && { salaryMillimes: u.salary_millimes, salaryPeriod: u.salary_period, staffNotes: u.staff_notes }),
  }));
}

function assertCanManageUser(db, actorCtx, target, newRoleId) {
  if (target && target.id === actorCtx.userId && newRoleId && newRoleId !== target.role_id) throw forbidden('You cannot change your own role');
  const targetRole = target ? db.get('SELECT * FROM roles WHERE id = ?', target.role_id) : null;
  if (targetRole?.key === 'super_admin' && actorCtx.roleKey !== 'super_admin') throw forbidden('Only a super admin can modify a super admin');
  if (newRoleId) {
    const role = db.get('SELECT * FROM roles WHERE id = ?', newRoleId);
    if (!role || !role.is_staff) throw badRequest('invalid_role', 'Choose a staff role');
    if (role.key === 'super_admin' && actorCtx.roleKey !== 'super_admin') throw forbidden('Only a super admin can create super admins');
    assertCanGrant(actorCtx.permissions, actorCtx.roleKey, rolePermissions(db, role.id));
  }
}

function saveProfile(db, userId, data, canSalary) {
  const existing = db.get('SELECT * FROM staff_profiles WHERE user_id = ?', userId);
  const merged = {
    job_title: data.jobTitle !== undefined ? data.jobTitle : existing?.job_title ?? null,
    hire_date: data.hireDate !== undefined ? data.hireDate : existing?.hire_date ?? null,
    salary_millimes: canSalary && data.salaryMillimes !== undefined ? data.salaryMillimes : existing?.salary_millimes ?? null,
    salary_period: canSalary && data.salaryPeriod ? data.salaryPeriod : existing?.salary_period ?? 'monthly',
    notes: data.staffNotes !== undefined ? data.staffNotes : existing?.notes ?? null,
  };
  db.run(
    `INSERT INTO staff_profiles (user_id, job_title, hire_date, salary_millimes, salary_period, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET job_title = excluded.job_title, hire_date = excluded.hire_date, salary_millimes = excluded.salary_millimes,
       salary_period = excluded.salary_period, notes = excluded.notes, updated_at = excluded.updated_at`,
    userId, merged.job_title, merged.hire_date, merged.salary_millimes, merged.salary_period, merged.notes, nowIso(),
  );
  return { before: existing, after: merged };
}

export async function createStaff(db, actor, actorCtx, data) {
  const problem = passwordProblem(data.password);
  if (problem) throw badRequest('weak_password', problem);
  const hash = await hashPassword(data.password);
  return db.tx(() => {
    assertCanManageUser(db, actorCtx, null, data.roleId);
    if (db.get('SELECT 1 FROM users WHERE email = ?', data.email)) throw conflict('email_taken', 'An account already exists for this email');
    const { lastInsertRowid: id } = db.run(
      'INSERT INTO users (email, name, phone, password_hash, role_id) VALUES (?, ?, ?, ?, ?)', data.email, data.name, data.phone ?? null, hash, data.roleId,
    );
    const canSalary = actorCtx.permissions.includes(P.SALARIES_MANAGE);
    saveProfile(db, id, data, canSalary);
    audit(db, actor, 'staff.create', 'user', id, undefined, { email: data.email, name: data.name, roleId: data.roleId });
    return listStaff(db, { includeSalary: canSalary }).find((u) => u.id === id);
  });
}

export async function updateStaff(db, actor, actorCtx, id, data) {
  const hash = data.password ? await hashPassword(data.password) : null;
  if (data.password) { const problem = passwordProblem(data.password); if (problem) throw badRequest('weak_password', problem); }
  return db.tx(() => {
    const target = db.get('SELECT u.* FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND r.is_staff = 1', id);
    if (!target) throw notFound('Staff member');
    assertCanManageUser(db, actorCtx, target, data.roleId);
    if (data.isActive === false && id === actorCtx.userId) throw forbidden('You cannot deactivate yourself');
    const canSalary = actorCtx.permissions.includes(P.SALARIES_MANAGE);
    const before = listStaff(db, { includeSalary: true }).find((u) => u.id === id);
    db.run(
      'UPDATE users SET name = ?, phone = ?, email = ?, role_id = ?, is_active = ?, password_hash = COALESCE(?, password_hash), updated_at = ? WHERE id = ?',
      data.name ?? target.name, data.phone !== undefined ? data.phone : target.phone, data.email ?? target.email,
      data.roleId ?? target.role_id, data.isActive ?? target.is_active, hash, nowIso(), id,
    );
    if (data.isActive === false || hash || (data.roleId && data.roleId !== target.role_id)) {
      db.run('DELETE FROM sessions WHERE user_id = ?', id); // force re-login with new rights
    }
    saveProfile(db, id, data, canSalary);
    const after = listStaff(db, { includeSalary: true }).find((u) => u.id === id);
    const changes = diff(before, after, ['name', 'email', 'phone', 'roleId', 'isActive', 'jobTitle', 'salaryMillimes', 'salaryPeriod']);
    if (changes) {
      audit(db, actor, 'staff.update', 'user', id, changes.old, changes.new);
      if ('roleId' in changes.new) audit(db, actor, 'staff.role_change', 'user', id, { roleId: before.roleId }, { roleId: after.roleId });
      if ('salaryMillimes' in changes.new) audit(db, actor, 'staff.salary_change', 'user', id, { salaryMillimes: before.salaryMillimes }, { salaryMillimes: after.salaryMillimes });
    }
    if (hash) audit(db, actor, 'staff.password_reset', 'user', id);
    return listStaff(db, { includeSalary: canSalary }).find((u) => u.id === id);
  });
}

/** Bootstrap/CLI helper: create or update a user with a given role key. */
export async function upsertUserWithRole(db, { email, name, password, roleKey }) {
  const role = db.get('SELECT id FROM roles WHERE key = ?', roleKey);
  if (!role) throw new Error(`Unknown role ${roleKey}`);
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const hash = await hashPassword(password);
  const existing = db.get('SELECT id FROM users WHERE email = ?', email);
  if (existing) {
    db.run('UPDATE users SET name = ?, password_hash = ?, role_id = ?, is_active = 1, updated_at = ? WHERE id = ?', name, hash, role.id, nowIso(), existing.id);
    return existing.id;
  }
  return db.run('INSERT INTO users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)', email, name, hash, role.id).lastInsertRowid;
}
