import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Download,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { analyticsService, type AnalyticsPeriod } from '../../services/analyticsService';

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] text-zinc-500">—</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(value)}%
    </span>
  );
}

function MetricCard({ label, value, previous, money }: { label: string; value: number | string; previous?: number; money?: boolean }) {
  return (
    <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="text-2xl font-mono font-bold text-white">
          {money ? `€${Number(value).toFixed(2)}` : value}
        </div>
        {previous !== undefined && <Delta value={pctChange(Number(value), previous)} />}
      </div>
    </div>
  );
}

function BarChart({ data, xKey, yKey, color = 'bg-amber-400/80' }: { data: any[]; xKey: string; yKey: string; color?: string }) {
  const max = Math.max(...data.map((d) => Number(d[yKey]) || 0), 1);
  return (
    <div className="flex items-end gap-1 h-36">
      {data.map((d, i) => (
        <div key={i} className="group relative flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-zinc-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
            {d[xKey]}: {Number(d[yKey]).toFixed(2)}
          </div>
          <div
            className={`w-full rounded-t ${color} hover:bg-amber-400 transition-all`}
            style={{ height: `${Math.max((Number(d[yKey]) / max) * 100, 2)}%` }}
          />
          <div className="text-[9px] text-zinc-500 mt-1 truncate w-full text-center">{d[xKey]}</div>
        </div>
      ))}
    </div>
  );
}

function RankTable({ title, rows, columns }: { title: string; rows: any[]; columns: { key: string; label: string; right?: boolean }[] }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 text-sm font-semibold text-white">{title}</div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-zinc-500">Insufficient data for this period.</div>
      ) : (
        <table className="w-full text-left text-xs text-zinc-300">
          <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[10px]">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`p-3 ${c.right ? 'text-right' : ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-zinc-800/30">
                {columns.map((c) => (
                  <td key={c.key} className={`p-3 ${c.right ? 'text-right font-mono' : ''}`}>{r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export const AdminAnalyticsPage: React.FC = () => {
  const { activeRestaurant, hasFeature } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');
  const [date, setDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [report, setReport] = useState<'summary' | 'products' | 'categories' | 'payments' | 'combinations'>('summary');
  const [exporting, setExporting] = useState(false);

  const canExport = hasFeature('ANALYTICS_EXPORT');

  const defaultDate = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return { day: `${y}-${m}-${d}`, month: `${y}-${m}`, year: String(y) };
  }, []);

  useEffect(() => {
    if (period === 'day' || period === 'week') setDate(defaultDate.day);
    else if (period === 'month') setDate(defaultDate.month);
    else if (period === 'year') setDate(defaultDate.year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchData = async () => {
    if (!activeRestaurant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const query: any = { period };
      if (period === 'custom') {
        query.startDate = startDate || undefined;
        query.endDate = endDate || undefined;
      } else {
        query.date = date || undefined;
      }
      const res = await analyticsService.getAnalytics(activeRestaurant.id, query);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurant?.id, period, date, startDate, endDate]);

  const handleExport = async () => {
    if (!activeRestaurant?.id) return;
    setExporting(true);
    setError(null);
    try {
      const query: any = { period };
      if (period === 'custom') {
        query.startDate = startDate || undefined;
        query.endDate = endDate || undefined;
      } else {
        query.date = date || undefined;
      }
      await analyticsService.exportAnalytics(activeRestaurant.id, query, { format, report });
    } catch (err: any) {
      setError(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;
  const prev = s?.previous;

  const productRows = (list: any[]) =>
    (list || []).map((p) => ({ Product: p.name, Category: p.category, Quantity: p.quantity, Revenue: `€${p.revenue.toFixed(2)}` }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-400" />
            Analytics & Reports
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Revenue, product, customer, and combination insights for {activeRestaurant?.name}.</p>
        </div>

        {canExport && (
          <div className="flex items-center gap-2">
            <select value={report} onChange={(e) => setReport(e.target.value as any)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-300">
              <option value="summary">Summary</option>
              <option value="products">Products</option>
              <option value="categories">Categories</option>
              <option value="payments">Payments</option>
              <option value="combinations">Combinations</option>
            </select>
            <button onClick={() => setFormat(format === 'csv' ? 'xlsx' : 'csv')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700">
              {format === 'csv' ? <FileText className="w-3.5 h-3.5" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              {format === 'csv' ? 'CSV' : 'Excel'}
            </button>
            <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold disabled:opacity-50">
              {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {(['day', 'week', 'month', 'year', 'custom'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${period === p ? 'bg-amber-500 text-neutral-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
              {p}
            </button>
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

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="p-16 text-center text-zinc-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <p className="text-sm">Loading analytics...</p>
        </div>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Revenue" value={s.revenue} previous={prev.revenue} money />
            <MetricCard label="Net Revenue" value={s.netRevenue} money />
            <MetricCard label="Orders" value={s.orders} previous={prev.orders} />
            <MetricCard label="Avg Order Value" value={s.averageOrderValue} previous={prev.averageOrderValue} money />
            <MetricCard label="Items Sold" value={s.itemsSold} previous={prev.itemsSold} />
            <MetricCard label="Avg Items / Order" value={s.averageItemsPerOrder} />
            <MetricCard label="New Customers" value={s.newCustomers} />
            <MetricCard label="Returning Customers" value={s.returningCustomers} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
              <h3 className="text-sm font-semibold text-white mb-3">Sales by Hour</h3>
              <BarChart data={data.salesByHour} xKey="hour" yKey="revenue" />
            </div>
            <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
              <h3 className="text-sm font-semibold text-white mb-3">Sales by Weekday</h3>
              <BarChart data={data.salesByWeekday.map((d: any) => ({ ...d, weekday: d.weekday.slice(0, 3) }))} xKey="weekday" yKey="revenue" color="bg-emerald-400/80" />
            </div>
          </div>

          {/* Ranking tables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RankTable title="Top Foods" rows={productRows(data.topFoods)} columns={[{ key: 'Product', label: 'Product' }, { key: 'Quantity', label: 'Qty', right: true }, { key: 'Revenue', label: 'Revenue', right: true }]} />
            <RankTable title="Top Drinks" rows={productRows(data.topDrinks)} columns={[{ key: 'Product', label: 'Product' }, { key: 'Quantity', label: 'Qty', right: true }, { key: 'Revenue', label: 'Revenue', right: true }]} />
            <RankTable title="Top Desserts" rows={productRows(data.topDesserts)} columns={[{ key: 'Product', label: 'Product' }, { key: 'Quantity', label: 'Qty', right: true }, { key: 'Revenue', label: 'Revenue', right: true }]} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankTable title="Category Performance" rows={data.categoryPerformance.map((c: any) => ({ Category: c.name, Qty: c.quantity, Revenue: `€${c.revenue.toFixed(2)}`, Share: `${c.revenueShare}%` }))} columns={[{ key: 'Category', label: 'Category' }, { key: 'Qty', label: 'Qty', right: true }, { key: 'Revenue', label: 'Revenue', right: true }, { key: 'Share', label: 'Share', right: true }]} />
            <RankTable title="Payment Method Breakdown" rows={data.paymentBreakdown.map((p: any) => ({ Method: p.method, Count: p.count, Amount: `€${p.amount.toFixed(2)}`, Share: `${p.share}%` }))} columns={[{ key: 'Method', label: 'Method' }, { key: 'Count', label: 'Count', right: true }, { key: 'Amount', label: 'Amount', right: true }, { key: 'Share', label: 'Share', right: true }]} />
          </div>

          {/* Combinations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankTable title="Popular Food + Drink Combos" rows={data.combinations.foodDrink.map((c: any) => ({ Combo: c.combination.join(' + '), Count: c.count }))} columns={[{ key: 'Combo', label: 'Combination' }, { key: 'Count', label: 'Count', right: true }]} />
            <RankTable title="Suggested Bundles (Food + Drink + Dessert)" rows={data.combinations.foodDrinkDessert.map((c: any) => ({ Bundle: c.combination.join(' + '), Count: c.count }))} columns={[{ key: 'Bundle', label: 'Bundle' }, { key: 'Count', label: 'Count', right: true }]} />
          </div>

          {/* Product insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankTable title="Product Growth / Decline" rows={data.productInsights.growthDecline.map((g: any) => ({ Product: g.name, Current: g.currentQuantity, Previous: g.previousQuantity, Change: `${g.changePct > 0 ? '+' : ''}${g.changePct}%` }))} columns={[{ key: 'Product', label: 'Product' }, { key: 'Current', label: 'Current', right: true }, { key: 'Previous', label: 'Prev', right: true }, { key: 'Change', label: 'Change', right: true }]} />
            <RankTable title="Cross-Sell Opportunities" rows={data.productInsights.crossSellUpsell.map((c: any) => ({ Pair: c.items.join(' + '), Count: c.count }))} columns={[{ key: 'Pair', label: 'Item Pair' }, { key: 'Count', label: 'Count', right: true }]} />
          </div>
        </>
      ) : null}
    </div>
  );
};
