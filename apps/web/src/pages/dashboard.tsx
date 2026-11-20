import { jobStatusNotice } from '../lib/job-status';
import { workspaceGuard } from '../lib/workspace-guard';
import { authenticatedFetch } from '../lib/api';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme';
import { useToast } from '../hooks/useToast';
import { Navbar } from '../components/Navbar';
import { ToastViewport } from '../components/ToastViewport';
import { Badge, Button, Card, CardTitle, EmptyState, Skeleton, Spinner } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Upload, AlertTriangle, Clock, FileCheck, CheckCircle2, ChevronRight, BarChart3, TrendingUp, Trash2, Search, X, RefreshCw, FileText } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import type { Contract } from '@auditmind/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type StatusFilter = 'all' | 'completed' | 'processing' | 'failed' | 'queued';
type RiskFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type SortBy = 'date-desc' | 'date-asc' | 'risk-desc' | 'risk-asc' | 'name-asc';

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
};

/** Risk bucket matching the distribution chart thresholds. */
function riskBucket(score: number): Exclude<RiskFilter, 'all'> {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

const selectClassName =
  'rounded border border-overlay/10 bg-background-panel px-3 py-2.5 text-xs font-mono text-text-secondary outline-none focus:border-accent-cyan/50 precise-transition';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const { contracts, setContracts, setActiveContract } = useContractStore();
  const [notification, setNotification] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const [refreshVersion, setRefreshVersion] = useState(0);

  // First-load state: distinguishes "no contracts yet" from "still fetching".
  const [hasLoaded, setHasLoaded] = useState(false);

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
          setHasLoaded(true);
        }
      } catch {
        if (current() && read === listRead.current) {
          setNotification('Contract list could not be refreshed. Try again.');
          setHasLoaded(true);
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
        if (payload.eventType === 'INSERT') setNotification(`New contract analysis scheduled: ${doc.name}`);
        else if (payload.eventType === 'UPDATE' && doc.status === 'completed') setNotification(`Analysis complete! ${doc.name} is ready.`);
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
  const criticalRiskContracts = contracts.filter(c => c.overallRiskScore >= 70);
  const avgRiskScore = completedContracts.length > 0
    ? Math.round(completedContracts.reduce((acc, c) => acc + c.overallRiskScore, 0) / completedContracts.length)
    : 0;

  // Group contracts by month based on database dates
  const trendData = (() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push({
        monthName: months[d.getMonth()],
        year: d.getFullYear(),
        monthIndex: d.getMonth(),
        sum: 0,
        count: 0
      });
    }

    contracts.forEach((c) => {
      if (c.status !== 'completed' || !c.createdAt) return;
      const date = new Date(c.createdAt);
      const mIdx = date.getMonth();
      const y = date.getFullYear();

      const bucket = last6Months.find(b => b.monthIndex === mIdx && b.year === y);
      if (bucket) {
        bucket.sum += c.overallRiskScore || 0;
        bucket.count += 1;
      }
    });

    return last6Months.map(b => ({
      name: b.monthName,
      avgRisk: b.count > 0 ? Math.round(b.sum / b.count) : 0
    }));
  })();

  const distributionData = [
    { name: 'Critical', count: contracts.filter(c => c.overallRiskScore >= 75).length, color: '#EF4444' },
    { name: 'High', count: contracts.filter(c => c.overallRiskScore >= 50 && c.overallRiskScore < 75).length, color: '#F97316' },
    { name: 'Medium', count: contracts.filter(c => c.overallRiskScore >= 25 && c.overallRiskScore < 50).length, color: '#EAB308' },
    { name: 'Low', count: contracts.filter(c => c.overallRiskScore < 25 && c.status === 'completed').length, color: '#10B981' },
  ];

  // Chart colours adapt to the active theme (cyan line is unreadable on white).
  const chartLine = theme === 'dark' ? '#00E5FF' : '#4B4BA0';
  const tooltipBg = theme === 'dark' ? '#0F121D' : '#FFFFFF';
  const tooltipBorder = theme === 'dark'
    ? '1px solid rgba(255,255,255,0.08)'
    : '1px solid rgba(15,23,42,0.12)';

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
      if (riskFilter !== 'all' && riskBucket(c.overallRiskScore) !== riskFilter) return false;
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

  const getRiskColor = (score: number) => {
    if (score >= 75) return 'text-risk-critical border-risk-critical/20 bg-risk-critical/5';
    if (score >= 50) return 'text-risk-high border-risk-high/20 bg-risk-high/5';
    if (score >= 25) return 'text-risk-medium border-risk-medium/20 bg-risk-medium/5';
    return 'text-risk-low border-risk-low/20 bg-risk-low/5';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge tone="success">Analyzed</Badge>;
      case 'processing':
        return <Badge tone="info" className="animate-pulse">Analyzing</Badge>;
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

  return (
    <div className="min-h-screen bg-background-base flex flex-col">
      <Navbar currentView="dashboard" setView={(v) => navigate(v === 'dashboard' ? '/dashboard' : useContractStore.getState().activeContract ? `/contract/${useContractStore.getState().activeContract!.id}` : '/upload')} onLogout={handleLogout} />

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 w-full">
        {/* Real-time Notifications */}
        {notification && (
          <div className="bg-accent-cyan/10 border border-accent-cyan/20 p-3.5 rounded text-xs font-mono text-accent-cyan flex items-center justify-between shadow-[0_0_15px_rgba(0,229,255,0.05)] animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-cyan animate-ping"></span>
              <span>{notification}</span>
            </div>
            <button onClick={() => setNotification(null)} aria-label="Dismiss notification" className="text-[10px] hover:text-text-primary uppercase tracking-wider font-bold">Dismiss</button>
          </div>
        )}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-sans font-semibold tracking-tight text-text-primary">
              Dashboard
            </h1>
            <p className="text-text-secondary text-sm font-sans mt-1">
              Overview of contract compliance analysis.
            </p>
          </div>
        </div>

        {!hasLoaded ? (
          <>
            {/* Loading skeletons */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" aria-busy="true" aria-label="Loading dashboard">
              <Skeleton className="h-[200px] w-full" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-[92px] w-full" />
                <Skeleton className="h-[92px] w-full" />
                <Skeleton className="h-[92px] w-full" />
                <Skeleton className="h-[92px] w-full" />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-[248px] w-full" />
              <Skeleton className="h-[248px] w-full" />
            </div>
            <Card className="overflow-hidden">
              <div className="border-b border-overlay/5 px-6 py-4">
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="space-y-0">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4 border-b border-overlay/5 p-6 last:border-b-0">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                ))}
              </div>
            </Card>
          </>
        ) : (
          <>
            {/* Upload Action Card & Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Link
                  to="/upload"
                  className="h-full min-h-[200px] rounded border border-dashed border-overlay/10 hover:border-accent-cyan bg-background-panel/30 hover:bg-accent-cyan/5 flex flex-col items-center justify-center p-6 text-center precise-transition group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded bg-overlay/5 border border-overlay/10 text-text-secondary group-hover:text-accent-cyan group-hover:border-accent-cyan/40 flex items-center justify-center precise-transition shadow-lg mb-3">
                    <Upload className="w-5 h-5 group-hover:scale-110 precise-transition" />
                  </div>
                  <p className="font-sans text-sm font-medium text-text-primary group-hover:text-accent-cyan precise-transition">
                    Upload new contract
                  </p>
                  <p className="text-xs text-text-secondary font-sans mt-1">
                    Select a PDF or DOCX file to analyze.
                  </p>
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card className="p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-text-muted">
                    <FileCheck className="w-4 h-4 text-accent-cyan" />
                    <span className="text-[10px] font-sans uppercase tracking-wider">Total</span>
                  </div>
                  <div className="mt-4">
                    <div className="text-3xl font-sans font-bold text-text-primary">
                      {contracts.length}
                    </div>
                    <p className="text-[10px] font-sans text-text-secondary mt-1 uppercase">Total Contracts</p>
                  </div>
                </Card>

                <Card className="p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-text-muted">
                    <AlertTriangle className="w-4 h-4 text-risk-high" />
                    <span className="text-[10px] font-sans uppercase tracking-wider">High Risk</span>
                  </div>
                  <div className="mt-4">
                    <div className="text-3xl font-sans font-bold text-risk-critical">
                      {criticalRiskContracts.length}
                    </div>
                    <p className="text-[10px] font-sans text-text-secondary mt-1 uppercase">High Risk</p>
                  </div>
                </Card>

                <Card className="p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-text-muted">
                    <Clock className="w-4 h-4 text-risk-medium" />
                    <span className="text-[10px] font-sans uppercase tracking-wider">Processing</span>
                  </div>
                  <div className="mt-4">
                    <div className="text-3xl font-sans font-bold text-text-primary">
                      {contracts.filter(c => c.status === 'processing').length}
                    </div>
                    <p className="text-[10px] font-sans text-text-secondary mt-1 uppercase">Analyzing</p>
                  </div>
                </Card>

                <Card className="p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-text-muted">
                    <CheckCircle2 className="w-4 h-4 text-risk-low" />
                    <span className="text-[10px] font-sans uppercase tracking-wider">Average Risk</span>
                  </div>
                  <div className="mt-4">
                    <div className="text-3xl font-sans font-bold text-text-primary">
                      {avgRiskScore}%
                    </div>
                    <p className="text-[10px] font-sans text-text-secondary mt-1 uppercase">Average Score</p>
                  </div>
                </Card>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-accent-cyan" />
                  <CardTitle>
                    Risk Score Trend
                  </CardTitle>
                </div>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartLine} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={chartLine} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#64748B" fontSize={10} fontFamily="JetBrains Mono" tickLine={false} />
                      <YAxis stroke="#64748B" fontSize={10} fontFamily="JetBrains Mono" tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: tooltipBg, border: tooltipBorder, borderRadius: '4px' }}
                        labelClassName="font-mono text-xs text-text-secondary"
                        itemStyle={{ fontFamily: 'JetBrains Mono', fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="avgRisk" stroke={chartLine} strokeWidth={1.5} fillOpacity={1} fill="url(#colorRisk)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-accent-cyan" />
                  <CardTitle>
                    Risk Level Distribution
                  </CardTitle>
                </div>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" stroke="#64748B" fontSize={10} fontFamily="JetBrains Mono" tickLine={false} />
                      <YAxis stroke="#64748B" fontSize={10} fontFamily="JetBrains Mono" tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: tooltipBg, border: tooltipBorder, borderRadius: '4px' }}
                        cursor={{ fill: 'rgba(128,128,128,0.06)' }}
                      />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {distributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Contract List */}
            <Card className="overflow-hidden">
              <div className="border-b border-overlay/5 px-4 sm:px-6 py-4 flex flex-wrap justify-between items-center gap-3 bg-overlay/2">
                <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-text-primary">
                  Contracts
                </h2>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-secondary">
                    [{filteredContracts.length}{filtersActive ? ` of ${contracts.length}` : ''} loaded]
                  </span>
                  <Button variant="outline" size="sm" onClick={handleRefresh} aria-label="Refresh contracts">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Search / filter / sort toolbar */}
              <div className="border-b border-overlay/5 px-4 sm:px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search contracts by name…"
                    aria-label="Search contracts by name"
                    className="w-full rounded border border-overlay/10 bg-background-panel py-2.5 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted/60 outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 precise-transition"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-primary"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    aria-label="Filter by status"
                    className={selectClassName}
                  >
                    <option value="all">All statuses</option>
                    <option value="completed">Analyzed</option>
                    <option value="processing">Analyzing</option>
                    <option value="failed">Failed</option>
                    <option value="queued">Queued</option>
                  </select>
                  <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
                    aria-label="Filter by risk level"
                    className={selectClassName}
                  >
                    <option value="all">All risk levels</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    aria-label="Sort contracts"
                    className={selectClassName}
                  >
                    <option value="date-desc">Newest first</option>
                    <option value="date-asc">Oldest first</option>
                    <option value="risk-desc">Highest risk</option>
                    <option value="risk-asc">Lowest risk</option>
                    <option value="name-asc">Name A–Z</option>
                  </select>
                  {filtersActive && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>

              {contracts.length === 0 ? (
                <EmptyState
                  icon={<FileText className="w-5 h-5" />}
                  title="No contracts yet"
                  description="Upload a contract file to start your first AI risk analysis."
                  action={
                    <Link to="/upload">
                      <Button size="sm">
                        <Upload className="w-3.5 h-3.5" />
                        Upload contract
                      </Button>
                    </Link>
                  }
                />
              ) : filteredContracts.length === 0 ? (
                <EmptyState
                  icon={<Search className="w-5 h-5" />}
                  title="No contracts match your filters"
                  description="Try a different search term or clear the active filters."
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <motion.div
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                  className="divide-y divide-overlay/5"
                >
                  {filteredContracts.map((contract) => (
                    <motion.div
                      key={contract.id}
                      variants={rowVariants}
                      onClick={() => {
                        if (confirmingDeleteId) return;
                        if (contract.status === 'completed') handleSelectContract(contract);
                      }}
                      onKeyDown={(e) => {
                        if (confirmingDeleteId) return;
                        if ((e.key === 'Enter' || e.key === ' ') && contract.status === 'completed') {
                          e.preventDefault();
                          handleSelectContract(contract);
                        }
                      }}
                      role={contract.status === 'completed' ? 'button' : undefined}
                      tabIndex={contract.status === 'completed' ? 0 : undefined}
                      aria-label={contract.status === 'completed' ? `Open ${contract.name}` : undefined}
                      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 gap-4 precise-transition ${
                        contract.status === 'completed'
                          ? 'cursor-pointer hover:bg-overlay/2'
                          : 'cursor-not-allowed opacity-75'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-text-primary text-sm tracking-wide break-all">
                            {contract.name}
                          </span>
                          {getStatusBadge(contract.status)}
                        </div>
                        {jobStatusNotice(contract) && <p role="status" className="text-xs text-risk-medium max-w-xl leading-relaxed break-words">{jobStatusNotice(contract)}</p>}
                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-text-secondary">
                          <span>ID: {contract.id.substring(0, 8)}...</span>
                          <span>•</span>
                          <span>Uploaded: {new Date(contract.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 sm:gap-6 self-end sm:self-auto">
                        {contract.status === 'completed' && (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-[10px] font-mono text-text-muted block uppercase">Risk Score</span>
                              <span className="text-sm font-mono font-bold text-text-primary">
                                {contract.overallRiskScore}%
                              </span>
                            </div>
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold ${getRiskColor(contract.overallRiskScore)}`}>
                              {contract.overallRiskScore}
                            </div>
                          </div>
                        )}

                        {confirmingDeleteId === contract.id ? (
                          <div className="flex items-center gap-2" role="group" aria-label={`Confirm deletion of ${contract.name}`}>
                            <span className="text-xs font-mono text-risk-critical">Delete?</span>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={deletingId === contract.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteContract(contract.id);
                              }}
                            >
                              {deletingId === contract.id ? <Spinner className="h-3 w-3" label="Deleting contract" /> : 'Confirm'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingDeleteId(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingDeleteId(contract.id);
                            }}
                            aria-label={`Delete ${contract.name}`}
                            title="Delete contract"
                            className="p-1.5 rounded hover:bg-risk-critical/10 text-text-muted hover:text-risk-critical precise-transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {contract.status === 'completed' && (
                          <ChevronRight className="w-5 h-5 text-text-muted hover:text-accent-cyan precise-transition" />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </Card>
          </>
        )}
      </main>
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
