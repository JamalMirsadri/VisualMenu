import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminData } from '../../hooks/useAdminData';
import { RestaurantDataGate } from '../../components/admin/RestaurantDataGate';
import { ErrorBanner } from '../../components/admin/ErrorBanner';
import { tableService } from '../../services/tableService';
import { qrTemplateService, type QrPrintTemplate } from '../../services/qrTemplateService';
import type { Table } from '../../types';
import { Printer, Layers, CheckSquare, Square, RefreshCw, ImageIcon } from 'lucide-react';

interface PrintTable {
  id: string;
  number: string;
  name: string;
  qrValue: string;
}

type TableWithQr = Table & { qrCodes?: { targetValue: string }[] };

const getQrImageUrl = (dataUrl: string, size = 360) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    dataUrl
  )}&color=0-0-0&bgcolor=255-255-255&margin=12`;

export const AdminQrPrintPage: React.FC = () => {
  const { restaurant, error, refresh, loading: restaurantLoading } = useAdminData();

  const [templates, setTemplates] = useState<QrPrintTemplate[]>([]);
  const [tables, setTables] = useState<PrintTable[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurant) return;
    try {
      setLoading(true);
      setLoadError(null);
      const [activeTemplates, rawTables] = await Promise.all([
        qrTemplateService.listActive(),
        tableService.getTables(restaurant.id) as Promise<TableWithQr[]>,
      ]);
      setTemplates(activeTemplates);

      const printTables: PrintTable[] = rawTables
        .filter((t) => t.active !== false)
        .map((t) => ({
          id: t.id,
          number: t.number,
          name: t.name || t.number,
          qrValue: t.qrCodes?.[0]?.targetValue || `/menu/${restaurant.slug}/table/${t.number}`,
        }));
      setTables(printTables);

      if (activeTemplates.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(activeTemplates[0].id);
      }
      setSelectedTableIds(new Set(printTables.map((t) => t.id)));
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load print data.');
    } finally {
      setLoading(false);
    }
  }, [restaurant, selectedTemplateId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const selectedTables = useMemo(
    () => tables.filter((t) => selectedTableIds.has(t.id)),
    [tables, selectedTableIds]
  );

  const toggleTable = (id: string) => {
    setSelectedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedTableIds((prev) => (prev.size === tables.length ? new Set() : new Set(tables.map((t) => t.id))));
  };

  if (restaurantLoading || !restaurant) {
    return (
      <RestaurantDataGate
        loading={restaurantLoading}
        error={error}
        hasRestaurant={Boolean(restaurant)}
        loadingLabel="Loading QR Print Studio..."
        onRetry={refresh}
      />
    );
  }

  const fullMenuUrl = `${window.location.origin}/menu/${restaurant.slug}`;

  return (
    <div className="space-y-8 max-w-6xl">
      <style>{`
        #qr-print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          #qr-print-area, #qr-print-area * { visibility: visible; }
          #qr-print-area { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {error && <ErrorBanner message={error} onRetry={refresh} title="Could not load restaurant data" />}
      {loadError && <ErrorBanner message={loadError} onRetry={load} title="Could not load print data" />}

      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Printer className="w-3.5 h-3.5" />
            QR Print Studio
          </div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-wide">
            Print Table QR Cards
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xl">
            Select a platform template and print QR cards for individual or all tables.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          disabled={!selectedTemplate || selectedTables.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" />
          <span>Print ({selectedTables.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="no-print flex items-center justify-center py-24 text-zinc-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading...</span>
        </div>
      ) : (
        <div className="no-print grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template selector */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Select Template</span>
            </h2>
            {templates.length === 0 ? (
              <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400 text-sm">
                No active templates available. A platform administrator must publish one first.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={`rounded-2xl border overflow-hidden text-left transition-all cursor-pointer ${
                      selectedTemplateId === t.id
                        ? 'border-amber-400 ring-2 ring-amber-400/30'
                        : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="h-24 bg-zinc-950 flex items-center justify-center overflow-hidden">
                      {t.backgroundUrl ? (
                        <img src={t.backgroundUrl} alt={t.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-zinc-700" />
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-semibold text-white truncate">{t.name}</p>
                      <p className="text-[10px] text-zinc-400 uppercase">{t.layout}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Table selector */}
            <h2 className="text-sm font-bold text-white flex items-center gap-2 pt-2">
              <CheckSquare className="w-4 h-4 text-amber-400" />
              <span>Tables ({selectedTables.length}/{tables.length})</span>
              <button
                onClick={toggleAll}
                className="ml-auto text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
              >
                {selectedTableIds.size === tables.length ? 'Deselect All' : 'Select All'}
              </button>
            </h2>
            <div className="flex flex-wrap gap-2">
              {tables.map((t) => {
                const selected = selectedTableIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTable(t.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-amber-500/15 border-amber-400/50 text-amber-200'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {selected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-white">Preview</h2>
            {selectedTemplate && selectedTables[0] ? (
              <div
                className="aspect-[85.6/54] w-full rounded-xl overflow-hidden border border-zinc-700 relative"
                style={{
                  backgroundImage: selectedTemplate.backgroundUrl ? `url(${selectedTemplate.backgroundUrl})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: '#18181b',
                }}
              >
                <div className="absolute inset-0 flex items-center gap-4 p-4">
                  {/* LEFT: gold-framed QR square */}
                  <div
                    className="h-full aspect-square shrink-0 flex items-center justify-center rounded-md bg-white p-2"
                    style={{ border: '2px solid #d4af37' }}
                  >
                    <img
                      src={getQrImageUrl(`${fullMenuUrl}/table/${selectedTables[0].number}`, 240)}
                      alt="Table QR"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  {/* RIGHT: dynamic content */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 text-white">
                    {restaurant.logo && (
                      <img
                        src={restaurant.logo}
                        alt="Restaurant logo"
                        className="h-10 w-auto max-w-full object-contain self-start"
                      />
                    )}
                    <span className="text-base font-bold leading-tight drop-shadow truncate">{restaurant.name}</span>
                    <span className="text-sm drop-shadow truncate">{selectedTables[0].name}</span>
                    <span className="text-xs font-semibold drop-shadow" style={{ color: '#d4af37' }}>
                      No. {selectedTables[0].number}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400 text-sm">
                Select a template and at least one table.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Print-only output */}
      <div id="qr-print-area">
        {selectedTemplate &&
          selectedTables.map((t) => (
            <div
              key={t.id}
              style={{
                width: selectedTemplate.layout === 'A4' ? '100%' : '85.6mm',
                height: selectedTemplate.layout === 'A4' ? 'auto' : '54mm',
                minHeight: '54mm',
                pageBreakInside: 'avoid',
                position: 'relative',
                backgroundImage: selectedTemplate.backgroundUrl ? `url(${selectedTemplate.backgroundUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: '#ffffff',
                margin: '0 0 4mm 0',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: '6mm', padding: '6mm' }}>
                {/* LEFT: gold-framed QR square */}
                <div
                  style={{
                    height: '42mm',
                    width: '42mm',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1.5mm solid #d4af37',
                    background: '#ffffff',
                    padding: '2mm',
                    boxSizing: 'border-box',
                  }}
                >
                  <img
                    src={getQrImageUrl(`${fullMenuUrl}/table/${t.number}`, 600)}
                    alt="Table QR"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
                {/* RIGHT: dynamic content */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2mm', color: '#111' }}>
                  {restaurant.logo && (
                    <img
                      src={restaurant.logo}
                      alt=""
                      style={{ height: '12mm', width: 'auto', maxWidth: '100%', objectFit: 'contain', alignSelf: 'flex-start' }}
                    />
                  )}
                  <span style={{ fontSize: '4mm', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{restaurant.name}</span>
                  <span style={{ fontSize: '3.5mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  <span style={{ fontSize: '3mm', fontWeight: 600, color: '#8a6d1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>No. {t.number}</span>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
