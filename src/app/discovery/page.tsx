"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchDiscoveredItems,
  fetchExtractedCandidates,
  fetchImportReviews,
  fetchSourceSites,
} from "@/lib/supabase";
import type {
  DiscoveredItem,
  ExtractedGrantCandidate,
  ImportReview,
  SourceSite,
} from "@/lib/types";
import { TrustBadge, SourceTypeBadge, VerificationBadge } from "@/components/Badges";
import { DiscoveryNav } from "@/components/DiscoveryNav";
import { DiscoverySearchBox } from "@/components/DiscoverySearchBox";
import { HelpBox, StepGuide } from "@/components/DiscoveryHelp";
import { formatDate, daysUntil } from "@/lib/utils";

export default function DiscoveryDashboardPage() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [candidates, setCandidates] = useState<ExtractedGrantCandidate[]>([]);
  const [reviews, setReviews] = useState<ImportReview[]>([]);
  const [sites, setSites] = useState<SourceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchDiscoveredItems(),
      fetchExtractedCandidates(),
      fetchImportReviews(),
      fetchSourceSites(),
    ])
      .then(([it, c, r, s]) => {
        setItems(it);
        setCandidates(c);
        setReviews(r);
        setSites(s);
      })
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const isToday = (iso: string) => daysUntil(iso) === 0;

  const todayNew = items.filter((i) => isToday(i.detected_at)).length;
  const unreviewed = items.filter((i) => i.status === "unreviewed");
  const imported = items.filter((i) => i.status === "imported").length;
  const ignored = items.filter((i) => i.status === "ignored" || i.status === "rejected").length;
  const officialUnconfirmed = items.filter(
    (i) => !i.official_source_confirmed && (i.status === "unreviewed" || i.status === "candidate")
  );
  const oldYear = items.filter((i) => i.source_warning);
  const duplicates = items.filter((i) => i.duplicate_of);

  // 人間確認待ち：承認/却下の確認履歴がない抽出候補
  const decidedCandidateIds = useMemo(
    () =>
      new Set(
        reviews
          .filter((r) => r.review_status === "approved" || r.review_status === "rejected")
          .map((r) => r.extracted_grant_candidate_id)
      ),
    [reviews]
  );
  const awaitingReview = candidates.filter((c) => !decidedCandidateIds.has(c.id));

  // 高優先度の新着候補：高優先度の情報源由来 or 信頼度A/B かつ未確認
  const highPriorityNew = unreviewed.filter((i) => {
    const site = i.source_site_id ? siteMap.get(i.source_site_id) : null;
    return site?.priority === "high" || i.trust_level === "A" || i.trust_level === "B";
  });

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <DiscoveryNav />
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}（discovery_schema.sql を Supabase で実行済みか確認してください）
        </p>
      )}

      <h1 className="mb-4 text-xl font-bold text-ink">自動探索ダッシュボード</h1>

      <HelpBox title="この画面でできること">
        自動で集めた補助金の候補をまとめて見る画面です。今日の新着・未確認・締切が近いものなどがひと目で分かります。
        まだ候補が無いときは、下の「①情報源を登録 → ②全収集」を順に進めると補助金が集まります。
      </HelpBox>

      <StepGuide />

      <div className="mb-6 rounded-lg border bg-white p-4">
        <DiscoverySearchBox />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="今日の新着候補" value={todayNew} tone="sky" href="/discovery/items" />
        <Stat label="未確認の検知候補" value={unreviewed.length} tone="amber" href="/discovery/items" />
        <Stat label="AI抽出済み候補" value={candidates.length} tone="indigo" href="/discovery/review" />
        <Stat label="人間確認待ち" value={awaitingReview.length} tone="orange" href="/discovery/review" />
        <Stat label="本登録済み" value={imported} tone="green" href="/grants" />
        <Stat label="無視・却下" value={ignored} tone="gray" href="/discovery/items" />
        <Stat label="公式未確認候補" value={officialUnconfirmed.length} tone="orange" href="/discovery/items" />
        <Stat label="過年度候補" value={oldYear.length} tone="orange" href="/discovery/items" />
        <Stat label="重複候補" value={duplicates.length} tone="purple" href="/discovery/items" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="高優先度の新着候補" href="/discovery/items">
          {highPriorityNew.length === 0 ? (
            <Empty>高優先度の未確認候補はありません。</Empty>
          ) : (
            highPriorityNew.slice(0, 8).map((i) => (
              <Link key={i.id} href="/discovery/items" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
                <span className="min-w-0 truncate text-sm text-ink">{i.title}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <SourceTypeBadge type={i.source_category} />
                  <TrustBadge level={i.trust_level} />
                </span>
              </Link>
            ))
          )}
        </Panel>

        <Panel title="公式未確認の候補（要確認）" href="/discovery/items">
          {officialUnconfirmed.length === 0 ? (
            <Empty>公式未確認の候補はありません。</Empty>
          ) : (
            officialUnconfirmed.slice(0, 8).map((i) => (
              <Link key={i.id} href="/discovery/items" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
                <span className="min-w-0 truncate text-sm text-ink">{i.title}</span>
                <VerificationBadge status={i.verification_status} />
              </Link>
            ))
          )}
        </Panel>

        <Panel title="人間確認待ちのAI抽出候補" href="/discovery/review">
          {awaitingReview.length === 0 ? (
            <Empty>確認待ちの抽出候補はありません。</Empty>
          ) : (
            awaitingReview.slice(0, 8).map((c) => (
              <Link key={c.id} href="/discovery/review" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
                <span className="min-w-0 truncate text-sm text-ink">{c.name ?? "（名称未抽出）"}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs text-gray-400">確信度{c.confidence_score}</span>
                  <TrustBadge level={c.trust_level} />
                </span>
              </Link>
            ))
          )}
        </Panel>

        <Panel title="情報源別の最終巡回" href="/discovery/sources">
          {sites.length === 0 ? (
            <Empty>情報源が未登録です。情報源管理から登録してください。</Empty>
          ) : (
            sites.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
                <span className="min-w-0 truncate text-sm text-ink">{s.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-gray-400">{s.last_checked_at ? formatDate(s.last_checked_at) : "未巡回"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                    {s.is_active ? "稼働" : "停止"}
                  </span>
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>

      <div className="mt-6 rounded-lg border border-dashed bg-white p-4 text-xs leading-relaxed text-gray-500">
        <p className="mb-1 font-semibold text-gray-600">巡回ステータスについて</p>
        自動巡回（クローリング）・PDF自動読取・Jグランツ連携・LINE/Slack/メール通知は本MVPでは未実装です。
        現状は「情報源の管理」「手動での検知候補登録」「AI/ルールによる抽出」「人による公式確認と正式登録」までを提供します。
        将来、source_fetch_logs に巡回結果（成功／失敗／検知件数）を記録して、ここに巡回エラーを表示する設計です。
      </div>
    </div>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: number; tone: string; href: string }) {
  const colors: Record<string, string> = {
    sky: "text-sky-700",
    amber: "text-amber-700",
    indigo: "text-indigo-700",
    orange: "text-orange-700",
    green: "text-green-700",
    gray: "text-gray-600",
    purple: "text-purple-700",
  };
  return (
    <Link href={href} className="rounded-lg border bg-white p-3 text-center transition hover:border-accent">
      <div className={`text-2xl font-bold ${colors[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </Link>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <Link href={href} className="text-xs text-accent hover:underline">すべて見る</Link>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-3 text-sm text-gray-400">{children}</p>;
}
