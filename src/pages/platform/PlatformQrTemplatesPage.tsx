import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { qrTemplateService, type QrPrintTemplate } from '../../services/qrTemplateService';
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  Upload,
  ImageIcon,
  RefreshCw,
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

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QrPrintTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [layout, setLayout] = useState<'A4' | 'CARD'>('CARD');
  const [backgroundUrl, setBackgroundUrl] = useState('');

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
    setName('');
    setDescription('');
    setLayout('CARD');
    setBackgroundUrl('');
    setModalOpen(true);
  };

  const openEdit = (t: QrPrintTemplate) => {
    setEditing(t);
    setName(t.name);
    setDescription(t.description || '');
    setLayout(t.layout);
    setBackgroundUrl(t.backgroundUrl || '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Template name is required.');
      return;
    }
    try {
      setSaving(true);
      const payload = { name, description, layout, backgroundUrl: backgroundUrl || undefined };
      if (editing) {
        await qrTemplateService.update(editing.id, payload);
      } else {
        await qrTemplateService.create(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      alert(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
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

      {/* Create / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-800 p-6 space-y-5 shadow-2xl">
            <h3 className="font-serif-luxury text-lg font-bold text-white">
              {editing ? 'Edit Template' : 'New Template'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-zinc-400 font-semibold mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-400"
                  placeholder="e.g. Luxury Dark"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-zinc-400 font-semibold mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-400 resize-none"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-zinc-400 font-semibold mb-1.5">Layout</label>
                <div className="flex items-center gap-2">
                  {(['CARD', 'A4'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLayout(l)}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        layout === l
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      {l === 'A4' ? 'A4 Sheet' : 'Card Size'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase text-zinc-400 font-semibold mb-1.5">
                  Background / Design
                </label>
                {backgroundUrl && (
                  <img
                    src={backgroundUrl}
                    alt="Background preview"
                    className="w-full h-32 object-cover rounded-xl border border-zinc-800 mb-2"
                  />
                )}
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-amber-400/50 text-zinc-300 text-xs font-semibold cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{editing ? 'Save Changes' : 'Create Template'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
