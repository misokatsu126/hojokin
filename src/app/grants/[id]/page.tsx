"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  fetchGrant,
  fetchProfiles,
  fetchMatchesForGrant,
  fetchStatuses,
  setStatus as saveStatus,
  fetchNotes,
  addNote,
} from "@/lib/supabase";
import type { Grant, BusinessProfile, GrantMatch, AppStatusRow, StatusNote, MatchResult } from "@/lib/types";
import { APPLICATION_STATUSES, RECRUITMENT_STATUSES } from "@/lib/constants";
import { formatAmount, formatDate, deadlineState } from "@/lib/utils";
import { lifecycle, priority, feasibility, preparation } from "@/lib/lifecycle";
import { DeadlineBadge, StatusBadge, Tag, PreApplicationWarning } from "@/components/Badges";
import { MatchResultCard } from "@/components/MatchResultCard";
import { ChecklistPanel } from "@/components/ChecklistPanel";

export default function GrantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [grant, setGrant] = useState<Grant | null>(null);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [matches, setMatches] = useState<GrantMatch[]>([]);
  const [statuses, setStatuses] = useState<AppStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);

  async function loadAll() {
    const [g, p, m, s] = await Promise.all([
      fetchGrant(id),
      fetchProfiles(),
      fetchMatchesForGrant(id),
      fetchStatuses(),
    ]);
    setGrant(g);
    setProfiles(p);
    setMatches(m);
    setStatuses(s.filter((x) => x.grant_id === id));
  }

  useEffect(() => {
    loadAll()
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleRematch() {
    setRematching(true);
    try {
      await fetch("/api/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_id: id, is_new: false }),
      });
      await loadAll();
    } catch (e: any) {
      alert(`再照合に失敗しました: ${e.message}`);
    } finally {
      setRematching(false);
    }
  }

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!grant) return <p className="text-gray-500">補助金が見つかりませんでした。</p>;

  const matchMap = new Map(matches.map((m) => [m.profile_id, m]));
  const statusMap = new Map(statuses.map((s) => [s.profile_id, s.status]));
  const dState = deadlineState(grant.application_deadline);

  // 判断サマリー：最高相性スコア → 優先度・今から間に合う？・準備の手間
  const bestScore = matches.reduce((mx, m) => Math.max(mx, m.match_score), 0);
  const lc = lifecycle(grant.application_start, grant.application_deadline);
  const pr = priority(bestScore, lc.key);
  const feas = feasibility(grant.application_deadline);
  const prep = preparation({
    text: `${grant.required_documents ?? ""} ${grant.notes ?? ""}`,
    professional: grant.requires_professional,
    preNg: grant.pre_application_ng,
  });

  return (
    <div>
      <Link href="/grants" className="mb-4 inline-block text-sm text-accent hover:underline">← 一覧に戻る</Link>

      {/* 概要 */}
      <div className="rounded-lg border bg-white p-6">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {grant.grant_type && <Tag>{grant.grant_type}</Tag>}
          {grant.org_type && <Tag>{grant.org_type}</Tag>}
          {grant.recruitment_status && <Tag>{grant.recruitment_status}</Tag>}
          <DeadlineBadge deadline={grant.application_deadline} />
          {grant.difficulty && grant.difficulty !== "不明" && <Tag>難易度：{grant.difficulty}</Tag>}
          {grant.selection_type && grant.selection_type !== "不明" && <Tag>{grant.selection_type}</Tag>}
        </div>

        <h1 className="mb-3 text-xl font-bold text-ink">{grant.name}</h1>

        {/* 判断サマリー（優先度・今から間に合う？・準備の手間・公式ページ） */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-3">
          {bestScore > 0 && (
            <span className={`rounded px-2 py-1 text-xs font-bold ${pr.tone}`} title={pr.label}>{pr.rank}：{pr.label}</span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${lc.tone}`}>{lc.icon} {lc.label}</span>
          <span className="text-xs text-gray-400">今から間に合う？</span>
          <span className={`rounded px-2 py-0.5 text-xs ${feas.tone}`}>{feas.label}</span>
          <span className="text-xs text-gray-400">準備の手間</span>
          <span className={`rounded px-2 py-0.5 text-xs ${prep.tone}`}>{prep.label}</span>
          {grant.official_url && (
            <a href={grant.official_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              🔗 公式ページを見る ↗
            </a>
          )}
        </div>

        {/* 警告類 */}
        <div className="mb-4 space-y-2">
          <PreApplicationWarning show={grant.pre_application_ng} />
          {["urgent", "soon"].includes(dState) && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              ⏰ 締切が迫っています（{formatDate(grant.application_deadline)}）。
            </p>
          )}
          {grant.recruitment_status === "不明" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              募集状態が不明です。最新の公式情報を確認してください。
            </p>
          )}
          {grant.early_termination_risk && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              予算上限到達による早期終了の可能性があります。早めの検討をおすすめします。
            </p>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="実施主体" value={grant.organization} />
          <Field label="対象者" value={grant.target_audience} />
          <Field label="対象地域" value={grant.regions.join("、") || "—"} />
          <Field label="対象業種" value={grant.industries.join("、") || "—"} />
          <Field label="対象法人種別" value={grant.entity_types.join("、") || "—"} />
          <Field label="対象経費" value={grant.expense_categories.join("、") || "—"} />
          <Field label="目的カテゴリ" value={grant.purposes.join("、") || "—"} />
          <Field label="補助率" value={grant.subsidy_rate} />
          <Field label="補助上限額" value={formatAmount(grant.max_amount)} />
          <Field label="最小補助額" value={formatAmount(grant.min_amount)} />
          <Field label="募集開始日" value={formatDate(grant.application_start)} />
          <Field label="締切日" value={formatDate(grant.application_deadline)} />
          <Field label="申請方法" value={grant.application_method} />
        </dl>

        {grant.required_documents && <Block title="必要書類" text={grant.required_documents} />}
        {grant.notes && <Block title="注意点" text={grant.notes} />}
        {grant.exclusion_conditions && <Block title="対象外条件" text={grant.exclusion_conditions} />}

        <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-sm">
          {grant.official_url && (
            <a href={grant.official_url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 hover:underline">公式ページを見る ↗</a>
          )}
          {grant.guideline_pdf_url && (
            <a href={grant.guideline_pdf_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">公募要領PDF ↗</a>
          )}
          <Link href={`/admin?edit=${grant.id}`} className="text-gray-500 hover:underline">この補助金を編集</Link>
        </div>
      </div>

      {/* 事業プロフィール別の対象可能性 */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">あなたの事業から見た可能性</h2>
          <button
            onClick={handleRematch}
            disabled={rematching}
            className="rounded-md border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent hover:text-white disabled:opacity-50"
          >
            {rematching ? "照合中…" : "全事業を再照合"}
          </button>
        </div>

        {profiles.length === 0 ? (
          <p className="rounded-lg border bg-white p-5 text-sm text-gray-500">
            事業プロフィールが未登録です。<Link href="/profiles" className="text-accent hover:underline">事業プロフィール</Link>を登録してください。
          </p>
        ) : (
          <div className="space-y-4">
            {profiles.map((p) => (
              <ProfileMatchSection
                key={p.id}
                grant={grant}
                profile={p}
                storedMatch={matchMap.get(p.id) ?? null}
                currentStatus={statusMap.get(p.id) ?? "未確認"}
                onStatusSaved={loadAll}
              />
            ))}
          </div>
        )}
      </section>

      {/* 申請前チェック */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-ink">申請前チェック</h2>
        <ChecklistPanel grantId={grant.id} officialUrl={grant.official_url} sourceUrl={grant.guideline_pdf_url} />
      </section>
    </div>
  );
}

function ProfileMatchSection({
  grant,
  profile,
  storedMatch,
  currentStatus,
  onStatusSaved,
}: {
  grant: Grant;
  profile: BusinessProfile;
  storedMatch: GrantMatch | null;
  currentStatus: string;
  onStatusSaved: () => Promise<void>;
}) {
  const [result, setResult] = useState<MatchResult | null>(storedMatch);
  const [engine, setEngine] = useState<"ai" | "rule" | undefined>(storedMatch?.engine);
  const [judging, setJudging] = useState(false);
  const [status, setStatusState] = useState(currentStatus);
  const [notes, setNotes] = useState<StatusNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function loadNotes() {
    const n = await fetchNotes(grant.id, profile.id);
    setNotes(n);
  }

  useEffect(() => {
    if (expanded && notes.length === 0) loadNotes().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function rejudge() {
    setJudging(true);
    try {
      const r = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant, profile }),
      });
      const data = await r.json();
      setResult(data);
      setEngine(data.engine);
    } catch {
      // noop
    } finally {
      setJudging(false);
    }
  }

  async function changeStatus(s: string) {
    setStatusState(s);
    await saveStatus(grant.id, profile.id, s);
    await onStatusSaved();
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    await addNote(grant.id, profile.id, noteText.trim(), status);
    setNoteText("");
    await loadNotes();
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-accent">{profile.name}</span>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={() => setExpanded((v) => !v)} className="text-sm text-accent hover:underline">
            {expanded ? "閉じる" : "詳細"}
          </button>
        </div>
      </div>

      <div className="p-3">
        {result ? (
          <MatchResultCard result={result} engine={engine} />
        ) : (
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-4 text-sm text-gray-500">
            まだ判定がありません。
            <button onClick={rejudge} disabled={judging} className="rounded-md bg-accent px-3 py-1.5 text-white hover:opacity-90 disabled:opacity-50">
              {judging ? "判定中…" : "判定する"}
            </button>
          </div>
        )}

        {result && (
          <button onClick={rejudge} disabled={judging} className="mt-2 text-xs text-gray-400 hover:text-accent hover:underline">
            {judging ? "再判定中…" : "この事業だけ再判定する"}
          </button>
        )}

        {expanded && (
          <div className="mt-4 border-t pt-3">
            <h4 className="mb-2 text-sm font-semibold text-ink">ステータスメモ</h4>
            <div className="mb-2 flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNote()}
                placeholder="例：対象経費に空調が含まれるか要確認"
                className="flex-1 rounded-md border px-3 py-1.5 text-sm"
              />
              <button onClick={submitNote} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">追加</button>
            </div>
            {notes.length === 0 ? (
              <p className="text-xs text-gray-400">メモはまだありません。</p>
            ) : (
              <ul className="space-y-1.5">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-gray-600">
                    <span className="text-gray-700">{n.note}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {n.status ? `[${n.status}] ` : ""}{formatDate(n.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-ink">{value || "—"}</dd>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-4">
      <h2 className="mb-1 text-sm font-semibold text-ink">{title}</h2>
      <p className="whitespace-pre-wrap text-sm text-gray-600">{text}</p>
    </div>
  );
}
