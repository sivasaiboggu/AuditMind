import { jobStatusNotice } from '../lib/job-status';
import { buildTrendData, countByRiskBucket, countHighRiskCompleted, matchesRiskFilter, riskBucket } from '../lib/dashboard';
import { workspaceGuard } from '../lib/workspace-guard';
import { authenticatedFetch } from '../lib/api';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../hooks/useToast';
import { Navbar } from '../components/Navbar';
import { ToastViewport } from '../components/ToastViewport';
import { Badge, Button, EmptyState, Skeleton, Spinner } from '../components/ui';
import { supabase } from '../lib/supabase';
import { ArrowUpRight, Plus, Trash2, Search, X, RefreshCw, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Contract } from '@auditmind/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type StatusFilter = 'all' | 'completed' | 'processing' | 'failed' | 'queued';
type RiskFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type SortBy = 'date-desc' | 'date-asc' | 'risk-desc' | 'risk-asc' | 'name-asc';

const statuses = [['all', 'All statuses'], ['completed', 'Analyzed'], ['processing', 'Analyzing'], ['failed', 'Failed'], ['queued', 'Queued']] as const;
const riskLevels = ['Critical', 'High', 'Medium', 'Low'] as const;
const sortOptions = [['date-desc', 'Newest first'], ['date-asc', 'Oldest first'], ['risk-desc', 'Highest risk'], ['risk-asc', 'Lowest risk'], ['name-asc', 'Name A–Z']] as const;
const riskColors = { critical: 'text-risk-critical', high: 'text-risk-high', medium: 'text-risk-medium', low: 'text-risk-low' } as const;
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { contracts, setContracts, setActiveContract } = useContractStore();
  const [notification, setNotification] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const [refreshVersion, setRefreshVersion] = useState(0);

  // First-load state: distinguishes "no contracts yet" from "still fetching".
  const [loadStatus, setHasLoaded] = useState<'loading' | 'ready' | 'error'>('loading');
  const hasLoaded = loadStatus !== 'loading';

  // Client-side list controls.
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date-desc');

  // Inline delete confirmation (replaces window.confirm()).
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const listRead = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    let disposed = false;
    mounted.current = true;
    const ownerCurrent = workspaceGuard();
    const current = () => !disposed && ownerCurrent();
    setNotification(null);
    const fetchContracts = async () => {
      const read = ++listRead.current;
      try {
        const response = await authenticatedFetch(`${API_URL}/contracts`);
        if (!current() || read !== listRead.current) return;
        if (!response.ok) throw new Error('Contract list unavailable.');
        const data = await response.json();
        if (current() && read === listRead.current) {
          setContracts(data);
          setHasLoaded('ready');
        }
      } catch {
        if (current() && read === listRead.current) {
          setHasLoaded('error');
        }
      }
    };
    void fetchContracts();
    const channel = supabase?.channel(`contracts-${user?.id || 'demo'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts',
        ...(user?.id ? { filter: `user_id=eq.${user.id}` } : {}) }, payload => {
        if (!current()) return;
        void fetchContracts();
        const doc = payload.new as any;
        if (doc?.user_id !== user?.id) return;
        if (payload.eventType === 'INSERT') setNotification(`Queued for analysis: ${doc.name}`);
        else if (payload.eventType === 'UPDATE' && doc.status === 'completed') setNotification(`${doc.name} is ready to review.`);
        else if (payload.eventType === 'UPDATE' && doc.status === 'failed') setNotification(`Analysis failed for ${doc.name}. Check the contract status.`);
      }).subscribe();
    return () => {
      disposed = true;
      mounted.current = false;
      ++listRead.current;
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [user?.id, setContracts, refreshVersion]);

  // Compute stats based on active database entries
  const completedContracts = contracts.filter(c => c.status === 'completed');
  // Same buckets as the distribution chart and the risk filter: high risk
  // is high or critical (>= 50), counted among completed analyses only —
  // the card captions this "of N analysed", so a processing or failed
  // contract must never count even if it ever carries a score.
  const highRiskContracts = countHighRiskCompleted(contracts);
  // Average risk over completed contracts only; a processing contract
  // still carries its placeholder score of 0, and a non-finite score
  // from a stale row must not turn the average into NaN.
  const avgRiskScore = completedContracts.length > 0
    ? Math.round(completedContracts.reduce((acc, c) => acc + (Number.isFinite(c.overallRiskScore) ? c.overallRiskScore : 0), 0) / completedContracts.length)
    : 0;

  // Average risk over completed contracts only; a processing contract
  // still carries its placeholder score of 0.
  const trendData = useMemo(() => buildTrendData(contracts), [contracts]);

  const riskCounts = useMemo(() => countByRiskBucket(contracts), [contracts]);
  // Client-side search / filter / sort (kept below the stats block so the
  // workspace-client test harness can evaluate the fetch effect in isolation).
  const filteredContracts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = contracts.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'queued') {
          if (['completed', 'processing', 'failed'].includes(c.status)) return false;
        } else if (c.status !== statusFilter) {
          return false;
        }
      }
      if (riskFilter !== 'all' && !matchesRiskFilter(c, riskFilter)) return false;
      return true;
    });
    const byDate = (a: Contract, b: Contract) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    switch (sortBy) {
      case 'date-asc': return [...filtered].sort(byDate);
      case 'risk-desc': return [...filtered].sort((a, b) => b.overallRiskScore - a.overallRiskScore);
      case 'risk-asc': return [...filtered].sort((a, b) => a.overallRiskScore - b.overallRiskScore);
      case 'name-asc': return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
      case 'date-desc':
      default: return [...filtered].sort((a, b) => byDate(b, a));
    }
  }, [contracts, query, statusFilter, riskFilter, sortBy]);

  const filtersActive = query.trim() !== '' || statusFilter !== 'all' || riskFilter !== 'all' || sortBy !== 'date-desc';

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setRiskFilter('all');
    setSortBy('date-desc');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge tone="success">Analyzed</Badge>;
      case 'processing':
        return <Badge tone="info">Analyzing</Badge>;
      case 'failed':
        return <Badge tone="danger">Failed</Badge>;
      default:
        return <Badge tone="neutral">Queued</Badge>;
    }
  };

  const handleSelectContract = (contract: Contract) => {
    setActiveContract(contract);
    navigate(`/contract/${contract.id}`);
  };

  const handleDeleteContract = async (id: string) => {
    const ownerCurrent = workspaceGuard();
    const current = () => mounted.current && ownerCurrent();
    setDeletingId(id);
    ++listRead.current;
    try {
      const response = await authenticatedFetch(`${API_URL}/contracts/${id}`, {
        method: 'DELETE'
      });
      if (!current()) return;
      ++listRead.current;
      if (response.ok) {
        setContracts(useContractStore.getState().contracts.filter(c => c.id !== id));
        addToast('Contract deleted.', 'success');
      } else {
        const errData = await response.json().catch(() => ({}));
        if (!current()) return;
        addToast(`Delete failed: ${errData.error || 'Could not delete contract.'}`, 'error');
      }
    } catch {
      if (!current()) return;
      console.error('Contract deletion could not be confirmed.');
      addToast('Delete failed: network connection failure.', 'error');
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  };

  const handleRefresh = () => {
    setRefreshVersion(value => value + 1);
    addToast('Refreshing contracts…', 'info');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const demo = !supabase;

  return (
    <div className="min-h-screen">
      <Navbar onLogout={handleLogout} />
      <main id="main-content" tabIndex={-1} className="frame wide-frame page-stack">
        <header className="workspace-title">
          <div>
            <p className="eyebrow mb-3">Review desk</p>
            <h1 className="page-title">Contracts</h1>
            <p className="lede mt-3">Check the status of an upload or open a contract to review its clauses.</p>
          </div>
          <Link to="/upload" className="action action-primary"><Plus size={18} aria-hidden="true" /> Upload contract</Link>
        </header>

        {notification && !demo && (
          <div className="margin-note flex flex-wrap items-center justify-between gap-2 px-4">
            <p role="status" className="reading text-text-secondary">{notification}</p>
            <Button variant="ghost" onClick={() => setNotification(null)}>Dismiss</Button>
          </div>
        )}

        {loadStatus === 'error' && contracts.length > 0 && (
          <p className="margin-note reading text-text-secondary" role="alert">Could not refresh the contract list. The previous results are still shown.</p>
        )}

        {hasLoaded && contracts.length > 0 && (
          <dl className="ledger-metrics" aria-label="Workspace totals">
            <div className="metric-lead"><dt>Contracts</dt><dd>{contracts.length}</dd><dd className="metric-meta">{completedContracts.length} analyzed</dd></div>
            <div><dt>High or critical</dt><dd>{highRiskContracts}</dd><dd className="metric-meta">Of {completedContracts.length} analyzed</dd></div>
            <div><dt>In analysis</dt><dd>{contracts.filter((c) => c.status === 'processing').length}</dd><dd className="metric-meta">Currently processing</dd></div>
            <div><dt>Average score</dt><dd>{completedContracts.length ? avgRiskScore : '—'}</dd><dd className="metric-meta">Out of 100</dd></div>
          </dl>
        )}

        <div className="ledger-layout">
          <section className="sheet ledger" aria-labelledby="register-title">
            <div className="ledger-header">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="register-title" className="text-xl font-semibold tracking-tight">Contract register</h2>
                {hasLoaded && !demo && <p className="eyebrow" role="status">{filteredContracts.length}{filtersActive ? ` of ${contracts.length}` : ''} contracts</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={handleRefresh} aria-label="Refresh contracts"><RefreshCw size={16} aria-hidden="true" /> Refresh</Button>
            </div>

            {hasLoaded && contracts.length > 0 && (
              <div className="ledger-filters">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} aria-hidden="true" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search contracts by name" aria-label="Search contracts by name" className="field pl-9" />
                </div>
                <div className="filter-controls">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="Filter by status" className="field">
                    {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as RiskFilter)} aria-label="Filter by risk level" className="field">
                    <option value="all">All risk levels</option>
                    {riskLevels.map((level) => <option key={level} value={level.toLowerCase()}>{level}</option>)}
                  </select>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} aria-label="Sort contracts" className="field">
                    {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}><X size={14} aria-hidden="true" /> Clear</Button>}
                </div>
              </div>
            )}

            {!hasLoaded ? (
              <div className="space-y-4 p-6" aria-busy="true" role="status">
                <p className="text-text-secondary">Loading contracts…</p>
                {[0, 1, 2].map((index) => <Skeleton key={index} className="h-8 w-full" />)}
              </div>
            ) : demo ? (
              <EmptyState icon={<FileText size={20} />} title="You’re in the local demo"
                description="This installation has no sign-in provider. Connect one to upload a contract and keep its review."
              />
            ) : contracts.length === 0 ? (
              loadStatus === 'error' ? (
                <EmptyState title="Contracts are unavailable" description="Refresh the list to try again."
                  action={<Button variant="outline" onClick={handleRefresh}>Try again</Button>} />
              ) : (
                <EmptyState icon={<FileText size={20} />} title="No contracts yet"
                  description="Choose your first agreement to get a clause-by-clause review."
                  action={<Link to="/upload" className="action action-primary"><Plus size={18} aria-hidden="true" /> Upload contract</Link>} />
              )
            ) : filteredContracts.length === 0 ? (
              <EmptyState icon={<Search size={20} />} title="No matching contracts"
                description="Change the search or clear the filters."
                action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>} />
            ) : (
              <ul className="ledger-rows" aria-label="Contracts">
                {filteredContracts.map((contract) => {
                  const completed = contract.status === 'completed';
                  const deleting = confirmingDeleteId === contract.id;
                  const notice = jobStatusNotice(contract);
                  const risk = riskBucket(contract.overallRiskScore);
                  return (
                    <li className="ledger-row" key={contract.id}>
                      <div className="min-w-0">
                        {completed ? (
                          <Link to={`/contract/${contract.id}`} className="ledger-name group" onClick={(event) => {
                            if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                              event.preventDefault();
                              handleSelectContract(contract);
                            }
                          }}>
                            {contract.name}<ArrowUpRight className="shrink-0 text-text-muted group-hover:text-accent-brand" size={16} aria-hidden="true" />
                          </Link>
                        ) : <p className="ledger-name">{contract.name}</p>}
                        <p className="mt-1 break-words text-sm text-text-muted" title={contract.id}>
                          <time dateTime={contract.createdAt}>{Number.isFinite(Date.parse(contract.createdAt)) ? dateFormat.format(new Date(contract.createdAt)) : 'Date unavailable'}</time>
                          <span className="ml-2 font-mono text-xs">{contract.id.slice(0, 8)}</span>
                        </p>
                        {notice && <p className="mt-2 text-sm text-risk-medium">{notice}</p>}
                      </div>
                      <div className="ledger-status">
                        {getStatusBadge(contract.status)}
                        {completed && <span className={`tnum text-sm font-semibold capitalize ${riskColors[risk]}`}>{contract.overallRiskScore} / 100 · {risk}</span>}
                      </div>
                      {deleting ? (
                        <div className="ledger-delete flex flex-wrap items-center gap-2" role="group" aria-label={`Confirm deletion of ${contract.name}`}>
                          <span className="text-sm text-risk-critical">Delete this contract?</span>
                          <Button size="sm" variant="danger" disabled={deletingId === contract.id} onClick={() => void handleDeleteContract(contract.id)}>
                            {deletingId === contract.id ? <Spinner className="h-4 w-4" label="Deleting contract" /> : 'Delete'}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={deletingId === contract.id} onClick={() => setConfirmingDeleteId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <button type="button" className="icon-control hover:text-risk-critical" aria-label={`Delete ${contract.name}`}
                          onClick={() => setConfirmingDeleteId(contract.id)}><Trash2 size={17} aria-hidden="true" /></button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {hasLoaded && contracts.length > 0 && (
            <aside className="ledger-aside" aria-label="Risk overview">
              <section aria-labelledby="distribution-title">
                <h2 id="distribution-title" className="text-xl font-semibold tracking-tight">Risk distribution</h2>
                <p className="mt-1 text-sm text-text-muted">Completed reviews by risk level.</p>
                <dl className="mt-4 grid gap-3">
                  {riskLevels.map((label) => {
                    const key = label.toLowerCase() as Exclude<RiskFilter, 'all'>;
                    const count = riskCounts[key];
                    return (
                      <div className="distribution-row" key={label}>
                        <dt className="text-sm font-medium">{label}</dt>
                        <dd className="risk-bar" aria-hidden="true"><span style={{ width: `${100 * count / Math.max(completedContracts.length, 1)}%`, background: `var(--risk-${key})` }} /></dd>
                        <dd className="font-mono text-xs tnum">{count}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
              <section className="border-t border-rule pt-6" aria-labelledby="trend-title">
                <h2 id="trend-title" className="text-xl font-semibold tracking-tight">Risk over time</h2>
                <p className="mt-1 text-sm text-text-muted">Average score by upload month.</p>
                {trendData.some((point) => point.avgRisk !== null) ? (
                  <>
                    <div className="mt-4 h-32 w-full" aria-hidden="true">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ left: -28, right: 8, top: 8 }}>
                          <CartesianGrid stroke="var(--rule)" vertical={false} />
                          <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="var(--text-muted)" ticks={[0, 50, 100]} domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip formatter={(value) => [value, 'Average score']} contentStyle={{ background: 'var(--bg-panel)', borderColor: 'var(--rule)' }}
                            labelStyle={{ color: 'var(--text-primary)' }} itemStyle={{ color: 'var(--text-secondary)' }} />
                          <Line dataKey="avgRisk" stroke="var(--accent)" strokeWidth={2} isAnimationActive={false} connectNulls={false} dot={{ r: 3, fill: 'var(--accent)' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <details className="mt-2 text-sm text-text-secondary">
                      <summary className="min-h-8 cursor-pointer">Monthly scores</summary>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {trendData.map(({ name, avgRisk }) => <div className="contents" key={name}><dt>{name}</dt><dd>{avgRisk === null ? 'No reviews' : `${avgRisk} / 100`}</dd></div>)}
                      </dl>
                    </details>
                  </>
                ) : <p className="mt-4 text-sm text-text-secondary">No completed reviews in the past six months.</p>}
              </section>
            </aside>
          )}
        </div>
      </main>
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
