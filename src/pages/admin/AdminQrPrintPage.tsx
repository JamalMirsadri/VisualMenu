import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminData } from '../../hooks/useAdminData';
import { RestaurantDataGate } from '../../components/admin/RestaurantDataGate';
import { ErrorBanner } from '../../components/admin/ErrorBanner';
import { tableService } from '../../services/tableService';
import { qrTemplateService, type QrPrintTemplate, type QrPrintElement } from '../../services/qrTemplateService';
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

// CSS pixel per millimetre at 96dpi (used for the on-screen preview scaling).
const PX_PER_MM = 3.7795;
const SERIF = `'Times New Roman', Times, serif`;
const GOLD = '#d4af37';

const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 210, h: 148 },
  CARD: { w: 85.6, h: 54 },
};

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

interface QrPrintCardProps {
  table: PrintTable;
  restaurantName: string;
  restaurantLogo?: string | null;
  template: QrPrintTemplate;
  fullMenuUrl: string;
}

function renderConfiguredElement(
  el: QrPrintElement,
  table: PrintTable,
  restaurantName: string,
  restaurantLogo: string | null | undefined,
  fullMenuUrl: string
) {
  const textStyle = {
    fontFamily: el.fontFamily || SERIF,
    fontWeight: el.fontWeight || 400,
    color: el.color || '#000000',
    fontSize: `${el.fontSize || 14}pt`,
    lineHeight: 1.1,
    textAlign: (el.textAlign || 'center') as 'left' | 'center' | 'right',
  };
  const boxStyle = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: JUSTIFY[el.textAlign || 'center'],
  };

  switch (el.type) {
    case 'QR_CODE':
      return (
        <div style={{ width: '100%', height: '100%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={getQrImageUrl(`${fullMenuUrl}/table/${table.number}`, 600)}
            alt="Table QR"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      );
    case 'LOGO':
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {restaurantLogo && (
            <img src={restaurantLogo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          )}
        </div>
      );
    case 'RESTAURANT_NAME':
      return <div style={{ ...boxStyle, ...textStyle }}>{restaurantName}</div>;
    case 'TABLE_NAME':
      return <div style={{ ...boxStyle, ...textStyle }}>{table.name}</div>;
    case 'TABLE_NUMBER':
      return <div style={{ ...boxStyle, ...textStyle }}>{table.number}</div>;
    default:
      return null;
  }
}

/**
 * The single source of truth for a printable QR card. Preview and Print both
 * render this exact component, so their composition is identical. Templates
 * with a layoutConfig render configured elements; legacy templates fall back
 * to the default QR-left / content-right composition.
 */
const QrPrintCard: React.FC<QrPrintCardProps> = ({
  table,
  restaurantName,
  restaurantLogo,
  template,
  fullMenuUrl,
}) => {
  const size = PAGE_SIZES[template.layout] || PAGE_SIZES.CARD;
  const config =
    Array.isArray(template.layoutConfig) && template.layoutConfig.length > 0 ? template.layoutConfig : null;

  const isA4 = template.layout === 'A4';
  const pad = isA4 ? '18mm' : '5mm';
  const gap = isA4 ? '14mm' : '5mm';
  const qrSize = isA4 ? '76mm' : '30mm';
  const qrBorder = isA4 ? '2.5mm' : '1.5mm';
  const logoH = isA4 ? '24mm' : '10mm';
  const nameSize = isA4 ? '16mm' : '4.8mm';
  const tableSize = isA4 ? '11mm' : '3.9mm';
  const numberSize = isA4 ? '9mm' : '3.4mm';

  return (
    <div
      className="qr-print-card"
      style={{
        width: `${size.w}mm`,
        height: `${size.h}mm`,
        position: 'relative',
        boxSizing: 'border-box',
        backgroundImage: template.backgroundUrl ? `url(${template.backgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#ffffff',
      }}
    >
      {config
        ? config.map((el) => (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left: `${el.x}mm`,
                top: `${el.y}mm`,
                width: `${el.w}mm`,
                height: `${el.h}mm`,
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              {renderConfiguredElement(el, table, restaurantName, restaurantLogo, fullMenuUrl)}
            </div>
          ))
        : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap, padding: pad }}>
              <div
                style={{
                  width: qrSize,
                  height: qrSize,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `${qrBorder} solid ${GOLD}`,
                  background: '#ffffff',
                  padding: isA4 ? '5mm' : '2mm',
                  boxSizing: 'border-box',
                }}
              >
                <img
                  src={getQrImageUrl(`${fullMenuUrl}/table/${table.number}`, isA4 ? 900 : 480)}
                  alt="Table QR"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: isA4 ? '6mm' : '2mm',
                  fontFamily: SERIF,
                  color: '#000000',
                }}
              >
                {restaurantLogo && (
                  <img
                    src={restaurantLogo}
                    alt=""
                    style={{ height: logoH, width: 'auto', maxWidth: '100%', objectFit: 'contain', alignSelf: 'flex-start' }}
                  />
                )}
                <span style={{ fontSize: nameSize, fontWeight: 700, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SERIF, color: '#000000' }}>
                  {restaurantName}
                </span>
                <span style={{ fontSize: tableSize, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SERIF, color: '#000000' }}>
                  {table.name}
                </span>
                <span style={{ fontSize: numberSize, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SERIF, color: '#000000' }}>
                  No. {table.number}
                </span>
              </div>
            </div>
          )}
    </div>
  );
};

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

  const previewMetrics = useMemo(() => {
    if (!selectedTemplate) return null;
    const size = PAGE_SIZES[selectedTemplate.layout] || PAGE_SIZES.CARD;
    const scale = Math.min(1, 300 / (size.w * PX_PER_MM));
    return { w: size.w * PX_PER_MM * scale, h: size.h * PX_PER_MM * scale, scale, wmm: size.w, hmm: size.h };
  }, [selectedTemplate]);

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
          @page { size: auto; margin: 0; }
          html, body { background: #ffffff; }
          .qr-print-card,
          .qr-print-card *,
          .qr-print-page,
          #qr-print-area {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          body * { visibility: hidden; }
          #qr-print-area, #qr-print-area * { visibility: visible; }
          #qr-print-area {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print { display: none !important; }
          .qr-print-page {
            page-break-after: always;
            break-after: page;
          }
          .qr-print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
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
            {selectedTemplate && selectedTables[0] && previewMetrics ? (
              <div
                className="rounded-xl overflow-hidden border border-zinc-700"
                style={{ width: previewMetrics.w, height: previewMetrics.h }}
              >
                <div
                  style={{
                    width: previewMetrics.wmm * PX_PER_MM,
                    height: previewMetrics.hmm * PX_PER_MM,
                    transform: `scale(${previewMetrics.scale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <QrPrintCard
                    table={selectedTables[0]}
                    restaurantName={restaurant.name}
                    restaurantLogo={restaurant.logo}
                    template={selectedTemplate}
                    fullMenuUrl={fullMenuUrl}
                  />
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
              className="qr-print-page"
              style={
                selectedTemplate.layout === 'A4'
                  ? { width: '210mm', height: '297mm', margin: '0 auto' }
                  : { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }
              }
            >
              <QrPrintCard
                table={t}
                restaurantName={restaurant.name}
                restaurantLogo={restaurant.logo}
                template={selectedTemplate}
                fullMenuUrl={fullMenuUrl}
              />
            </div>
          ))}
      </div>
    </div>
  );
};
