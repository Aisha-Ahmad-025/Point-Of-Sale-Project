import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../services/api';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce, useFetch } from '../hooks/useFetch';
import { Badge, Card, EmptyState, ErrorState, Ltr, PageHeader, Pagination, Table, TableSkeleton, THead, SearchInput } from '../components/ui';

const GROUPS = ['sale', 'product', 'category', 'inventory', 'employee', 'settings'];
const tone = (a) => (a.includes('void') || a.includes('deactivate') || a.includes('delete') || a.includes('wastage') ? 'danger' : a.includes('price') || a.includes('adjust') || a.includes('role') ? 'warn' : 'neutral');

export default function Audit() {
  const { t } = useTranslation();
  const f = useFormat();
  const [q, setQ] = useState(''); const [action, setAction] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const dq = useDebounce(q, 300);
  useEffect(() => { setPage(1); }, [dq, action, from, to]);
  const list = useFetch(() => api.get('/audit-logs', { q: dq, action, from, to, page, limit: 25 }), [dq, action, from, to, page]);
  return (
    <>
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
      <Card>
        <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput className="" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('audit.search')} aria-label={t('audit.search')} />
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)} aria-label={t('audit.action')}><option value="">{t('audit.allActions')}</option>{GROUPS.map((g) => <option key={g} value={g}>{t(`auditGroup.${g}`)}</option>)}</select>
          <input className="input" dir="ltr" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('common.from')} />
          <input className="input" dir="ltr" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('common.to')} />
        </div>
        {list.loading && !list.data ? <TableSkeleton cols={5} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState art="search" title={t('audit.empty')} /> : (
          <Table><THead cols={[t('movements.date'), t('audit.actor'), t('audit.action'), t('audit.summary'), '']} /><tbody>
            {list.data.map((l) => (
              <Fragment key={l._id}>
                <tr className="border-b border-line">
                  <td className="td whitespace-nowrap text-muted">{f.dateTime(l.createdAt)}</td>
                  <td className="td">{l.actorName || '—'}{l.actorRole && <span className="ms-1 text-xs text-muted">({t(`roles.${l.actorRole}`, { defaultValue: l.actorRole })})</span>}</td>
                  <td className="td"><Badge tone={tone(l.action)}><Ltr>{l.action}</Ltr></Badge></td>
                  <td className="td max-w-md truncate" title={l.summary}>{l.summary}</td>
                  <td className="td text-end">{(l.before || l.after) && <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === l._id ? null : l._id)} aria-expanded={open === l._id}>{t('audit.details')}{open === l._id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>}</td>
                </tr>
                {open === l._id && (
                  <tr className="border-b border-line bg-raised/40"><td colSpan={5} className="grid gap-3 p-3 md:grid-cols-2" dir="ltr">
                    {['before', 'after'].map((k) => <div key={k}><p className="mb-1 text-xs font-bold uppercase text-muted">{t(`audit.${k}`)}</p><pre className="max-h-56 overflow-auto rounded-lg bg-surface p-2 text-xs">{l[k] ? JSON.stringify(l[k], null, 2) : '—'}</pre></div>)}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody></Table>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
    </>
  );
}
