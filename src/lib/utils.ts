import { CITY_TO_PREF } from "./constants";

export function formatAmount(yen: number | null): string {
  if (yen == null) return "—";
  if (yen >= 100_000_000)
    return `${(yen / 100_000_000).toFixed(yen % 100_000_000 === 0 ? 0 : 1)}億円`;
  if (yen >= 10_000) return `${(yen / 10_000).toLocaleString()}万円`;
  return `${yen.toLocaleString()}円`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export type DeadlineState = "expired" | "urgent" | "soon" | "month" | "open" | "none";

export function deadlineState(iso: string | null): DeadlineState {
  const days = daysUntil(iso);
  if (days == null) return "none";
  if (days < 0) return "expired";
  if (days <= 7) return "urgent";
  if (days <= 14) return "soon";
  if (days <= 30) return "month";
  return "open";
}

export function deadlineLabel(iso: string | null): string {
  const days = daysUntil(iso);
  if (days == null) return "通年・締切未定";
  if (days < 0) return "受付終了";
  if (days === 0) return "本日締切";
  return `あと${days}日`;
}

export const DEADLINE_BADGE: Record<DeadlineState, string> = {
  expired: "bg-gray-200 text-gray-500",
  urgent: "bg-red-100 text-red-700",
  soon: "bg-orange-100 text-orange-800",
  month: "bg-amber-100 text-amber-800",
  open: "bg-green-100 text-green-800",
  none: "bg-slate-100 text-slate-600",
};

// 配列の重なり（共通要素）を返す
export function intersect(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

// 地域の照合：全国 / 完全一致 / 市区町村→都道府県 の包含 を考慮
export function regionMatches(grantRegions: string[], profileRegions: string[]): boolean {
  if (grantRegions.length === 0) return true; // 地域指定なし＝全国扱い
  if (grantRegions.includes("全国")) return true;
  const expand = (regions: string[]) => {
    const set = new Set(regions);
    for (const r of regions) {
      if (CITY_TO_PREF[r]) set.add(CITY_TO_PREF[r]); // 名古屋市 → 愛知県 も対象に
    }
    return set;
  };
  const g = expand(grantRegions);
  const p = expand(profileRegions);
  for (const r of Array.from(p)) if (g.has(r)) return true;
  return false;
}

export function industryMatches(grantIndustries: string[], profileIndustries: string[]): boolean {
  if (grantIndustries.length === 0) return true;
  if (grantIndustries.includes("全業種")) return true;
  return intersect(grantIndustries, profileIndustries).length > 0;
}
