"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchGrants,
  fetchProfiles,
  fetchMatches,
  fetchAlerts,
  fetchStatuses,
} from "@/lib/supabase";
import type { Grant, BusinessProfile, GrantMatch, Alert, AppStatusRow } from "@/lib/types";
import { deadlineState, daysUntil, formatDate } from "@/lib/utils";
import { APPLICATION_STATUSES } from "@/lib/constants";
import { NlSearchBox } from "@/components/NlSearchBox";
import { AutoCollectSection } from "@/components/AutoCollectSection";
import { TopQuickActions } from "@/components/TopQuickActions";
import { TodayAdded } from "@/components/TodayAdded";
import { DiagnosisDashboard } from "@/components/DiagnosisDashboard";
import { DeadlineTimeline } from "@/components/DeadlineTimeline";
import { AlertBadge, ScoreBadge, DeadlineBadge } from "@/components/Badges";

export default function DashboardPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [matches, setMatches] = useState<GrantMatch[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statuses, setStatuses] = useState<AppStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchGrants(), fetchProfiles(), fetchMatches(), fetchAlerts(), fetchStatuses()])
      .then(([g, p, m, a, s]) => {
        setGrants(g);
        setProfiles(p);
        setMatches(m);
        setAlerts(a);
        setStatuses(s);
      })
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const grantMap = useMemo(() => new Map(grants.map((g) => [g.id, g])), [grants]);
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const highAlerts = alerts.filter((a) => a.alert_type === "高相性");
  const unread = alerts.filter((a) => !a.is_read);
  const newAlerts = alerts.filter((a) => a.alert_type === "新着");

  const deadlineGrants = useMemo(
    () =>
      grants
        .filter((g) => ["urgent", "soon", "month"].includes(deadlineState(g.application_deadline)))
        .sort((a, b) => (daysUntil(a.application_deadline)! - daysUntil(b.application_deadline)!)),
    [grants]
  );
  const within30 = deadlineGrants.length;
  const thisMonth = useMemo(() => {
    const now = new Date();
    return grants.filter((g) => {
      if (!g.application_deadline) return false;
      const d = new Date(g.application_deadline);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && daysUntil(g.application_deadline)! >= 0;
    }).length;
  }, [grants]);

  const planned = statuses.filter((s) => s.status === "申請予定");
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of statuses) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [statuses]);

  // 事業別おすすめ（各プロフィールの最高スコア上位）
  const perProfileTop = useMemo(() => {
    return profiles.map((p) => {
      const ms = matches
        .filter((m) => m.profile_id === p.id && m.match_score >= 60)
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, 3);
      return { profile: p, matches: ms };
    });
  }, [profiles, matches]);

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;
  if (error) return <ErrorBox message={error} />;

  const empty = grants.length === 0 && profiles.length === 0;

  // 事業情報の登録不足を判定（brief §25）：未登録、または地域・業種が空のプロフィールしかない
  const profileWeak =
    profiles.length === 0 ||
    profiles.every((p) => p.regions.length === 0 || p.industries.length === 0);

  return (
    <div>
      {/* ヒーロー：このサイトの主役は「あなたが使えるかもしれない補助金・助成金」 */}
      <div className="mb-6 rounded-xl border bg-gradient-to-br from-sky-50 to-white p-5">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">あなたが使えるかもしれない補助金・助成金を探します</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          補助金・助成金は、どこの何が自分に使えるのか分かりにくいものです。
          このサイトは、登録した事業情報をもとに使える可能性がある制度を自動で探し、確認すべき順番に並べます。
          AI判定はあくまで候補探しの補助です。最終判断は必ず公式ページで確認してください。
        </p>
      </div>

      {/* 事業情報の登録不足バナー（精度向上の導線） */}
      {profileWeak && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-900">
            <p className="font-semibold">まだ事業情報が少ないため、候補の精度が低い可能性があります。</p>
            <p className="mt-0.5 text-xs text-amber-700">所在地・業種・法人種別・やりたいことを登録すると、あなたに合う制度を見つけやすくなります。</p>
          </div>
          <Link href="/setup" className="shrink-0 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            事業情報を登録する →
          </Link>
        </div>
      )}

      {/* 診断ダッシュボード：確認すべき件数・優先度別・地域別をひと目で */}
      <DiagnosisDashboard />

      {/* 相談して探す（主役の導線。検索ではなく“相談”） */}
      <div className="mb-6 rounded-lg border bg-white p-4">
        <h2 className="mb-1 text-base font-bold text-ink">やりたいことから相談して探す</h2>
        <p className="mb-3 text-xs text-gray-500">制度名を知らなくても大丈夫です。やりたいこと・困っていることを、そのまま入力してください。</p>
        <NlSearchBox />
      </div>

      {/* あなたが使えるかもしれない制度（優先順位付きカード） */}
      <AutoCollectSection />

      <TopQuickActions />

      {empty && (
        <div className="mb-6 rounded-lg border border-dashed bg-white p-6 text-sm text-gray-500">
          まずは <Link href="/setup" className="text-accent hover:underline">事業プロフィール</Link> を登録し、
          <Link href="/discovery/sources" className="text-accent hover:underline">補助金の自動収集</Link> を実行してください。
          登録時に全事業と自動照合され、使える可能性がある制度がここに並びます。
        </div>
      )}

      {/* ここから下は登録済み制度の管理状況（台帳） */}
      <h2 className="mb-3 mt-8 border-t pt-6 text-sm font-semibold text-gray-500">登録済み制度の管理状況</h2>

      {/* サマリー数値 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="特に合いそう" value={highAlerts.length} tone="green" />
        <Stat label="未確認のお知らせ" value={unread.length} tone="amber" />
        <Stat label="30日以内に締切" value={within30} tone="red" />
        <Stat label="今月締切" value={thisMonth} tone="orange" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 特に合いそうな制度 */}
        <Panel title="あなたに特に合いそうな制度（80点以上）" href="/grants">
          {highAlerts.length === 0 ? (
            <Empty>高相性のアラートはありません。</Empty>
          ) : (
            highAlerts.slice(0, 6).map((a) => {
              const g = grantMap.get(a.grant_id);
              const p = profileMap.get(a.profile_id);
              if (!g) return null;
              return (
                <AlertRow key={a.id} grantId={g.id} grantName={g.name} profileName={p?.name ?? ""} type={a.alert_type} score={a.match_score} />
              );
            })
          )}
        </Panel>

        {/* 締切間近 */}
        <Panel title="締切30日以内" href="/grants">
          {deadlineGrants.length === 0 ? (
            <Empty>締切が近い補助金はありません。</Empty>
          ) : (
            deadlineGrants.slice(0, 6).map((g) => (
              <Link key={g.id} href={`/grants/${g.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
                <span className="truncate text-sm text-ink">{g.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-gray-400">{formatDate(g.application_deadline)}</span>
                  <DeadlineBadge deadline={g.application_deadline} />
                </span>
              </Link>
            ))
          )}
        </Panel>

        {/* 未確認のお知らせ */}
        <Panel title="未確認のお知らせ" href="/grants">
          {unread.length === 0 ? (
            <Empty>未確認のアラートはありません。</Empty>
          ) : (
            unread.slice(0, 6).map((a) => {
              const g = grantMap.get(a.grant_id);
              const p = profileMap.get(a.profile_id);
              if (!g) return null;
              return (
                <AlertRow key={a.id} grantId={g.id} grantName={g.name} profileName={p?.name ?? ""} type={a.alert_type} score={a.match_score} />
              );
            })
          )}
        </Panel>

        {/* 申請予定 */}
        <Panel title="申請予定の補助金" href="/grants">
          {planned.length === 0 ? (
            <Empty>申請予定の補助金はありません。</Empty>
          ) : (
            planned.slice(0, 6).map((s) => {
              const g = grantMap.get(s.grant_id);
              const p = profileMap.get(s.profile_id);
              if (!g) return null;
              return (
                <Link key={s.id} href={`/grants/${g.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
                  <span className="truncate text-sm text-ink">{g.name}</span>
                  <span className="shrink-0 text-xs text-gray-400">{p?.name}</span>
                </Link>
              );
            })
          )}
        </Panel>
      </div>

      {/* ステータス別件数 */}
      {statuses.length > 0 && (
        <div className="mt-6 rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">ステータス別件数</h2>
          <div className="flex flex-wrap gap-2">
            {APPLICATION_STATUSES.filter((s) => statusCounts[s]).map((s) => (
              <span key={s} className="rounded-md bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {s} <strong>{statusCounts[s]}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 事業別おすすめ */}
      {perProfileTop.some((x) => x.matches.length > 0) && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-ink">事業ごとのおすすめ</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {perProfileTop.map(({ profile, matches: ms }) => (
              <div key={profile.id} className="rounded-lg border bg-white p-3">
                <h3 className="mb-2 text-sm font-semibold text-accent">{profile.name}</h3>
                {ms.length === 0 ? (
                  <p className="text-xs text-gray-400">おすすめ候補なし</p>
                ) : (
                  <ul className="space-y-1.5">
                    {ms.map((m) => {
                      const g = grantMap.get(m.grant_id);
                      if (!g) return null;
                      return (
                        <li key={m.id} className="flex items-center justify-between gap-2">
                          <Link href={`/grants/${g.id}`} className="truncate text-sm text-ink hover:text-accent hover:underline">
                            {g.name}
                          </Link>
                          <ScoreBadge score={m.match_score} recommendation={m.recommendation} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 締切タイムライン */}
      <DeadlineTimeline />

      {/* 本日追加された補助金・助成金 */}
      <TodayAdded />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const colors: Record<string, string> = {
    green: "text-green-700",
    amber: "text-amber-700",
    red: "text-red-700",
    orange: "text-orange-700",
  };
  return (
    <div className="rounded-lg border bg-white p-3 text-center">
      <div className={`text-2xl font-bold ${colors[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
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

function AlertRow({
  grantId,
  grantName,
  profileName,
  type,
  score,
}: {
  grantId: string;
  grantName: string;
  profileName: string;
  type: string;
  score: number | null;
}) {
  return (
    <Link href={`/grants/${grantId}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{grantName}</span>
        <span className="text-xs text-gray-400">{profileName}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {score != null && <span className="text-xs font-semibold text-ink">{score}</span>}
        <AlertBadge type={type} />
      </span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-3 text-sm text-gray-400">{children}</p>;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      <p className="mb-1 font-semibold">読み込みエラー</p>
      <p>{message}</p>
      <p className="mt-2 text-xs text-red-500">.env.local の Supabase 設定と schema.sql の実行を確認してください。</p>
    </div>
  );
}
