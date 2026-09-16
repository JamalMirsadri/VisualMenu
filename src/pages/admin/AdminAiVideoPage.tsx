import React, { useEffect, useMemo, useState } from 'react';
import {
  Clapperboard,
  RefreshCw,
  Sparkles,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { aiVideoService, type VideoCreditBalance, type VideoGenerationJob } from '../../services/aiVideoService';
import { mediaService } from '../../services/mediaService';
import { resolveMediaUrl } from '../../config';
import type { VideoTemplate, VideoContentType } from '../../services/videoTemplateService';

const CONTENT_TYPES: VideoContentType[] = ['FOOD', 'SALAD', 'DRINK', 'DESSERT', 'OTHER'];

const statusStyle: Record<string, string> = {
  QUEUED: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  PROCESSING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
  CANCELLED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export const AdminAiVideoPage: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const restaurantId = activeRestaurant?.id;

  const [balance, setBalance] = useState<VideoCreditBalance | null>(null);
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [jobs, setJobs] = useState<VideoGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contentType, setContentType] = useState<VideoContentType>('FOOD');
  const [templateId, setTemplateId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [productName, setProductName] = useState('');
  const [sourceMediaId, setSourceMediaId] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const [b, t, j] = await Promise.all([
        aiVideoService.getBalance(restaurantId),
        aiVideoService.listTemplates(restaurantId),
        aiVideoService.listJobs(restaurantId),
      ]);
      setBalance(b);
      setTemplates(t);
      setJobs(j);
    } catch (err: any) {
      setError(err.message || 'Failed to load AI Video Studio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || !jobs.some((j) => j.status === 'QUEUED' || j.status === 'PROCESSING')) return;
    const timer = setInterval(async () => {
      try {
        setJobs(await aiVideoService.listJobs(restaurantId));
        setBalance(await aiVideoService.getBalance(restaurantId));
      } catch {
        /* ignore polling errors */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [restaurantId, jobs]);

  const filteredTemplates = useMemo(
    () => templates.filter((t) => t.contentType === contentType),
    [templates, contentType]
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId]
  );

  const noCredits = balance !== null && balance.balance <= 0;

  const handleContentTypeChange = (ct: VideoContentType) => {
    setContentType(ct);
    setTemplateId('');
    setVariantId('');
  };

  const handleUpload = async (file?: File) => {
    if (!file || !restaurantId) return;
    setUploading(true);
    setError(null);
    try {
      const media = await mediaService.uploadFile(restaurantId, file, { altText: 'AI Video source image' });
      setSourceMediaId(media.id);
    } catch (err: any) {
      setError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!restaurantId || !templateId || !variantId) return;
    setGenerating(true);
    setError(null);
    try {
      const job = await aiVideoService.generate(restaurantId, {
        templateId,
        promptVariantId: variantId,
        sourceMediaId,
        productName: productName || undefined,
        contentType,
      });
      setJobs((prev) => [job, ...prev]);
      setBalance(await aiVideoService.getBalance(restaurantId));
      setProductName('');
      setSourceMediaId(undefined);
      setVariantId('');
    } catch (err: any) {
      setError(err.message || 'Generation failed.');
      setBalance(await aiVideoService.getBalance(restaurantId).catch(() => balance));
    } finally {
      setGenerating(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!restaurantId) return;
    try {
      await aiVideoService.cancel(restaurantId, jobId);
      await load();
    } catch (err: any) {
      setError(err.message || 'Cancel failed.');
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Clapperboard className="w-6 h-6 text-amber-400" />AI Food Video Studio</h1>
          <p className="text-sm text-zinc-400 mt-1">Generate cinematic food videos from real platform templates.</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}

      {/* Credits summary */}
      {balance && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 mb-3"><Wallet className="w-4 h-4 text-amber-400" /> Video Credits</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800"><div className="text-2xl font-bold text-amber-400">{balance.balance}</div><div className="text-[11px] text-zinc-500 mt-0.5">Videos remaining</div></div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800"><div className="text-2xl font-bold text-white">{balance.used}</div><div className="text-[11px] text-zinc-500 mt-0.5">Videos used</div></div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800"><div className="text-2xl font-bold text-white">{balance.allowance}</div><div className="text-[11px] text-zinc-500 mt-0.5">Subscription allowance</div></div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800"><div className="text-2xl font-bold text-white">{balance.granted + balance.purchased}</div><div className="text-[11px] text-zinc-500 mt-0.5">Purchased / granted</div></div>
          </div>
          {noCredits && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              No videos remaining. Additional credits or a subscription are required before you can generate another video.
            </div>
          )}
        </div>
      )}

      {/* Studio form */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-5">
        <h2 className="text-sm font-semibold text-white">Create a video</h2>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2">1. Content Type</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map((ct) => (
              <button key={ct} onClick={() => handleContentTypeChange(ct)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${contentType === ct ? 'bg-amber-500 text-neutral-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{ct.toLowerCase()}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2">2. Template</label>
          <div className="flex flex-wrap gap-2">
            {filteredTemplates.length === 0 ? (
              <span className="text-xs text-zinc-500">No active templates for {contentType.toLowerCase()}.</span>
            ) : filteredTemplates.map((t) => (
              <button key={t.id} onClick={() => { setTemplateId(t.id); setVariantId(''); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${templateId === t.id ? 'bg-amber-500 text-neutral-950 border-amber-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500'}`}>{t.name}</button>
            ))}
          </div>
        </div>

        {selectedTemplate && (
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <div className="text-xs text-zinc-400">
              <span className="text-zinc-500">Aspect ratio:</span> {selectedTemplate.aspectRatio}
              {selectedTemplate.duration ? <span className="ml-3"><span className="text-zinc-500">Duration:</span> {selectedTemplate.duration}s</span> : null}
              {selectedTemplate.backgroundAsset ? (
                <div className="mt-2">
                  <span className="text-zinc-500">Background:</span>
                  <img src={selectedTemplate.backgroundAsset} alt="background" className="mt-1 h-16 rounded-lg object-cover border border-zinc-700" />
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2">3. Prompt / Animation Variant</label>
              <div className="flex flex-wrap gap-2">
                {(selectedTemplate.variants || []).map((v) => (
                  <button key={v.id} onClick={() => setVariantId(v.id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${variantId === v.id ? 'bg-amber-500 text-neutral-950 border-amber-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500'}`}>{v.name}</button>
                ))}
              </div>
              {variantId && (
                <p className="text-[11px] text-zinc-500 mt-2 font-mono">{(selectedTemplate.variants || []).find((v) => v.id === variantId)?.promptTemplate}</p>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2">4. Product Name</label>
          <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Truffle Arancini" className="w-full max-w-sm bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2">5. Food Image (optional)</label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading...' : sourceMediaId ? 'Replace image' : 'Upload image'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
            {sourceMediaId && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Image attached</span>}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !templateId || !variantId || noCredits}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Video
        </button>
      </div>

      {/* Jobs */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Generation Jobs</h2>
        {loading ? (
          <div className="p-8 text-center text-zinc-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-amber-400" /></div>
        ) : jobs.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-8">No videos generated yet.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div key={job.id} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle[job.status]}`}>{job.status}</span>
                      {job.template && <span className="text-[11px] text-zinc-400">{job.template.name}</span>}
                      {(job.status === 'QUEUED' || job.status === 'PROCESSING') && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1 truncate">
                      {(job.metadata as any)?.productName || 'Unnamed'} · {new Date(job.createdAt).toLocaleString()}
                    </div>
                    {job.status === 'PROCESSING' && <div className="text-[11px] text-amber-400/80 mt-1">Generating video with the AI provider…</div>}
                    {job.error && <div className="text-[11px] text-red-400 mt-1">Failed: {job.error}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.outputMedia && <span className="text-emerald-400" title="Output saved to Media Library"><CheckCircle2 className="w-4 h-4" /></span>}
                    {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
                      <button onClick={() => handleCancel(job.id)} className="text-zinc-500 hover:text-red-400" title="Cancel"><XCircle className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>

                {job.status === 'COMPLETED' && job.outputMedia && (
                  <video
                    controls
                    src={resolveMediaUrl((job.outputMedia as any)?.url)}
                    poster={(job.outputMedia as any)?.posterUrl ? resolveMediaUrl((job.outputMedia as any).posterUrl) : undefined}
                    className="mt-3 w-full max-w-sm aspect-video rounded-lg bg-black object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
