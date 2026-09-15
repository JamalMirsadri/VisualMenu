import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { platformAnalyticsService, type PlatformAnalyticsPeriod } from '../../services/platformAnalyticsService';
import { InsightCard, type InsightItem } from '../../components/admin/InsightCard';

function Section({ title, items }: { title: string; items: InsightItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-300">{title} <span className="text-zinc-500 font-normal">({items.length})</span></h3>
      <div className="space-y-3">{items.map((i, idx) => <InsightCard key={idx} insight={i} />)}</div>
    </section>
  );
}

export const PlatformAiInsightsPage: React.FC = () => {
  const [period, setPeriod] = useState<PlatformAnalyticsPeriod>('month');
  const [date, setDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [exporting, setExporting] = useState(false);

  const defaultDate = useMemo(() => {
    const now = new Date();
    return { day: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, year: String(now.getFullYear()) };
  }, []);

  useEffect(() => {
    if (period === 'day' || period === 'week') setDate(defaultDate.day);
    else if (period === 'month') setDate(defaultDate.month);
    else if (period === 'year') setDate(defaultDate.year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const query: any = { period };
      if (period === 'custom') { query.startDate = startDate || undefined; query.endDate = endDate || undefined; }
      else { query.date = date || undefined; }
      setData(await platformAnalyticsService.getInsights(query));
    } catch (err: any) {
      setError(err.message || 'Failed to load insights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period, date, startDate, endDate]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const query: any = { period };
      if (period === 'custom') { query.startDate = startDate || undefined; query.endDate = endDate || undefined; }
      else { query.date = date || undefined; }
      await platformAnalyticsService.exportInsights(query, format);
    } catch (err: any) {
      setError(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white flex items-center gap-3"><Sparkles className="w-8 h-8 text-amber-500" />Platform AI Insights</h1>
          <p className="text-zinc-400 text-sm mt-1">Cross-restaurant trends and recommendations derived from aggregated real data.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFormat(format === 'csv' ? 'xlsx' : 'csv')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700">
            {format === 'csv' ? <FileText className="w-3.5 h-3.5" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}{format === 'csv' ? 'CSV' : 'Excel'}
          </button>
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold disabled:opacity-50">
            {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Export
          </button>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {(['day', 'week', 'month', 'year', 'custom'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${period === p ? 'bg-amber-500 text-neutral-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{p}</button>
          ))}
        </div>
        {period === 'custom' ? (
          <>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-300" />
            <span className="text-zinc-500">→</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-300" />
          </>
        ) : period === 'year' ? (
          <input type="number" min="2000" max="2100" value={date} onChange={(e) => setDate(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-300 w-24" />
        ) : period === 'month' ? (
          <input type="month" value={date} onChange={(e) => setDate(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-300" />
        ) : (
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-300" />
        )}
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}

      {loading && !data ? (
        <div className="p-16 text-center text-zinc-500"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" /><p className="text-sm">Generating platform insights...</p></div>
      ) : data ? (
        <div className="space-y-8">
          <Section title="Key Insights" items={data.insights} />
          <Section title="Opportunities" items={data.recommendations} />
          <Section title="Anomalies" items={data.anomalies} />
          {(data.insufficientData || []).length > 0 && (
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-500">{data.insufficientData.map((m: string, i: number) => <p key={i}>• {m}</p>)}</div>
          )}
        </div>
      ) : null}
    </div>
  );
};
