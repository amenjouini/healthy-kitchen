import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { Card, DataTable, PageHeader, Badge } from '@/components/ui/Data';
import { Checkbox, Segmented, TextField } from '@/components/ui/Form';
import { Alert, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui/Feedback';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { P, PERMISSION_GROUPS } from '@shared/permissions';
import { formatDateTime, formatMoney } from '@/utils/format';
import { PERMISSION_LABELS, PERMISSION_GROUP_LABELS } from '@/components/domain/labels';

const PERIODS = { monthly: 'month', weekly: 'week', daily: 'day', hourly: 'hour' };

function StaffEditor({ member, roles, onClose, onSaved }) {
  const { t } = useDash();
  const { can, user } = useAuth();
  const toast = useToast();
  const isNew = !member;
  const canSalary = can(P.SALARIES_MANAGE);
  const [form, setForm] = useState({
    name: member?.name ?? '', email: member?.email ?? '', phone: member?.phone ?? '', password: '',
    roleId: member?.roleId ? String(member.roleId) : String(roles.find((r) => r.key === 'staff')?.id ?? ''),
    isActive: member?.isActive ?? true, jobTitle: member?.jobTitle ?? '', hireDate: member?.hireDate ?? '',
    salary: member?.salaryMillimes != null ? String(member.salaryMillimes / 1000) : '', salaryPeriod: member?.salaryPeriod ?? 'monthly',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const isSelf = member?.id === user.id;

  const save = async () => {
    setBusy(true); setError(null);
    const body = {
      name: form.name, email: form.email, phone: form.phone || null, roleId: Number(form.roleId), isActive: form.isActive,
      jobTitle: form.jobTitle || null, hireDate: form.hireDate || null,
      ...(form.password && { password: form.password }),
      ...(canSalary && { salary: form.salary ? form.salary.replace(',', '.') : null, salaryPeriod: form.salaryPeriod }),
    };
    if (isSelf) { delete body.roleId; delete body.isActive; }
    try {
      if (isNew) await api.post('/api/staff', body); else await api.patch(`/api/staff/${member.id}`, body);
      toast(t('Saved'));
      onSaved(); onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? t('Add team member') : member.name} size="lg"
      footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>{t(isNew ? 'Create account' : 'Save')}</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t('Full name')} required value={form.name} onChange={set('name')} />
        <TextField label={t('Email (login)')} type="email" required value={form.email} onChange={set('email')} />
        <TextField label={t('Phone')} type="tel" value={form.phone} onChange={set('phone')} />
        <TextField as="select" label={t('Role')} value={form.roleId} onChange={set('roleId')} disabled={isSelf} hint={isSelf ? t('You cannot change your own role') : undefined}>
          {roles.filter((r) => r.isStaff).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </TextField>
        <TextField label={isNew ? t('Temporary password (8+ characters)') : t('New password (leave empty to keep)')} type="password" autoComplete="new-password" required={isNew} value={form.password} onChange={set('password')} />
        <TextField label={t('Job title')} value={form.jobTitle} onChange={set('jobTitle')} />
        <TextField label={t('Hire date')} type="date" value={form.hireDate} onChange={set('hireDate')} />
        {canSalary && (
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <TextField label={t('Salary (DT)')} inputMode="decimal" value={form.salary} onChange={set('salary')} />
            <TextField as="select" label={t('per')} value={form.salaryPeriod} onChange={set('salaryPeriod')}>
              {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </TextField>
          </div>
        )}
      </div>
      {!isNew && !isSelf && <Checkbox checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} label={t('Account active')} description={t('Deactivating signs the person out everywhere immediately.')} />}
      {error && <Alert tone="danger" className="mt-3">{errorMessage(error, t)}</Alert>}
    </Modal>
  );
}

function RoleEditor({ role, onClose, onSaved }) {
  const { t } = useDash();
  const { can, user } = useAuth();
  const toast = useToast();
  const locked = role && (role.key === 'super_admin' || role.key === 'customer');
  const [form, setForm] = useState({ name: role?.name ?? '', description: role?.description ?? '', permissions: new Set(role?.permissions ?? []) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const editable = can(P.ROLES_MANAGE) && !locked;
  const toggle = (p) => setForm((f) => { const s = new Set(f.permissions); if (s.has(p)) s.delete(p); else s.add(p); return { ...f, permissions: s }; });
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = { name: form.name, description: form.description || null, permissions: [...form.permissions] };
      if (role) await api.patch(`/api/roles/${role.id}`, body); else await api.post('/api/roles', body);
      toast(t('Role saved')); onSaved(); onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const remove = async () => {
    try { await api.del(`/api/roles/${role.id}`); toast(t('Role deleted')); onSaved(); onClose(); } catch (err) { setError(err); }
  };
  return (
    <Modal open onClose={onClose} title={role ? role.name : t('New role')} size="lg"
      footer={editable && (
        <div className="flex justify-between gap-2">
          {role && !role.isSystem ? <Button variant="dangerOutline" onClick={remove}><Trash2 className="h-4 w-4" /> {t('Delete')}</Button> : <span />}
          <Button loading={busy} onClick={save} disabled={!form.name.trim()}>{t('Save role')}</Button>
        </div>
      )}>
      {locked && <Alert className="mb-3">{t('This role is managed by the system and cannot be edited.')}</Alert>}
      {role && user.roleKey !== 'super_admin' && <p className="mb-3 text-xs text-stone">{t('You can only grant permissions you hold yourself.')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t('Role name')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={!editable} />
        <TextField label={t('Description')} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={!editable} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.key} className="rounded-xl bg-linen/60 p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-stone">{t(PERMISSION_GROUP_LABELS[g.key])}</legend>
            {g.permissions.map((p) => <Checkbox key={p} checked={form.permissions.has(p)} onChange={() => toggle(p)} disabled={!editable} label={t(PERMISSION_LABELS[p])} />)}
          </fieldset>
        ))}
      </div>
      {error && <Alert tone="danger" className="mt-3">{errorMessage(error, t)}</Alert>}
    </Modal>
  );
}

export default function StaffPage() {
  const { t } = useDash();
  const { can } = useAuth();
  const [tab, setTab] = useState('team');
  const [editing, setEditing] = useState(null);
  const [roleEditing, setRoleEditing] = useState(null);
  const staff = useApi('/api/staff');
  const roles = useApi('/api/roles');
  useEffect(() => { document.title = `${t('Team')} · Healthy Kitchen`; }, [t]);
  const showSalary = staff.data?.items[0] && 'salaryMillimes' in staff.data.items[0];

  return (
    <div>
      <PageHeader title={t('Team')} subtitle={t('Accounts, roles and permissions. Permissions are enforced by the server.')}
        actions={tab === 'team' ? can(P.STAFF_MANAGE) && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('Add team member')}</Button>
          : can(P.ROLES_MANAGE) && <Button onClick={() => setRoleEditing('new')}><Plus className="h-4 w-4" /> {t('New role')}</Button>} />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'team', label: t('Team') }, { value: 'roles', label: t('Roles & permissions') }]} />
      {tab === 'team' ? (staff.error ? <ErrorState error={staff.error} onRetry={staff.reload} t={t} /> : staff.loading || roles.loading ? <Spinner /> : (
        <DataTable
          rows={staff.data.items}
          onRowClick={can(P.STAFF_MANAGE) ? (m) => setEditing(m) : undefined}
          empty={<EmptyState title={t('No team members yet')} />}
          columns={[
            { key: 'name', header: t('Name'), mobile: 'title', render: (m) => <span className={m.isActive ? 'font-semibold' : 'font-semibold text-stone line-through'}>{m.name}<span className="block text-xs font-normal text-stone no-underline">{m.email}</span></span> },
            { key: 'role', header: t('Role'), render: (m) => <Badge tone={m.roleKey === 'super_admin' ? 'dark' : 'neutral'}>{m.roleName}</Badge> },
            { key: 'job', header: t('Job'), render: (m) => m.jobTitle ?? '—' },
            ...(showSalary ? [{ key: 'salary', header: t('Salary'), className: 'tabular-nums', render: (m) => (m.salaryMillimes != null ? `${formatMoney(m.salaryMillimes)} / ${t(PERIODS[m.salaryPeriod])}` : '—') }] : []),
            { key: 'active', header: t('Status'), render: (m) => <Badge tone={m.isActive ? 'green' : 'red'}>{t(m.isActive ? 'Active' : 'Deactivated')}</Badge> },
            { key: 'login', header: t('Last login'), render: (m) => <span className="text-xs text-stone">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : t('Never')}</span> },
          ]}
        />
      )) : (roles.loading ? <Spinner /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roles.data.items.map((r) => (
            <Card key={r.id} as="button" type="button" onClick={() => setRoleEditing(r)} className="cursor-pointer p-4 text-start hover:bg-white">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-sage" /> {r.name} {r.isSystem && <Badge>{t('System')}</Badge>}</p>
              <p className="mt-1 text-sm text-muted">{r.description}</p>
              <p className="mt-2 text-xs text-stone">{t('{n} permissions', { n: r.permissions.length })} · {t('{n} people', { n: r.userCount })}</p>
            </Card>
          ))}
        </div>
      ))}
      {editing && <StaffEditor member={editing === 'new' ? null : editing} roles={roles.data?.items ?? []} onClose={() => setEditing(null)} onSaved={staff.reload} />}
      {roleEditing && <RoleEditor role={roleEditing === 'new' ? null : roleEditing} onClose={() => setRoleEditing(null)} onSaved={roles.reload} />}
    </div>
  );
}
