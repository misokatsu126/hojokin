"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchProfiles, updateDiscoveredItem } from "@/lib/supabase";
import type { DiscoveredItem, BusinessProfile } from "@/lib/types";
import { isSampleDiscovered } from "@/lib/sampleFilter";
import { formatDate, formatAmount, daysUntil } from "@/lib/utils";
import { ruleExtract } from "@/lib/discovery";
import {
  triageDiscovered, judgmentAccuracy, TRIAGE_META, STANDARD_SUBSIDIES, JGRANTS_PORTAL_URL,
  type TriageKey, type TriageResult,
} from "@/lib/triage";

type Entry = { item: DiscoveredItem; r: TriageResult };

// トップに出すカテゴリ表示順（締切・使える・条件確認・見逃しを上に）
const SHOW: TriageKey[] = ["deadline", "usable", "conditional", "missed", "next_time", "new"];
const MORE_HREF: Record<TriageKey, string> = {
  deadline: "/discovery/items?view=deadline",
  usable: "/discovery/items?view=high",
  conditional: "/discovery/items",
  missed: "/discovery/items",
  next_time: "/discovery/items",
  new: "/discovery/items?view=unreviewed",
  unusable: "/discovery/items",
};

export function TriageHome() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [it, p] = await Promise.all([fetchDiscoveredItems(), fetchProfiles()]);
    setItems(it);
    setProfiles(p);
  }
  useEffect(() => {
    load().catch(() => setUnavailable(true)).finally(() => setLoading(false));
  }, []);

  const accuracy = useMemo(() => judgmentAccuracy(profiles), [profiles]);

  const grouped = useMemo(() => {
    const active = items.filter(
      (i) => !isSampleDiscovered(i) && i.status !== "rejected" && i.status !== "ignored" && i.status !== "imported" && i.review_state !== "not_needed"
    );
    const g = new Map<TriageKey, Entry[]>();
    for (const item of active) {
      const r = triageDiscovered(item, profiles);
      if (!g.has(r.key)) g.set(r.key, []);
      g.get(r.key)!.push({ item, r });
    }
    for (const [, arr] of g) arr.sort((a, b) => b.r.score - a.r.score);
    return g;
  }, [items, profiles]);

  const count = (k: TriageKey) => grouped.get(k)?.length ?? 0;
  const totalActive = useMemo(() => [...grouped.values()].reduce((n, a) => n + a.length, 0), [grouped]);

  async function act(id: string, action: "applicant" | "not_needed" | "next") {
    setBusyId(id);
    try {
      if (action === "next") {
        // 「次回狙い」は専用ステータスが無いため、担当者メモに記録（非破壊・一覧で見える）
        await updateDiscoveredItem(id, { human_note: "次回狙い（次回公募で確認）" });
      } else {
        await updateDiscoveredItem(id, { review_state: action });
      }
      await load();
    } catch {
      /* noop */
    } finally {
      setBusyId(null);
    }
  }

  if (loading || unavailable) return null;

  const summary: { k: TriageKey; n: number }[] = [
    { k: "usable", n: count("usable") },
    { k: "conditional", n: count("conditional") },
    { k: "missed", n: count("missed") },
    { k: "deadline", n: count("deadline") },
    { k: "next_time", n: count("next_time") },
    { k: "new", n: count("new") },
  ];

  return (
    <div className="mb-8">
      <h1 className="text-xl font-bold text-ink sm:text-2xl">あなたが今使えそうな補助金</h1>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-gray-600">
        補助金に詳しくなくても大丈夫です。あなたの事業情報から、使える可能性・確認すべき条件・見逃し注意の制度を整理します。
      </p>

      {/* 判定精度＆未入力タスク */}
      <div className="mb-5 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ink">補助金判定精度</span>
            <div className="h-3 w-40 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full ${accuracy.percent >= 70 ? "bg-green-500" : accuracy.percent >= 40 ? "bg-amber-400" : "bg-orange-400"}`} style={{ width: `${accuracy.percent}%` }} />
            </div>
            <span className="text-sm font-bold text-ink">{accuracy.percent}%</span>
          </div>
          <Link href="/setup" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">事業情報を入力する →</Link>
        </div>
        {accuracy.missing.length > 0 && (
          <div className="mt-2 text-xs text-gray-600">
            <span className="font-medium text-amber-700">あと{accuracy.missing.length}つ入力すると見逃しリスクが下がります：</span>
            <span className="ml-1">{accuracy.missing.slice(0, 4).map((m) => m.label).join(" / ")}</span>
          </div>
        )}
      </div>

      {/* サマリーカード */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map(({ k, n }) => (
          <Link key={k} href={MORE_HREF[k]} className={`rounded-lg border p-3 text-center transition hover:shadow-sm ${TRIAGE_META[k].tone}`}>
            <div className="text-2xl font-bold text-ink">{n}</div>
            <div className="mt-0.5 text-[11px] font-medium text-gray-600">{TRIAGE_META[k].icon} {TRIAGE_META[k].label}</div>
          </Link>
        ))}
      </div>

      {totalActive === 0 ? (
        <div className="mb-6 rounded-lg border bg-white p-6 text-sm text-gray-600">
          <p className="font-semibold text-ink">今すぐ使える可能性が高い補助金は、まだ見つかっていません。</p>
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed">
            <li>条件確認が必要な補助金や、一般的によく使われる定番補助金は下に表示しています。</li>
            <li>事業情報を追加すると、見逃しリスクを下げられます。</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/discovery/sources" className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90">新しい制度を探す</Link>
            <Link href="/search" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">相談して探す</Link>
            <Link href="/setup" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">事業情報を登録する</Link>
          </div>
        </div>
      ) : (
        SHOW.filter((k) => count(k) > 0).map((k) => (
          <section key={k} className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">{TRIAGE_META[k].icon} {TRIAGE_META[k].label}（{count(k)}件）</h2>
              {count(k) > 3 && <Link href={MORE_HREF[k]} className="text-xs text-accent hover:underline">すべて見る →</Link>}
            </div>
            <div className="space-y-3">
              {grouped.get(k)!.slice(0, 3).map(({ item, r }) => (
                <TriageCard key={item.id} item={item} r={r} busy={busyId === item.id} onAct={act} />
              ))}
            </div>
          </section>
        ))
      )}

      {/* 一般的によく使われる補助金（一般確認推奨） */}
      <section className="mb-2">
        <h2 className="text-base font-bold text-ink">📌 一般的によく使われる補助金</h2>
        <p className="mb-2 text-xs text-gray-500">あなた向け判定とは別に、多くの中小企業・小規模事業者が確認する価値のある定番制度です（一般確認推奨）。</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {STANDARD_SUBSIDIES.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-2 rounded-lg border bg-white p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{s.name}</div>
                <div className="truncate text-xs text-gray-500">{s.use}</div>
              </div>
              <a href={JGRANTS_PORTAL_URL} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border px-3 py-1.5 text-xs text-emerald-700 hover:bg-gray-50">公式ポータルで探す ↗</a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TriageCard({ item, r, busy, onAct }: { item: DiscoveredItem; r: TriageResult; busy: boolean; onAct: (id: string, s: "applicant" | "not_needed" | "next") => void }) {
  const m = TRIAGE_META[r.key];
  const ex = ruleExtract(item);
  const isApplicant = item.review_state === "applicant";
  const text = item.raw_text ?? "";
  const dd = daysUntil(r.deadline);
  const recent = (() => { const d = daysUntil(item.fetched_at ?? item.detected_at); return d != null && d >= -7 && d <= 0; })();
  // 注意系バッジ（本文から検出）
  const flagBadges: string[] = [];
  if (ex.pre_application_ng_risk || /(交付決定前|事前着手|着手前|契約.{0,4}前|発注.{0,4}前)/.test(text)) flagBadges.push("発注前確認が必要");
  if (/(GビズID|gBizID|gビズ|ｇビズ)/i.test(text)) flagBadges.push("GビズIDが必要");
  if (/(商工会議所|商工会)/.test(text)) flagBadges.push("商工会議所確認が必要");
  if (ex.professional_check_recommended || /(社労士|社会保険労務士|行政書士|認定支援機関|税理士)/.test(text)) flagBadges.push("士業確認推奨");
  const showNext = r.key === "next_time" || r.key === "missed";
  return (
    <div className={`rounded-lg border-2 p-4 ${m.tone}`}>
      {/* 結論ファースト */}
      <p className="text-sm font-bold text-ink">結論：{r.conclusion}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${m.chip}`}>{m.icon} {m.label}</span>
        {r.score >= 70 && <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">あなた向け</span>}
        {recent && <span className="rounded bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800">新着</span>}
        {dd != null && dd >= 0 && dd <= 14 && <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">締切近い</span>}
        {r.score > 0 && <span className="rounded bg-white/70 px-2 py-0.5 text-[11px] font-bold text-ink" title="あなたに合いそう度">合いそう {r.score}</span>}
        {r.officialConfirmed ? <span className="rounded bg-white/70 px-2 py-0.5 text-[11px] text-emerald-700">公式確認済み</span> : <span className="rounded bg-white/70 px-2 py-0.5 text-[11px] text-gray-600">公式未確認</span>}
        {r.secondary && <span className="rounded bg-white/70 px-2 py-0.5 text-[11px] text-gray-600">民間サイトで発見</span>}
        {flagBadges.map((b) => <span key={b} className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{b}</span>)}
        {isApplicant && <span className="rounded bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">申請候補に追加済み</span>}
      </div>

      <h3 className="mt-2 text-base font-semibold text-ink">{item.title}</h3>

      {/* 大きく：金額・締切・今やること */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <KV label="対象地域" v={ex.target_regions.slice(0, 2).join("・") || "—"} />
        <KV label="補助額/補助率" v={ex.max_amount != null ? formatAmount(ex.max_amount) : ex.subsidy_rate || "—"} />
        <KV label="締切" v={r.deadline ? `${formatDate(r.deadline)}${daysUntil(r.deadline) != null && daysUntil(r.deadline)! >= 0 ? `（あと${daysUntil(r.deadline)}日）` : ""}` : "—"} hot={(() => { const d = daysUntil(r.deadline); return d != null && d >= 0 && d <= 14; })()} />
        <KV label="今から間に合う？" v={r.feas.label} />
      </div>

      <p className="mt-2 text-xs text-gray-600"><span className="text-gray-400">なぜ候補に：</span>{r.why}</p>

      {r.missing.length > 0 && (
        <p className="mt-1 text-xs text-amber-800"><span className="text-amber-500">確認したいこと：</span>{r.missing.join(" / ")}</p>
      )}
      {r.killers.length > 0 && (
        <p className="mt-1 text-xs text-red-700"><span className="text-red-400">注意：</span>{r.killers.join(" / ")}</p>
      )}
      {r.nextActions.length > 0 && (
        <p className="mt-1 text-xs text-orange-700"><span className="text-orange-400">今やること：</span>{r.nextActions.join(" → ")}</p>
      )}

      {/* ボタン（3〜5個） */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(item.official_url || item.url) && (
          <a href={item.official_url ?? item.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">🔗 公式ページを見る ↗</a>
        )}
        <button onClick={() => onAct(item.id, "applicant")} disabled={busy || isApplicant} className="rounded-md border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50">📝 申請候補にする</button>
        <Link href="/discovery/items" className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">条件を確認する</Link>
        {showNext
          ? <button onClick={() => onAct(item.id, "next")} disabled={busy} className="rounded-md border border-sky-300 px-3 py-1.5 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50">🔵 次回狙いに入れる</button>
          : null}
        <button onClick={() => onAct(item.id, "not_needed")} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50">今回は見送る</button>
      </div>
    </div>
  );
}

function KV({ label, v, hot }: { label: string; v: string; hot?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className={`truncate text-sm ${hot ? "font-semibold text-red-600" : "text-ink"}`}>{v}</div>
    </div>
  );
}
