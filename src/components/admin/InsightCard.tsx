import React, { useState } from 'react';
import { Lightbulb, TrendingUp, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

export interface InsightItem {
  type: string;
  title: string;
  explanation: string;
  metric: string;
  value: number | string;
  comparison: { current: number; previous: number; changePct: number } | null;
  sampleSize: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  supportingData: Record<string, any>;
  dateRange: { start: string; end: string };
  methodology: string;
}

const confidenceColor: Record<string, string> = {
  HIGH: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  LOW: 'bg-red-500/15 text-red-400 border-red-500/30',
};

function isRecommendation(type: string): boolean {
  return type.startsWith('RECOMMENDATION');
}

export const InsightCard: React.FC<{ insight: InsightItem }> = ({ insight }) => {
  const [open, setOpen] = useState(false);
  const rec = isRecommendation(insight.type);
  return (
    <div className={`rounded-2xl border p-4 ${rec ? 'border-emerald-500/30 bg-emerald-500/5' : insight.type.startsWith('ANOMALY') ? 'border-red-500/30 bg-red-500/5' : 'border-zinc-800 bg-zinc-900/50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${rec ? 'bg-emerald-500/15 text-emerald-400' : insight.type.startsWith('ANOMALY') ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {rec ? <TrendingUp className="w-4 h-4" /> : insight.type.startsWith('ANOMALY') ? <AlertTriangle className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase text-zinc-500">{insight.type}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${confidenceColor[insight.confidence]}`}>{insight.confidence}</span>
            </div>
            <h4 className="text-sm font-semibold text-white mt-1">{insight.title}</h4>
            <p className="text-xs text-zinc-400 mt-1">{insight.explanation}</p>
          </div>
        </div>
        <button onClick={() => setOpen(!open)} className="p-1 text-zinc-500 hover:text-white shrink-0">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
        {insight.value !== '' && <span><span className="text-zinc-400 font-semibold">Value:</span> {insight.value}</span>}
        <span><span className="text-zinc-400 font-semibold">Sample:</span> {insight.sampleSize}</span>
      </div>

      {open && (
        <div className="mt-3 p-3 rounded-xl bg-black/40 border border-zinc-800 text-[11px] space-y-2">
          <div>
            <div className="text-zinc-500 uppercase text-[10px] font-semibold mb-1">Evidence</div>
            <pre className="whitespace-pre-wrap break-words text-zinc-300 font-mono">{JSON.stringify(insight.supportingData, null, 2)}</pre>
          </div>
          <div>
            <div className="text-zinc-500 uppercase text-[10px] font-semibold mb-1">Methodology</div>
            <p className="text-zinc-300">{insight.methodology}</p>
          </div>
        </div>
      )}
    </div>
  );
};
