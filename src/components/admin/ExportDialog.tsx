import React, { useEffect, useState } from 'react';
import {
  X,
  Download,
  CalendarDays,
  FileText,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { ExportParams } from '../../services/paymentService';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onExport: (params: ExportParams) => Promise<void>;
}

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

export const ExportDialog: React.FC<ExportDialogProps> = ({ open, onClose, title, onExport }) => {
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('day');
  const [date, setDate] = useState<string>('');
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setPeriod('day');
    setDate(`${y}-${mo}-${d}`);
    setFormat('csv');
    setError(null);
  }, [open]);

  const setDefaultDateForPeriod = (p: 'day' | 'month' | 'year') => {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    if (p === 'day') setDate(`${y}-${mo}-${d}`);
    else if (p === 'month') setDate(`${y}-${mo}`);
    else setDate(`${y}`);
  };

  const handlePeriodChange = (p: 'day' | 'month' | 'year') => {
    setPeriod(p);
    setDefaultDateForPeriod(p);
    setError(null);
  };

  const handleExport = async () => {
    if (!date.trim()) {
      setError('Please select a date.');
      return;
    }
    setError(null);
    setExporting(true);
    try {
      await onExport({ period, date: date.trim(), format });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#12161f] border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 text-white">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-amber-400">
            <Download className="w-5 h-5" />
            <h3 className="font-bold text-base text-white">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Period selector */}
        <div>
          <label className="block text-xs text-zinc-400 font-semibold mb-2">Period</label>
          <div className="grid grid-cols-3 gap-2">
            {(['day', 'month', 'year'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePeriodChange(p)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                  period === p
                    ? 'bg-amber-500 text-neutral-950 border-amber-500'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                {p === 'day' ? 'Day' : p === 'month' ? 'Month' : 'Year'}
              </button>
            ))}
          </div>
        </div>

        {/* Date selector */}
        <div>
          <label className="block text-xs text-zinc-400 font-semibold mb-2 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            {period === 'day' ? 'Date' : period === 'month' ? 'Month' : 'Year'}
          </label>

          {period === 'day' && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          )}

          {period === 'month' && (
            <input
              type="month"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          )}

          {period === 'year' && (
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Format selector */}
        <div>
          <label className="block text-xs text-zinc-400 font-semibold mb-2">Format</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                format === 'csv'
                  ? 'bg-amber-500 text-neutral-950 border-amber-500'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => setFormat('xlsx')}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                format === 'xlsx'
                  ? 'bg-amber-500 text-neutral-950 border-amber-500'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-3 flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            {exporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
