import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { qrTemplateService, type QrPrintTemplate, type QrPrintElement } from '../../services/qrTemplateService';
import { QrTemplateEditor } from '../../components/platform/QrTemplateEditor';
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  RefreshCw,
  ImageIcon,
  Layers,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const PlatformQrTemplatesPage: React.FC = () => {
  const { isPlatformAdmin } = useAuth();
  const [templates, setTemplates] = useState<QrPrintTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QrPrintTemplate | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTemplates(await qrTemplateService.list());
    } catch (err: any) {
      setError(err.message || 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (t: QrPrintTemplate) => {
    setEditing(t);
    setEditorOpen(true);
  };

  const handleEditorSave = async (data: {
    name: string;
    description?: string;
    layout: 'A5';
    backgroundUrl?: string;
    layoutConfig: QrPrintElement[];
  }) => {
    if (editing) {
      await qrTemplateService.update(editing.id, data);
    } else {
      await qrTemplateService.create(data);
    }
    setEditorOpen(false);
    setEditing(null);
    await load();
  };

  const handleToggle = async (t: QrPrintTemplate) => {
    try {
      setActionId(t.id);
      await qrTemplateService.toggle(t.id);
      await load();
    } catch (err: any) {
      alert(err.message || 'Toggle failed.');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (t: QrPrintTemplate) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      setActionId(t.id);
      await qrTemplateService.remove(t.id);
      await load();
    } catch (err: any) {
      alert(err.message || 'Delete failed.');
    } finally {
      setActionId(null);
    }
  };

  if (!isPlatformAdmin) {
    return (
      <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400">
        <p className="text-sm font-semibold">Platform Admin access required to manage QR print templates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5" />
            QR Print Templates
          </div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-wide">
            Print Template Studio
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xl">
            Platform-owned fixed backgrounds/designs that restaurants can select when printing table QR cards.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Template</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading templates...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400">
          <ImageIcon className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-medium">No templates yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden flex flex-col"
            >
              <div className="h-36 bg-zinc-950 flex items-center justify-center overflow-hidden">
                {t.backgroundUrl ? (
                  <img src={t.backgroundUrl} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-zinc-700" />
                )}
              </div>
              <div className="p-4 flex-1 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{t.name}</h3>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">{t.description || '—'}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-md border border-zinc-700 text-zinc-400 uppercase">
                    {t.layout}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                      t.active ? 'text-emerald-400' : 'text-zinc-500'
                    }`}
                  >
                    {t.active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {t.active ? 'Active' : 'Disabled'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(t)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggle(t)}
                      disabled={actionId === t.id}
                      className="p-2 rounded-lg text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
                      title={t.active ? 'Disable' : 'Enable'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={actionId === t.id}
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <QrTemplateEditor
          initial={editing}
          onSave={handleEditorSave}
          onCancel={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};
