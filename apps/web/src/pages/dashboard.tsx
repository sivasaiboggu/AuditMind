import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { Navbar } from '../components/Navbar';
import { supabase } from '../lib/supabase';
import { Upload, AlertTriangle, Clock, FileCheck, CheckCircle2, ChevronRight, BarChart3, TrendingUp, Trash2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import type { Contract } from '@auditmind/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function Dashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { contracts, setContracts, setActiveContract } = useContractStore();

  const fetchContracts = async () => {
    try {
      const response = await fetch(`${API_URL}/contracts`);
      if (response.ok) {
        const data = await response.json();
        setContracts(data);
      }
    } catch (err) {
      console.error('Failed to fetch contracts:', err);
    }
  };

  // Real-time Supabase Table Subscription
  useEffect(() => {
    fetchContracts();

    if (!supabase) return;

    // Listen to INSERT, UPDATE, or DELETE events in contracts table
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contracts'
        },
        (payload) => {
          console.log('// Real-time DB Event Received:', payload);
          fetchContracts(); // Refetch database items instantly
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  const getRiskColor = (score: number) => {
    if (score >= 75) return 'text-risk-critical border-risk-critical/20 bg-risk-critical/5';
    if (score >= 50) return 'text-risk-high border-risk-high/20 bg-risk-high/5';
    if (score >= 25) return 'text-risk-medium border-risk-medium/20 bg-risk-medium/5';
    return 'text-risk-low border-risk-low/20 bg-risk-low/5';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-risk-low/30 text-risk-low bg-risk-low/5">VERIFIED</span>;
      case 'processing':
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-accent-cyan/30 text-accent-cyan bg-accent-cyan/5 animate-pulse">ANALYZING</span>;
      case 'failed':
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-risk-critical/30 text-risk-critical bg-risk-critical/5">FAILED</span>;
      default:
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/15 text-text-muted">QUEUED</span>;
    }
  };

  const handleSelectContract = (contract: Contract) => {
    setActiveContract(contract);
    navigate(`/contract/${contract.id}`);
  };

  const handleDeleteContract = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this contract?')) return;
    
    try {
      const response = await fetch(`${API_URL}/contracts/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setContracts(contracts.filter(c => c.id !== id));
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(errData.error || 'Failed to delete contract.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while deleting contract.');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background-base flex flex-col">
      <Navbar currentView="dashboard" setView={(v) => navigate(v === 'dashboard' ? '/dashboard' : '/upload')} onLogout={handleLogout} />
      
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 space-y-8 w-full">
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

        {/* Upload Action Card & Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Link
              to="/upload"
              className="h-full min-h-[200px] rounded border border-dashed border-white/10 hover:border-accent-cyan bg-background-panel/30 hover:bg-accent-cyan/5 flex flex-col items-center justify-center p-6 text-center precise-transition group cursor-pointer"
            >
              <div className="w-12 h-12 rounded bg-white/5 border border-white/10 text-text-secondary group-hover:text-accent-cyan group-hover:border-accent-cyan/40 flex items-center justify-center precise-transition shadow-lg mb-3">
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
            <div className="glass-panel p-5 rounded border border-white/5 flex flex-col justify-between">
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
            </div>

            <div className="glass-panel p-5 rounded border border-white/5 flex flex-col justify-between">
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
            </div>

            <div className="glass-panel p-5 rounded border border-white/5 flex flex-col justify-between">
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
            </div>

            <div className="glass-panel p-5 rounded border border-white/5 flex flex-col justify-between">
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
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-panel p-6 rounded border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-accent-cyan" />
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-text-primary">
                Risk Score Trend
              </h2>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#64748B" fontSize={10} fontFamily="JetBrains Mono" tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={10} fontFamily="JetBrains Mono" tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0F121D', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px' }}
                    labelClassName="font-mono text-xs text-text-secondary"
                    itemStyle={{ fontFamily: 'JetBrains Mono', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="avgRisk" stroke="#00E5FF" strokeWidth={1.5} fillOpacity={1} fill="url(#colorRisk)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel p-6 rounded border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-accent-cyan" />
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-text-primary">
                Risk Level Distribution
              </h2>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#64748B" fontSize={10} fontFamily="JetBrains Mono" tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={10} fontFamily="JetBrains Mono" tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0F121D', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Contract List */}
        <div className="glass-panel rounded border border-white/5 overflow-hidden">
          <div className="border-b border-white/5 px-6 py-4 flex justify-between items-center bg-white/2">
            <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-text-primary">
              Contracts
            </h2>
            <span className="font-mono text-xs text-text-secondary">
              [{contracts.length} loaded]
            </span>
          </div>

          {contracts.length === 0 ? (
            <div className="p-12 text-center text-text-muted font-mono text-sm">
              No contracts found. Upload a file to start analysis.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {contracts.map((contract) => (
                <div
                  key={contract.id}
                  onClick={() => contract.status === 'completed' && handleSelectContract(contract)}
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 gap-4 precise-transition ${
                    contract.status === 'completed'
                      ? 'cursor-pointer hover:bg-white/2'
                      : 'cursor-not-allowed opacity-75'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-text-primary text-sm tracking-wide">
                        {contract.name}
                      </span>
                      {getStatusBadge(contract.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono text-text-secondary">
                      <span>ID: {contract.id.substring(0, 8)}...</span>
                      <span>•</span>
                      <span>Uploaded: {new Date(contract.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 self-end sm:self-auto">
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
                    
                    <button
                      onClick={(e) => handleDeleteContract(e, contract.id)}
                      className="p-1.5 rounded hover:bg-risk-critical/10 text-text-muted hover:text-risk-critical precise-transition"
                      title="Delete Contract"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {contract.status === 'completed' && (
                      <ChevronRight className="w-5 h-5 text-text-muted hover:text-accent-cyan precise-transition" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
