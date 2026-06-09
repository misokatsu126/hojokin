"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems, fetchExtractedCandidates, fetchProfiles } from "@/lib/supabase";
import type { DiscoveredItem, ExtractedGrantCandidate, BusinessProfile } from "@/lib/types";
import { AUDIENCE_TYPE_LABEL, AUDIENCE_TYPE_COLORS, type AudienceType } from "@/lib/constants";
import { TrustBadge, DiscoveredStatusBadge } from "@/components/Badges";
import { scoreCandidateAgainstProfiles } from "@/lib/discovery";
import { daysUntil, formatDate } from "@/lib/utils";

type AudienceFilter = "all" | "business" | "individual";

function matchAudience(a: AudienceType | null | undefined, f: AudienceFilter): boolean {
  if (f === "all") return true;
  if (!a || a === "both" || a === "unknown") return true; // 両方・未判定は常に表示
  return a === f;
}

export function AutoCollectSection() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [candidates, setCandidates] = useState<ExtractedGrantCandidate[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [filter, setFilter] = useState<AudienceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function load() {
    const [it, c, p] = await Promise.all([fetchDiscoveredItems(), fetchExtractedCandidates(), fetchProfiles()]);
    setItems(it);
    setCandidates(c);
    setProfiles(p);
  }
  useEffect(() => {
    load()
      // discovery_collect_schema.sql 未実行など。ダッシュボード全体は壊さず、本セクションだけ隠す。
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, []);

  const fItems = useMemo(() => items.filter((i) => matchAudience(i.audience_type, filter)), [items, filter]);
  const fCands = useMemo(() => candidates.filter((c) => matchAudience(c.audience_type, filter)), [candidates, filter]);

  const todayNew = fItems.filter((i) => daysUntil(i.detected_at) === 0 && i.status !== "imported" && i.status !== "rejected");
  const unreviewed = fItems.filter((i) => i.status === "unreviewed");

  // 高相性候補：AI抽出候補を登録済み事業プロフィールと照合し、最高スコア順に。
  const scored = useMemo(
    () =>
      fCands
        .map((c) => ({ c, ...scoreCandidateAgainstProfiles(c, profiles) }))
        .sort((a, b) => b.bestScore - a.bestScore),
    [fCands, profiles]
  );
  const highAffinity = scored.filter((s) => s.bestScore >= 70);

  const deadlineSoon = fCands
    .filter((c) => {
      const d = daysUntil(c.deadline);
      return d != null && d >= 0 && d <= 30;
    })
    .sort((a, b) => daysUntil(a.deadline)! - daysUntil(b.deadline)!);

  async function runAll() {
    setRunning(true);
    setMsg(null);
    try {
      const r = await fetch("/api/discovery/run", { method: "POST" });
      const d = await r.json();
      setMsg(
        d.ok
          ? `自動収集を実行しました（新着 ${d.totals?.inserted ?? 0} 件・更新 ${d.totals?.updated ?? 0} 件）。`
          : `自動収集に失敗しました（${d.error ?? "不明"}）。`
      );
      await load();
    } catch (e: any) {
      setMsg(`実行エラー：${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  if (loading || unavailable) return null; // 取得不可時は静かに非表示（既存ダッシュボードは無傷）

  return (
    <div className="mb-6 rounded-lg border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">自動収集の新着（毎朝6時に自動更新・Jグランツ/J-Net21/ミラサポplus/公式）</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5 text-xs">
            {(["all", "business", "individual"] as AudienceFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2.5 py-1 transition ${filter === f ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {f === "all" ? "すべて" : f === "business" ? "事業者向け" : "個人向け"}
              </button>
            ))}
          </div>
          <button onClick={runAll} disabled={running} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
            {running ? "収集中…" : "今すぐ収集"}
          </button>
        </div>
      </div>

      {msg && <p className="mb-3 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800">{msg}</p>}

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="今日の新着" value={todayNew.length} tone="sky" />
        <MiniStat label="高相性候補" value={highAffinity.length} tone="green" />
        <MiniStat label="締切30日以内" value={deadlineSoon.length} tone="red" />
        <MiniStat label="未確認" value={unreviewed.length} tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Col title="今日見つかった候補" href="/discovery/items">
          {todayNew.length === 0 ? <Empty>本日の新着はありません。</Empty> : todayNew.slice(0, 6).map((i) => (
            <Row key={i.id} href="/discovery/items" title={i.title ?? "（無題）"}>
              <AudienceTag a={i.audience_type} />
              <TrustBadge level={i.trust_level} />
            </Row>
          ))}
        </Col>
        <Col title="高相性候補（事業との相性）" href="/discovery/review">
          {highAffinity.length === 0 ? <Empty>高相性の候補はありません（事業プロフィール登録で精度UP）。</Empty> : highAffinity.slice(0, 6).map(({ c, bestScore, bestProfile }) => (
            <Row key={c.id} href="/discovery/review" title={c.name ?? "（名称未抽出）"}>
              {bestProfile && <span className="shrink-0 text-[10px] text-gray-400">{bestProfile}</span>}
              <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800">{bestScore}</span>
            </Row>
          ))}
        </Col>
        <Col title="締切間近（AI抽出候補）" href="/discovery/review">
          {deadlineSoon.length === 0 ? <Empty>締切30日以内はありません。</Empty> : deadlineSoon.slice(0, 6).map((c) => (
            <Row key={c.id} href="/discovery/review" title={c.name ?? "（名称未抽出）"}>
              <span className="shrink-0 text-xs text-red-600">{formatDate(c.deadline)}</span>
            </Row>
          ))}
        </Col>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        正式登録済みの補助金は <Link href="/grants" className="text-accent hover:underline">補助金一覧</Link> に表示されます。
        収集候補は <Link href="/discovery" className="text-accent hover:underline">自動探索</Link> で確認・正式登録できます。
      </p>
    </div>
  );
}

function AudienceTag({ a }: { a: AudienceType | null | undefined }) {
  const key = (a ?? "unknown") as AudienceType;
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${AUDIENCE_TYPE_COLORS[key]}`}>{AUDIENCE_TYPE_LABEL[key]}</span>;
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const colors: Record<string, string> = { sky: "text-sky-700", amber: "text-amber-700", red: "text-red-700", green: "text-green-700" };
  return (
    <div className="rounded-md border bg-slate-50 p-2 text-center">
      <div className={`text-xl font-bold ${colors[tone]}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}

function Col({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-600">{title}</h3>
        <Link href={href} className="text-[11px] text-accent hover:underline">一覧</Link>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-gray-50">
      <span className="min-w-0 truncate text-xs text-ink">{title}</span>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-2 text-xs text-gray-400">{children}</p>;
}
