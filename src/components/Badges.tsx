"use client";

import {
  APP_STATUS_COLORS,
  ALERT_COLORS,
  MATCH_STATUS_LABEL,
  type MatchStatus,
  PRE_APPLICATION_WARNING_TEXT,
} from "@/lib/constants";
import {
  DEADLINE_BADGE,
  deadlineLabel,
  deadlineState,
} from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const cls = APP_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

export function DeadlineBadge({ deadline }: { deadline: string | null }) {
  const state = deadlineState(deadline);
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${DEADLINE_BADGE[state]}`}>
      {deadlineLabel(deadline)}
    </span>
  );
}

export function AlertBadge({ type }: { type: string }) {
  const cls = ALERT_COLORS[type] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{type}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{children}</span>;
}

const REC_COLORS: Record<string, string> = {
  A: "bg-green-600 text-white",
  B: "bg-blue-600 text-white",
  C: "bg-amber-500 text-white",
  D: "bg-gray-400 text-white",
};

export function ScoreBadge({ score, recommendation }: { score: number; recommendation: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${REC_COLORS[recommendation] ?? "bg-gray-300"}`}>
        {recommendation}
      </span>
      <span className="text-sm font-semibold text-ink">{score}</span>
    </span>
  );
}

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const map: Record<MatchStatus, string> = {
    high_match: "bg-green-100 text-green-800",
    possible: "bg-blue-100 text-blue-800",
    needs_review: "bg-amber-100 text-amber-800",
    low_match: "bg-slate-100 text-slate-600",
    not_applicable: "bg-gray-100 text-gray-500",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status]}`}>{MATCH_STATUS_LABEL[status]}</span>;
}

export function PreApplicationWarning({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm text-red-800">
      <span className="font-bold">⚠ 申請前着手にご注意</span>
      <p className="mt-1 leading-relaxed">{PRE_APPLICATION_WARNING_TEXT}</p>
    </div>
  );
}
