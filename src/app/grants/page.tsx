"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchGrants, fetchMatches, fetchStatuses } from "@/lib/supabase";
import type { Grant, GrantMatch, AppStatusRow } from "@/lib/types";
import {
  REGIONS,
  INDUSTRIES,
  PURPOSES,
  ENTITY_TYPES,
  GRANT_TYPES,
  RECRUITMENT_STATUSES,
  APPLICATION_STATUSES,
} from "@/lib/constants";
import { daysUntil, regionMatches, industryMatches } from "@/lib/utils";
import { GrantCard } from "@/components/GrantCard";
import { NlSearchBox } from "@/components/NlSearchBox";

type Filters = {
  keyword: string;
  region: string;
  industry: string;
  purpose: string;
  entityType: string;
  grantType: string;
  recruitment: string;
  deadline: string; // all/open/30/14/7
  minAmount: string;
  preNg: boolean;
  professional: boolean;
  appStatus: string;
  recommend: string; // all/A/B/C
};

const EMPTY: Filters = {
  keyword: "",
  region: "",
  industry: "",
  purpose: "",
  entityType: "",
  grantType: "",
  recruitment: "",
  deadline: "all",
  minAmount: "",
  preNg: false,
  professional: false,
  appStatus: "",
  recommend: "all",
};

export default function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [matches, setMatches] = useState<GrantMatch[]>([]);
  const [statuses, setStatuses] = useState<AppStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(EMPTY);
  const [showNl, setShowNl] = useState(false);

  useEffect(() => {
    Promise.all([fetchGrants(), fetchMatches(), fetchStatuses()])
      .then(([g, m, s]) => {
        setGrants(g);
        setMatches(m);
        setStatuses(s);
      })
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  // 補助金ごとの最高スコアマッチ
  const bestByGrant = useMemo(() => {
    const map = new Map<string, GrantMatch>();
    for (const m of matches) {
      const cur = map.get(m.grant_id);
      if (!cur || m.match_score > cur.match_score) map.set(m.grant_id, m);
    }
    return map;
  }, [matches]);

  const statusByGrant = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of statuses) {
      if (!map.has(s.grant_id)) map.set(s.grant_id, new Set());
      map.get(s.grant_id)!.add(s.status);
    }
    return map;
  }, [statuses]);

  const filtered = useMemo(
    () => applyFilters(grants, f, bestByGrant, statusByGrant),
    [grants, f, bestByGrant, statusByGrant]
  );

  const set = (k: keyof Filters, v: any) => setF((p) => ({ ...p, [k]: v }));

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">補助金・助成金一覧</h1>
        <button onClick={() => setShowNl((v) => !v)} className="text-sm text-accent hover:underline">
          {showNl ? "フォーム検索に戻る" : "自然文AI検索を使う"}
        </button>
      </div>

      {showNl ? (
        <div className="mb-6 rounded-lg border bg-white p-4">
          <NlSearchBox />
        </div>
      ) : (
        <div className="mb-6 rounded-lg border bg-white p-4">
          <input
            type="text"
            value={f.keyword}
            onChange={(e) => set("keyword", e.target.value)}
            placeholder="キーワード（名称・実施主体・注意点など）"
            className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Sel label="目的（重視）" v={f.purpose} set={(v) => set("purpose", v)} opts={PURPOSES} />
            <Sel label="地域" v={f.region} set={(v) => set("region", v)} opts={REGIONS} />
            <Sel label="業種" v={f.industry} set={(v) => set("industry", v)} opts={INDUSTRIES} />
            <Sel label="法人種別" v={f.entityType} set={(v) => set("entityType", v)} opts={ENTITY_TYPES} />
            <Sel label="種別" v={f.grantType} set={(v) => set("grantType", v)} opts={GRANT_TYPES} />
            <Sel label="募集状態" v={f.recruitment} set={(v) => set("recruitment", v)} opts={RECRUITMENT_STATUSES} />
            <Sel label="進捗ステータス" v={f.appStatus} set={(v) => set("appStatus", v)} opts={APPLICATION_STATUSES} />
            <div>
              <label className="mb-1 block text-xs text-gray-400">締切</label>
              <select value={f.deadline} onChange={(e) => set("deadline", e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm">
                <option value="all">すべて</option>
                <option value="open">受付中のみ</option>
                <option value="30">30日以内</option>
                <option value="14">14日以内</option>
                <option value="7">7日以内</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">おすすめ度</label>
              <select value={f.recommend} onChange={(e) => set("recommend", e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm">
                <option value="all">すべて</option>
                <option value="A">A（80点〜）</option>
                <option value="B">B以上（60点〜）</option>
                <option value="C">C以上（40点〜）</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">補助上限額（万円以上）</label>
              <input type="number" value={f.minAmount} onChange={(e) => set("minAmount", e.target.value)} placeholder="例：100" className="w-full rounded-md border px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={f.preNg} onChange={(e) => set("preNg", e.target.checked)} /> 申請前着手NGの可能性のみ
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={f.professional} onChange={(e) => set("professional", e.target.checked)} /> 士業確認推奨のみ
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">{filtered.length} 件</span>
            <button onClick={() => setF(EMPTY)} className="text-sm text-accent hover:underline">条件をリセット</button>
          </div>
        </div>
      )}

      {!showNl &&
        (filtered.length === 0 ? (
          <p className="rounded-lg border bg-white p-8 text-center text-gray-400">条件に一致する補助金がありません。</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((g) => (
              <GrantCard key={g.id} grant={g} bestMatch={bestByGrant.get(g.id) ?? null} />
            ))}
          </div>
        ))}
    </div>
  );
}

function applyFilters(
  list: Grant[],
  f: Filters,
  best: Map<string, GrantMatch>,
  statusByGrant: Map<string, Set<string>>
): Grant[] {
  const kw = f.keyword.trim().toLowerCase();
  return list.filter((g) => {
    if (kw) {
      const hay = `${g.name} ${g.organization ?? ""} ${g.notes ?? ""} ${g.keywords.join(" ")} ${g.purposes.join(" ")}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (f.region && !regionMatches(g.regions, [f.region])) return false;
    if (f.industry && !industryMatches(g.industries, [f.industry])) return false;
    if (f.purpose && !g.purposes.includes(f.purpose) && !g.keywords.includes(f.purpose)) return false;
    if (f.entityType && g.entity_types.length > 0 && !g.entity_types.includes(f.entityType)) return false;
    if (f.grantType && g.grant_type !== f.grantType) return false;
    if (f.recruitment && g.recruitment_status !== f.recruitment) return false;
    if (f.preNg && !g.pre_application_ng) return false;
    if (f.professional && !g.requires_professional) return false;
    if (f.minAmount) {
      const min = Number(f.minAmount) * 10_000;
      if (g.max_amount == null || g.max_amount < min) return false;
    }
    if (f.appStatus) {
      const set = statusByGrant.get(g.id);
      if (!set || !set.has(f.appStatus)) return false;
    }
    if (f.recommend !== "all") {
      const b = best.get(g.id);
      const score = b?.match_score ?? -1;
      const limit = f.recommend === "A" ? 80 : f.recommend === "B" ? 60 : 40;
      if (score < limit) return false;
    }
    if (f.deadline !== "all") {
      const d = daysUntil(g.application_deadline);
      if (f.deadline === "open") {
        if (d != null && d < 0) return false;
      } else {
        const limit = Number(f.deadline);
        if (d == null || d < 0 || d > limit) return false;
      }
    }
    return true;
  });
}

function Sel({
  label,
  v,
  set,
  opts,
}: {
  label: string;
  v: string;
  set: (v: string) => void;
  opts: readonly string[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-400">{label}</label>
      <select value={v} onChange={(e) => set(e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm">
        <option value="">指定なし</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
