import React, { useEffect, useState } from 'react';
import {
  Clapperboard,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Upload,
  CheckCircle2,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import {
  videoTemplateService,
  type VideoTemplate,
  type VideoContentType,
} from '../../services/videoTemplateService';

const CONTENT_TYPES: VideoContentType[] = ['FOOD', 'SALAD', 'DRINK', 'DESSERT', 'OTHER'];

function jsonOrDefault(value: any): string {
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return '';
}

export const PlatformVideoTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VideoTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [contentType, setContentType] = useState<VideoContentType>('FOOD');
  const [description, setDescription] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState('');
  const [provider, setProvider] = useState('VEO');
  const [model, setModel] = useState('');
  const [backgroundAsset, setBackgroundAsset] = useState('');
  const [styleConfig, setStyleConfig] = useState('');
  const [cameraConfig, setCameraConfig] = useState('');
  const [lightingConfig, setLightingConfig] = useState('');
  const [motionConfig, setMotionConfig] = useState('');
  const [uploading, setUploading] = useState(false);

  const [variantTemplateId, setVariantTemplateId] = useState<string | null>(null);
  const [variantName, setVariantName] = useState('');
  const [variantPrompt, setVariantPrompt] = useState('');
  const [variantNegative, setVariantNegative] = useState('');

  const loadTemplates = async () => {
    setLoading(true);
    try {
      setTemplates(await videoTemplateService.list());
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTemplates(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName(''); setContentType('FOOD'); setDescription(''); setAspectRatio('9:16'); setDuration('');
    setProvider('VEO'); setModel(''); setBackgroundAsset('');
    setStyleConfig(''); setCameraConfig(''); setLightingConfig(''); setMotionConfig('');
    setModalOpen(true);
  };

  const openEdit = (t: VideoTemplate) => {
    setEditing(t);
    setName(t.name); setContentType(t.contentType); setDescription(t.description || '');
    setAspectRatio(t.aspectRatio || '9:16'); setDuration(t.duration ? String(t.duration) : '');
    setProvider(t.provider || 'VEO'); setModel(t.model || ''); setBackgroundAsset(t.backgroundAsset || '');
    setStyleConfig(jsonOrDefault(t.styleConfig)); setCameraConfig(jsonOrDefault(t.cameraConfig));
    setLightingConfig(jsonOrDefault(t.lightingConfig)); setMotionConfig(jsonOrDefault(t.motionConfig));
    setModalOpen(true);
  };

  const parseJson = (s: string): any | undefined => {
    if (!s || !s.trim()) return undefined;
    try { return JSON.parse(s); } catch { return undefined; }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const payload: any = {
        name, contentType, description, aspectRatio,
        duration: duration ? parseInt(duration, 10) : null,
        provider, model: model || null, backgroundAsset: backgroundAsset || null,
        styleConfig: parseJson(styleConfig), cameraConfig: parseJson(cameraConfig),
        lightingConfig: parseJson(lightingConfig), motionConfig: parseJson(motionConfig),
      };
      if (editing) await videoTemplateService.update(editing.id, payload);
      else await videoTemplateService.create(payload);
      setModalOpen(false);
      await loadTemplates();
      setFeedback({ type: 'success', message: `Template ${editing ? 'updated' : 'created'} successfully.` });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Operation failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (t: VideoTemplate) => {
    try {
      await videoTemplateService.toggle(t.id);
      await loadTemplates();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Toggle failed' });
    }
  };

  const handleDelete = async (t: VideoTemplate) => {
    if (!window.confirm(`Delete template "${t.name}" and its prompt variants?`)) return;
    try {
      await videoTemplateService.remove(t.id);
      await loadTemplates();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Delete failed' });
    }
  };

  const handleUploadBackground = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await videoTemplateService.uploadBackground(file);
      setBackgroundAsset(result.url);
      setFeedback({ type: 'success', message: 'Background uploaded.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantTemplateId) return;
    setSubmitting(true);
    try {
      await videoTemplateService.addVariant(variantTemplateId, { name: variantName, promptTemplate: variantPrompt, negativePrompt: variantNegative || null });
      setVariantTemplateId(null); setVariantName(''); setVariantPrompt(''); setVariantNegative('');
      await loadTemplates();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Add variant failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveVariant = async (templateId: string, variantId: string) => {
    try {
      await videoTemplateService.removeVariant(templateId, variantId);
      await loadTemplates();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Remove variant failed' });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
            <Clapperboard className="w-8 h-8 text-amber-500" />
            AI Video Templates
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Manage reusable platform-owned video templates and prompt variants.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2.5 border ${feedback.type === 'success' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-red-950/40 border-red-800/60 text-red-300'}`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-zinc-500 flex flex-col items-center gap-2"><RefreshCw className="w-6 h-6 animate-spin text-amber-500" /><span className="text-xs">Loading templates...</span></div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 text-sm">No templates yet.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {templates.map((t) => (
            <div key={t.id} className={`rounded-3xl border p-6 bg-zinc-900/90 ${t.active ? 'border-zinc-800' : 'border-zinc-800/40 opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">{t.contentType}</span>
                    <span className="text-[10px] font-mono text-zinc-500">v{t.version} · {t.aspectRatio}</span>
                  </div>
                  <h3 className="font-bold text-white text-lg mt-2">{t.name}</h3>
                  <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{t.description || 'No description.'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggle(t)} className="p-1 text-zinc-400 hover:text-white" title={t.active ? 'Deactivate' : 'Activate'}>
                    {t.active ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-zinc-500" />}
                  </button>
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800" title="Edit"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(t)} className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400"><Layers className="w-4 h-4" /> Prompt Variants ({t.variants?.length || 0})</div>
                <div className="space-y-2">
                  {(t.variants || []).map((v) => (
                    <div key={v.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-200">{v.name} {!v.active && <span className="text-zinc-500">(inactive)</span>}</div>
                        <div className="text-[11px] text-zinc-500 truncate">{v.promptTemplate}</div>
                      </div>
                      <button onClick={() => handleRemoveVariant(t.id, v.id)} className="p-1 text-zinc-500 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>

                {variantTemplateId === t.id ? (
                  <form onSubmit={handleAddVariant} className="mt-3 space-y-2">
                    <input value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="Variant name" required className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white" />
                    <textarea value={variantPrompt} onChange={(e) => setVariantPrompt(e.target.value)} placeholder="Prompt template (use {FOOD_NAME}, {FOOD_IMAGE}, etc.)" required rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white resize-none" />
                    <input value={variantNegative} onChange={(e) => setVariantNegative(e.target.value)} placeholder="Negative prompt (optional)" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={submitting} className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold disabled:opacity-50">Save</button>
                      <button type="button" onClick={() => setVariantTemplateId(null)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button onClick={() => { setVariantTemplateId(t.id); setVariantName(''); setVariantPrompt(''); setVariantNegative(''); }} className="mt-3 text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add variant</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-4 my-8">
            <div className="flex justify-between items-center">
              <h3 className="font-serif-luxury text-xl font-bold text-white">{editing ? 'Edit Template' : 'New Template'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-zinc-400 hover:text-white p-1">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Name</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Content Type</label>
                  <select value={contentType} onChange={(e) => setContentType(e.target.value as VideoContentType)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white">
                    {CONTENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white resize-none" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Aspect Ratio</label>
                  <input value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Duration (s)</label>
                  <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Provider</label>
                  <input value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white" />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Model</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white" />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Fixed Background Asset (URL)</label>
                <div className="flex gap-2">
                  <input value={backgroundAsset} onChange={(e) => setBackgroundAsset(e.target.value)} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white" />
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer text-xs font-semibold border border-zinc-700">
                    <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading...' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadBackground(e.target.files?.[0])} />
                  </label>
                </div>
              </div>

              {(['Style', 'Camera', 'Lighting', 'Motion'] as const).map((label) => {
                const map: Record<string, [string, (v: string) => void]> = {
                  Style: [styleConfig, setStyleConfig],
                  Camera: [cameraConfig, setCameraConfig],
                  Lighting: [lightingConfig, setLightingConfig],
                  Motion: [motionConfig, setMotionConfig],
                };
                const [val, setter] = map[label];
                return (
                  <div key={label}>
                    <label className="block text-zinc-400 font-semibold mb-1">{label} Config (JSON)</label>
                    <textarea value={val} onChange={(e) => setter(e.target.value)} rows={2} placeholder='{}' className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono resize-none" />
                  </div>
                );
              })}

              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-semibold">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold disabled:opacity-50">{submitting ? 'Saving...' : editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
