import { useEffect, useState } from 'react';
import { useDash } from '@/components/dashboard/DashboardContext';
import { DataTable, PageHeader, Pagination } from '@/components/ui/Data';
import { Select, Input } from '@/components/ui/Form';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { useApi } from '@/hooks/useApi';
import { qs } from '@/lib/api';
import { formatDateTime } from '@/utils/format';

const ENTITIES = ['order', 'meal', 'ingredient', 'expense', 'salary_payment', 'user', 'role', 'settings', 'delivery_zone', 'customer', 'whatsapp_conversation'];

function Changes({ old: before, new: after }) {
  if (!before && !after) return <span className="text-stone">—</span>;
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].slice(0, 6);
  const show = (v) => (v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60));
  return (
    <ul className="text-xs">
      {keys.map((k) => (
        <li key={k} className="truncate"><span className="text-stone">{k}:</span> {before && k in before && <><s className="text-clay">{show(before[k])}</s> → </>}<span className="text-moss">{show(after?.[k])}</span></li>
      ))}
    </ul>
  );
}

export default function AuditPage() {
  const { t } = useDash();
  const [f, setF] = useState({ entityType: '', action: '', page: 1 });
  const { data, loading, error, reload } = useApi(`/api/audit${qs({ ...f, pageSize: 50 })}`);
  useEffect(() => { document.title = `${t('Audit log')} · Healthy Kitchen`; }, [t]);
  return (
    <div>
      <PageHeader title={t('Audit log')} subtitle={t('Who changed what, and when. Entries cannot be edited.')} />
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Select value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value, page: 1 })} aria-label={t('Type')}>
          <option value="">{t('Everything')}</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
        <Input placeholder={t('Action starts with… (e.g. payment, inventory)')} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, page: 1 })} />
      </div>
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <>
          <DataTable rows={data.items} empty={<EmptyState title={t('No entries')} />}
            columns={[
              { key: 'action', header: t('Action'), mobile: 'title', render: (a) => <span className="font-mono text-xs font-semibold">{a.action}</span> },
              { key: 'entity', header: t('Record'), render: (a) => <span className="text-xs">{a.entityType} #{a.entityId ?? '—'}</span> },
              { key: 'changes', header: t('Change'), className: 'max-w-sm', render: (a) => <Changes old={a.old} new={a.new} /> },
              { key: 'by', header: t('By'), render: (a) => a.userName ?? t('System / customer') },
              { key: 'at', header: t('When'), render: (a) => <span className="text-xs text-stone">{formatDateTime(a.createdAt)}</span> },
            ]} />
          <Pagination page={f.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setF((x) => ({ ...x, page }))} t={t} />
        </>
      )}
    </div>
  );
}
