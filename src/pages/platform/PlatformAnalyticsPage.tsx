import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, AlertCircle, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { platformAnalyticsService, type PlatformAnalyticsPeriod } from '../../services/platformAnalyticsService';
import { platformService } from '../../services/platformService';

function MetricCard({ label, value, delta }: { label: string; value: string | number; delta?: number | null }) {
  return (
    <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1.5 text-xl font-mono font-bold text-white">{value}</div>
      {delta !== undefined && delta !== null && (
        <div className={`text-[10px] font-semibold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta >= 0 ? '+' : ''}{delta}% vs previous
        </div>
      )}
    </div>
  );
}

function BarChart({ data, xKey, yKey }: { data: any[]; xKey: string; yKey: string }) {
  const max = Math.max(...data.map((d) => Number(d[yKey]) || 0), 1);
  return (
    <div className="flex items-end gap-1 h-36">
      {data.map((d, i) => (
        <div key={i} className="group relative flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-zinc-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
            {d[xKey]}: {Number(d[yKey]).toFixed(2)}
          </div>
          <div className="w-full rounded-t bg-amber-400/80 hover:bg-amber-400 transition-all" style={{ height: `${Math.max((Number(d[yKey]) / max) * 100, 2)}%` }} />
          <div className="text-[9px] text-zinc-500 mt-1 truncate w-full text-center">{d[xKey]}</div>
        </div>
      ))}
    </div>
  );
}

function Table({ title, rows, columns }: { title: string; rows: any[]; columns: { key: string; label: string; right?: boolean }[] }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 text-sm font-semibold text-white">{title}</div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-zinc-500">Insufficient data for this period.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[10px]">
              <tr>{columns.map((c) => <th key={c.key} className={`p-3 ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  {columns.map((c) => <td key={c.key} className={`p-3 ${c.right ? 'text-right font-mono' : ''}`}>{r[c.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const PlatformAnalyticsPage: React.FC = () => {
  const [period, setPeriod] = useState<PlatformAnalyticsPeriod>('month');
  const [date, setDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [restaurants, setRestaurants] = useState<any[]>([]);
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

  useEffect(() => {
    platformService.listRestaurants({ limit: 200 }).then((res: any) => setRestaurants(res.items || res.data || [])).catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const query: any = { period, restaurantId: restaurantId || undefined };
      if (period === 'custom') {
        query.startDate = startDate || undefined;
        query.endDate = endDate || undefined;
      } else {
        query.date = date || undefined;
      }
      setData(await platformAnalyticsService.getAnalytics(query));
    } catch (err: any) {
      setError(err.message || 'Failed to load platform analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period, date, startDate, endDate, restaurantId]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const query: any = { period, restaurantId: restaurantId || undefined };
      if (period === 'custom') { query.startDate = startDate || undefined; query.endDate = endDate || undefined; }
      else { query.date = date || undefined; }
      await platformAnalyticsService.exportAnalytics(query, format, 'summary');
    } catch (err: any) {
      setError(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const k = data?.kpis;

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-amber-500" />
            Platform Analytics & Intelligence
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Cross-restaurant aggregated analytics, benchmarks, and market-basket intelligence.</p>
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

      {/* Filters */}
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
        <select value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-300">
          <option value="">All Restaurants</option>
          {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="p-16 text-center text-zinc-500"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" /><p className="text-sm">Loading platform analytics...</p></div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Revenue" value={`€${k.totalRevenue.toFixed(2)}`} delta={k.revenueGrowthPct} />
            <MetricCard label="Net Revenue" value={`€${k.netRevenue.toFixed(2)}`} />
            <MetricCard label="Total Orders" value={k.totalOrders} delta={k.orderGrowthPct} />
            <MetricCard label="Avg Order Value" value={`€${k.averageOrderValue.toFixed(2)}`} />
            <MetricCard label="Items Sold" value={k.itemsSold} />
            <MetricCard label="Unique Customers" value={k.uniqueCustomers} />
            <MetricCard label="Returning Rate" value={`${k.returningCustomerRate}%`} />
            <MetricCard label="Cancellation Rate" value={`${k.cancellationRate}%`} />
            <MetricCard label="Refund Amount" value={`€${k.refundAmount.toFixed(2)}`} />
            <MetricCard label="Avg Items / Order" value={k.averageItemsPerOrder} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
              <h3 className="text-sm font-semibold text-white mb-3">Orders by Hour</h3>
              <BarChart data={data.timeAnalysis.ordersByHour} xKey="hour" yKey="orders" />
            </div>
            <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
              <h3 className="text-sm font-semibold text-white mb-3">Orders by Weekday</h3>
              <BarChart data={data.timeAnalysis.ordersByWeekday.map((d: any) => ({ ...d, weekday: d.weekday.slice(0, 3) }))} xKey="weekday" yKey="orders" />
            </div>
          </div>

          <Table title="Restaurant Performance" rows={data.restaurantPerformance.map((r: any) => ({ Restaurant: r.name, Revenue: `€${r.revenue.toFixed(2)}`, Orders: r.orders, AOV: `€${r.averageOrderValue.toFixed(2)}`, Customers: r.customers, 'Cancellation %': r.cancellationRate, Growth: r.growthPct != null ? `${r.growthPct}%` : '—' }))} columns={[{ key: 'Restaurant', label: 'Restaurant' }, { key: 'Revenue', label: 'Revenue', right: true }, { key: 'Orders', label: 'Orders', right: true }, { key: 'AOV', label: 'AOV', right: true }, { key: 'Customers', label: 'Customers', right: true }, { key: 'Cancellation %', label: 'Cancel %', right: true }, { key: 'Growth', label: 'Growth', right: true }]} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Table title="Top Foods" rows={data.productIntelligence.topFoods.map((p: any) => ({ Product: p.name, Qty: p.quantity, Revenue: `€${p.revenue.toFixed(2)}` }))} columns={[{ key: 'Product', label: 'Product' }, { key: 'Qty', label: 'Qty', right: true }, { key: 'Revenue', label: 'Revenue', right: true }]} />
            <Table title="Top Drinks" rows={data.productIntelligence.topDrinks.map((p: any) => ({ Product: p.name, Qty: p.quantity, Revenue: `€${p.revenue.toFixed(2)}` }))} columns={[{ key: 'Product', label: 'Product' }, { key: 'Qty', label: 'Qty', right: true }, { key: 'Revenue', label: 'Revenue', right: true }]} />
            <Table title="Top Desserts" rows={data.productIntelligence.topDesserts.map((p: any) => ({ Product: p.name, Qty: p.quantity, Revenue: `€${p.revenue.toFixed(2)}` }))} columns={[{ key: 'Product', label: 'Product' }, { key: 'Qty', label: 'Qty', right: true }, { key: 'Revenue', label: 'Revenue', right: true }]} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Table title="Food + Drink Combinations" rows={data.combinations.foodDrink.map((c: any) => ({ Combo: c.combination.join(' + '), Count: c.count, Support: c.support, Confidence: c.confidence, Lift: c.lift }))} columns={[{ key: 'Combo', label: 'Combination' }, { key: 'Count', label: 'Count', right: true }, { key: 'Support', label: 'Support', right: true }, { key: 'Confidence', label: 'Confidence', right: true }, { key: 'Lift', label: 'Lift', right: true }]} />
            <Table title="Payment Methods" rows={data.paymentIntelligence.byMethod.map((p: any) => ({ Method: p.method, Count: p.count, Revenue: `€${p.revenue.toFixed(2)}`, Share: `${p.share}%` }))} columns={[{ key: 'Method', label: 'Method' }, { key: 'Count', label: 'Count', right: true }, { key: 'Revenue', label: 'Revenue', right: true }, { key: 'Share', label: 'Share', right: true }]} />
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
            <h3 className="text-sm font-semibold text-white mb-3">Platform Benchmarks (medians)</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-900/60"><div className="text-zinc-500">Median Revenue</div><div className="text-white font-mono font-bold">€{data.benchmarks.medianRestaurantRevenue.toFixed(2)}</div></div>
              <div className="p-3 rounded-xl bg-zinc-900/60"><div className="text-zinc-500">Median Orders</div><div className="text-white font-mono font-bold">{data.benchmarks.medianOrders}</div></div>
              <div className="p-3 rounded-xl bg-zinc-900/60"><div className="text-zinc-500">Median AOV</div><div className="text-white font-mono font-bold">€{data.benchmarks.medianAOV.toFixed(2)}</div></div>
              <div className="p-3 rounded-xl bg-zinc-900/60"><div className="text-zinc-500">Median Cancel Rate</div><div className="text-white font-mono font-bold">{data.benchmarks.medianCancellationRate}%</div></div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
