import React, { useRef, useState } from 'react';
import {
  qrTemplateService,
  type QrPrintElement,
  type QrElementType,
  type QrPrintTemplate,
} from '../../services/qrTemplateService';
import { Trash2, X, Upload, Save, ImageIcon } from 'lucide-react';

const PAGE_W = 210; // A5 landscape mm
const PAGE_H = 148;
const PX_PER_MM = 3.7795;
const EDITOR_WIDTH = 540; // display px for the canvas
const EDITOR_SCALE = EDITOR_WIDTH / (PAGE_W * PX_PER_MM);

const SERIF = `'Times New Roman', Times, serif`;

const ELEMENT_LABELS: Record<QrElementType, string> = {
  QR_CODE: 'QR',
  LOGO: 'LOGO',
  RESTAURANT_NAME: 'Restaurant Name',
  TABLE_NAME: 'Table Name',
  TABLE_NUMBER: 'Table 12',
};

const FONT_FAMILIES = ['Times New Roman', 'Georgia', 'Arial', 'Helvetica', 'Courier New'];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const makeId = () => `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function defaultElement(type: QrElementType): QrPrintElement {
  const base: QrPrintElement = { id: makeId(), type, x: 20, y: 20, w: 60, h: 20 };
  switch (type) {
    case 'QR_CODE':
      return { ...base, w: 64, h: 64 };
    case 'LOGO':
      return { ...base, x: 90, y: 16, w: 50, h: 26 };
    case 'RESTAURANT_NAME':
      return { ...base, x: 90, y: 60, w: 100, h: 22, fontSize: 24, fontFamily: 'Times New Roman', fontWeight: 700, color: '#000000', textAlign: 'center' };
    case 'TABLE_NAME':
      return { ...base, x: 90, y: 86, w: 100, h: 16, fontSize: 16, fontFamily: 'Times New Roman', fontWeight: 400, color: '#000000', textAlign: 'center' };
    case 'TABLE_NUMBER':
      return { ...base, x: 90, y: 106, w: 100, h: 14, fontSize: 14, fontFamily: 'Times New Roman', fontWeight: 400, color: '#000000', textAlign: 'center' };
    default:
      return base;
  }
}

interface QrTemplateEditorProps {
  initial?: QrPrintTemplate | null;
  onSave: (data: {
    name: string;
    description?: string;
    layout: 'A5';
    backgroundUrl?: string;
    layoutConfig: QrPrintElement[];
  }) => Promise<void>;
  onCancel: () => void;
}

export const QrTemplateEditor: React.FC<QrTemplateEditorProps> = ({ initial, onSave, onCancel }) => {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [backgroundUrl, setBackgroundUrl] = useState(initial?.backgroundUrl || '');
  const [elements, setElements] = useState<QrPrintElement[]>(
    Array.isArray(initial?.layoutConfig) ? (initial.layoutConfig as QrPrintElement[]) : []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selected = elements.find((e) => e.id === selectedId) || null;

  const updateElement = (id: string, patch: Partial<QrPrintElement>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const addElement = (type: QrElementType) => {
    const el = defaultElement(type);
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const removeElement = (id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const pxPerMm = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? rect.width / PAGE_W : PX_PER_MM * EDITOR_SCALE;
  };

  const snap = (v: number, size: number, max: number) => {
    const targets = [0, max / 2 - size / 2, max - size];
    for (const t of targets) {
      if (Math.abs(v - t) < 5) return t;
    }
    return v;
  };

  const onDragStart = (e: React.MouseEvent, el: QrPrintElement) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startElX = el.x;
    const startElY = el.y;
    const mmPerPx = 1 / pxPerMm();

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) * mmPerPx;
      const dy = (ev.clientY - startY) * mmPerPx;
      const x = snap(clamp(startElX + dx, 0, PAGE_W - el.w), el.w, PAGE_W);
      const y = snap(clamp(startElY + dy, 0, PAGE_H - el.h), el.h, PAGE_H);
      updateElement(el.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onResizeStart = (e: React.MouseEvent, el: QrPrintElement) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = el.w;
    const startH = el.h;
    const mmPerPx = 1 / pxPerMm();

    const onMove = (ev: MouseEvent) => {
      let dw = (ev.clientX - startX) * mmPerPx;
      let dh = (ev.clientY - startY) * mmPerPx;
      if (el.type === 'QR_CODE') {
        const d = Math.max(dw, dh);
        dw = d;
        dh = d;
      }
      const w = clamp(startW + dw, 10, PAGE_W - el.x);
      const h = clamp(startH + dh, 10, PAGE_H - el.y);
      updateElement(el.id, { w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const result = await qrTemplateService.uploadBackground(file);
      setBackgroundUrl(result.url);
    } catch (err: any) {
      alert(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Template name is required.');
      return;
    }
    try {
      setSaving(true);
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        layout: 'A5',
        backgroundUrl: backgroundUrl || undefined,
        layoutConfig: elements,
      });
    } finally {
      setSaving(false);
    }
  };

  const renderElementContent = (el: QrPrintElement) => {
    const style = {
      fontFamily: el.fontFamily || SERIF,
      fontWeight: el.fontWeight || 400,
      color: el.color || '#000000',
      textAlign: (el.textAlign || 'center') as any,
      fontSize: `${el.fontSize || 14}pt`,
      lineHeight: 1.1,
    };
    switch (el.type) {
      case 'QR_CODE':
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: '#ffffff',
              border: '1px dashed #c9a227',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c9a227',
              fontSize: '9pt',
              fontWeight: 700,
            }}
          >
            QR
          </div>
        );
      case 'LOGO':
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed #94a3b8',
              color: '#94a3b8',
              fontSize: '9pt',
              fontWeight: 700,
            }}
          >
            LOGO
          </div>
        );
      default:
        return <span style={style}>{ELEMENT_LABELS[el.type]}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800 bg-zinc-950">
        <div className="flex-1 min-w-0">
          <h2 className="font-serif-luxury text-lg font-bold text-white">
            {initial ? 'Edit A5 QR Template' : 'New A5 QR Template'}
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              className="w-56 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-400"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 max-w-xs px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Template'}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        {/* Canvas + toolbar */}
        <div className="flex-1 min-w-0 overflow-auto p-6">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs uppercase font-bold text-zinc-500 tracking-wider mr-1">Add:</span>
            {(['QR_CODE', 'LOGO', 'RESTAURANT_NAME', 'TABLE_NAME', 'TABLE_NUMBER'] as QrElementType[]).map((t) => (
              <button
                key={t}
                onClick={() => addElement(t)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-amber-400/50 text-zinc-300 text-[11px] font-semibold cursor-pointer"
              >
                {ELEMENT_LABELS[t]}
              </button>
            ))}
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-amber-400/50 text-zinc-300 text-[11px] font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? 'Uploading...' : 'Background'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>

          <div
            style={{ width: EDITOR_WIDTH, height: (PAGE_H * PX_PER_MM * EDITOR_SCALE) }}
            className="relative mx-auto"
          >
            <div
              ref={canvasRef}
              onClick={() => setSelectedId(null)}
              className="relative shadow-2xl"
              style={{
                width: `${PAGE_W}mm`,
                height: `${PAGE_H}mm`,
                transform: `scale(${EDITOR_SCALE})`,
                transformOrigin: 'top left',
                backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: '#ffffff',
                backgroundRepeat: 'no-repeat',
              }}
            >
              {!backgroundUrl && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
                  <div className="text-center">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
                    <span className="text-xs">Upload a background</span>
                  </div>
                </div>
              )}

              {elements.map((el) => (
                <div
                  key={el.id}
                  onMouseDown={(e) => {
                    setSelectedId(el.id);
                    onDragStart(e, el);
                  }}
                  style={{
                    position: 'absolute',
                    left: `${el.x}mm`,
                    top: `${el.y}mm`,
                    width: `${el.w}mm`,
                    height: `${el.h}mm`,
                    cursor: 'move',
                    border: selectedId === el.id ? '1.5px solid #f59e0b' : '1px dashed rgba(255,255,255,0.4)',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {renderElementContent(el)}
                  {selectedId === el.id && (
                    <div
                      onMouseDown={(e) => onResizeStart(e, el)}
                      style={{
                        position: 'absolute',
                        right: -6,
                        bottom: -6,
                        width: 12,
                        height: 12,
                        background: '#f59e0b',
                        borderRadius: 2,
                        cursor: 'nwse-resize',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Property panel */}
        <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900/40 p-4 overflow-y-auto">
          <h3 className="text-xs uppercase font-bold text-zinc-500 tracking-wider mb-3">Properties</h3>
          {!selected ? (
            <p className="text-xs text-zinc-500">Select an element on the canvas to edit its properties.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">{ELEMENT_LABELS[selected.type]}</span>
                <button
                  onClick={() => removeElement(selected.id)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 cursor-pointer"
                  title="Remove element"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <div key={k}>
                  <label className="block text-[10px] uppercase text-zinc-500 font-semibold mb-1">
                    {k === 'w' ? 'Width (mm)' : k === 'h' ? 'Height (mm)' : `${k.toUpperCase()} (mm)`}
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={Math.round(selected[k] * 10) / 10}
                    onChange={(e) => updateElement(selected.id, { [k]: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              ))}

              {selected.type !== 'QR_CODE' && selected.type !== 'LOGO' && (
                <>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-semibold mb-1">Font size (pt)</label>
                    <input
                      type="number"
                      step="1"
                      value={selected.fontSize || 14}
                      onChange={(e) => updateElement(selected.id, { fontSize: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-semibold mb-1">Font family</label>
                    <select
                      value={selected.fontFamily || 'Times New Roman'}
                      onChange={(e) => updateElement(selected.id, { fontFamily: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      {FONT_FAMILIES.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-semibold mb-1">Font weight</label>
                    <select
                      value={selected.fontWeight || 400}
                      onChange={(e) => updateElement(selected.id, { fontWeight: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value={400}>Normal</option>
                      <option value={700}>Bold</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-semibold mb-1">Color</label>
                    <input
                      type="color"
                      value={selected.color || '#000000'}
                      onChange={(e) => updateElement(selected.id, { color: e.target.value })}
                      className="w-full h-8 rounded-lg bg-zinc-950 border border-zinc-700 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-semibold mb-1">Alignment</label>
                    <div className="flex gap-1">
                      {(['left', 'center', 'right'] as const).map((a) => (
                        <button
                          key={a}
                          onClick={() => updateElement(selected.id, { textAlign: a })}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold capitalize border cursor-pointer ${
                            (selected.textAlign || 'center') === a
                              ? 'bg-amber-500 text-black border-amber-400'
                              : 'bg-zinc-950 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
