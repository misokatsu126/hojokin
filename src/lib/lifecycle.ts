// 補助金の「ライフサイクル状態」判定（受付開始日・締切日ベース）。
// データに開始日/締切が無くても null として安全に扱う。
import { daysUntil } from "./utils";

export type LifecycleKey =
  | "ended" // 終了済み
  | "before" // 受付前（30日超先に開始）
  | "today_start" // 本日開始
  | "soon_start" // 近日開始（30日以内）
  | "open" // 募集中
  | "deadline_7" // 締切7日以内
  | "deadline_30" // 締切30日以内
  | "unknown"; // 日付不明

export type Lifecycle = {
  key: LifecycleKey;
  label: string;
  tone: string; // バッジ用 Tailwind クラス
  startDays: number | null;
  deadlineDays: number | null;
};

const TONE: Record<LifecycleKey, string> = {
  ended: "bg-gray-100 text-gray-400",
  before: "bg-gray-100 text-gray-500",
  today_start: "bg-blue-100 text-blue-800",
  soon_start: "bg-sky-100 text-sky-800",
  open: "bg-green-100 text-green-800",
  deadline_7: "bg-red-100 text-red-700",
  deadline_30: "bg-orange-100 text-orange-800",
  unknown: "bg-slate-100 text-slate-500",
};
const LABEL: Record<LifecycleKey, string> = {
  ended: "終了済み",
  before: "受付前",
  today_start: "本日開始",
  soon_start: "近日開始",
  open: "募集中",
  deadline_7: "締切7日以内",
  deadline_30: "締切30日以内",
  unknown: "日付不明",
};

export function lifecycle(start: string | null | undefined, deadline: string | null | undefined): Lifecycle {
  const ds = daysUntil(start ?? null);
  const dd = daysUntil(deadline ?? null);
  let key: LifecycleKey = "unknown";
  if (dd != null && dd < 0) key = "ended";
  else if (ds != null && ds === 0) key = "today_start";
  else if (ds != null && ds > 0 && ds <= 30) key = "soon_start";
  else if (ds != null && ds > 30) key = "before";
  else if (dd != null && dd >= 0 && dd <= 7) key = "deadline_7";
  else if (dd != null && dd >= 0 && dd <= 30) key = "deadline_30";
  else if (dd != null || ds != null) key = "open";
  else key = "unknown";
  return { key, label: LABEL[key], tone: TONE[key], startDays: ds, deadlineDays: dd };
}

// 本文から「受付開始日」を推定（受付開始/募集開始/申請開始/開始日 の近くの日付）。無ければ null。
const DATE = /((?:令和|R)?\s*[0-9０-９]{1,4})\s*[年./-]\s*([0-9０-９]{1,2})\s*[月./-]\s*([0-9０-９]{1,2})\s*日?/;
function toNum(s: string): number {
  return Number(s.replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d))));
}
export function extractStartDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(?:受付開始|募集開始|申請開始|開始日|受付期間)[^0-9０-９]{0,12}/);
  if (!m) return null;
  const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40);
  const dm = after.match(DATE);
  if (!dm) return null;
  let y = toNum(dm[1]);
  if (y < 100) y += 2018; // 令和n年 → 概算（R6=2024）。簡易換算。
  const mo = String(toNum(dm[2])).padStart(2, "0");
  const d = String(toNum(dm[3])).padStart(2, "0");
  if (!y || mo === "00" || d === "00") return null;
  return `${y}-${mo}-${d}`;
}

// 「今から間に合う？」簡易判定（締切までの日数）
export function feasibility(deadline: string | null | undefined): { label: string; tone: string } {
  const d = daysUntil(deadline ?? null);
  if (d == null) return { label: "要確認", tone: "bg-slate-100 text-slate-500" };
  if (d < 0) return { label: "次回待ち", tone: "bg-gray-100 text-gray-400" };
  if (d >= 30) return { label: "今から十分間に合う", tone: "bg-green-100 text-green-800" };
  if (d >= 14) return { label: "急げば間に合う", tone: "bg-lime-100 text-lime-800" };
  if (d >= 7) return { label: "かなり急ぎ", tone: "bg-orange-100 text-orange-800" };
  return { label: "かなり厳しい", tone: "bg-red-100 text-red-700" };
}
