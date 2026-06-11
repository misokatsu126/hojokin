"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import {
  getProject, upsertProject, deleteProject, classifyForProject, orderAdvice, getTemplate,
  ORDER_STATUS_LABEL, PROJECT_CHECKLIST, type SpendingProject, type ProjectMatch,
} from "@/lib/projects";
import { TRIAGE_META, type TriageKey, type TriageResult } from "@/lib/triage";
import type { VerifyResult } from "@/lib/verify";

// 案件詳細での補助金カテゴリ表示順（最有力→条件確認→締切→見逃し→次回→新着）
const DETAIL_ORDER: TriageKey[] = ["usable", "conditional", "deadline", "missed", "next_time", "new", "unusable"];

// 案件全体の結論（最有力候補のカテゴリから）
function caseConclusion(match: ProjectMatch): { text: string; tone: string } {
  if (!match.top || match.total === 0) return { text: "対象外とは限りません。確認する価値がある制度がないか、情報を足して探しましょう。", tone: "bg-gray-50 text-gray-700" };
  switch (match.top.r.key) {
    case "usable": return { text: "この支出は、補助金を使える可能性が高いです。まず公式ページを確認しましょう。", tone: "bg-green-50 text-green-800" };
    case "conditional": return { text: "条件を確認すれば、使えるか判断できそうです。", tone: "bg-amber-50 text-amber-800" };
    case "deadline": return { text: "締切が近い候補があります。急いで確認しましょう。", tone: "bg-red-50 text-red-700" };
    case "next_time": return { text: "今回は終了していますが、次回狙う価値があります。", tone: "bg-sky-50 text-sky-800" };
    default: return { text: "対象外とは限りません。確認する価値があります。", tone: "bg-orange-50 text-orange-800" };
  }
}
import { formatAmount, formatDate, daysUntil } from "@/lib/utils";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<SpendingProject | null>(null);
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const p = getProject(id);
    if (!p) { setNotFound(true); setLoading(false); return; }
    setProject(p);
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, [id]);

  const match = useMemo(() => (project ? classifyForProject(project, items) : null), [project, items]);

  function toggleCheck(key: string) {
    if (!project) return;
    const next = { ...project, checklist: { ...project.checklist, [key]: !project.checklist[key] } };
    setProject(upsertProject(next));
  }
  function remove() {
    if (!project) return;
    if (!confirm("この支出案件を削除しますか？")) return;
    deleteProject(project.id);
    router.push("/projects");
  }

  if (notFound) return (
    <div className="py-12 text-center text-gray-500">
      <p className="mb-3">支出案件が見つかりませんでした。</p>
      <Link href="/projects" className="text-accent hover:underline">支出案件の一覧へ</Link>
    </div>
  );
  if (!project) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  const adv = orderAdvice(project.orderStatus);
  const doneCount = PROJECT_CHECKLIST.filter((c) => project.checklist[c.key]).length;
  const tpl = getTemplate(project.templateKey);
  const conclusion = match ? caseConclusion(match) : null;

  return (
    <div>
      <div className="mb-2 text-xs text-gray-400"><Link href="/projects" className="hover:underline">支出案件</Link> ／ 詳細</div>

      {/* ヘッダー */}
      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-ink">{project.name}</h1>
          <div className="flex gap-2">
            <Link href={`/projects/new?name=${encodeURIComponent(project.name)}`} className="hidden" />
            <button onClick={remove} className="rounded-md border px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">削除</button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {project.store && <span>🏬{project.store}</span>}
          {project.location && <span>📍{project.location}</span>}
          {project.entity && <span>🏢{project.entity}</span>}
          {project.industry && <span>{project.industry}</span>}
          {project.employees != null && <span>👥{project.employees}人</span>}
          {project.budget != null && <span>💰{formatAmount(project.budget)}</span>}
          {project.schedule && <span>🗓{project.schedule}</span>}
          <span>発注状況：{ORDER_STATUS_LABEL[project.orderStatus]}</span>
        </div>
        {project.memo && <p className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm text-gray-600">{project.memo}</p>}
      </div>

      {/* 1. 発注してよいか / 待つべきか（最重要・一番上） */}
      <div className={`mt-4 rounded-xl border-2 p-4 ${adv.tone}`}>
        <p className="text-base font-bold">{adv.wait ? "🟢" : "⚠️"} {adv.title}</p>
        <p className="mt-1 text-sm leading-relaxed">{adv.text}</p>
      </div>

      {/* 2. この案件の結論 */}
      {conclusion && (
        <div className={`mt-3 rounded-lg p-3 text-sm font-semibold ${conclusion.tone}`}>
          結論：{conclusion.text}
          {match && match.total > 0 && <span className="ml-1 text-xs font-normal opacity-80">（候補 {match.total} 件・見逃しリスク {match.missRisk}）</span>}
        </div>
      )}

      {tpl && (
        <div className="mt-3 grid gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 sm:grid-cols-2">
          <p className="sm:col-span-2"><span className="font-medium">注意点：</span>{tpl.caution}</p>
          <p><span className="font-medium">よくある対象経費：</span>{tpl.expenses.join("、")}</p>
          <p><span className="font-medium">関係しそうな補助金：</span>{tpl.genres.join("、")}</p>
          {tpl.killers.length > 0 && <p className="text-rose-700 sm:col-span-2"><span className="font-medium">ダメになりやすい条件：</span>{tpl.killers.join(" / ")}</p>}
        </div>
      )}

      {/* この支出で使えそうな補助金 */}
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold text-ink">この支出で使えそうな補助金</h2>
        {loading ? (
          <p className="rounded-lg border bg-white p-5 text-sm text-gray-400">補助金候補を読み込み中…</p>
        ) : !match || match.total === 0 ? (
          <div className="rounded-lg border bg-white p-5 text-sm text-gray-600">
            <p className="font-semibold text-ink">この支出に強く一致する補助金は、まだ見つかっていません。</p>
            <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed">
              <li>案件に「所在地・業種・用途」を足すと、見つかりやすくなります。</li>
              <li>一般的な定番補助金（IT導入・持続化・ものづくり等）も確認する価値があります。</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/search" className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90">相談して探す</Link>
              <Link href="/new-and-standard" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">定番補助金を見る</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {match.hidden > 0 && (
              <p className="rounded-md border border-dashed bg-slate-50 p-2 text-[11px] text-gray-500">
                公式確認待ち・参考情報・ノイズの可能性がある {match.hidden} 件は、検証前のためここには表示していません（<Link href="/discovery/search-review" className="text-accent hover:underline">管理者画面の検索結果レビュー</Link>で確認できます）。
              </p>
            )}
            {DETAIL_ORDER.filter((k) => (match.grouped.get(k)?.length ?? 0) > 0).map((k) => (
              <div key={k}>
                <h3 className="mb-2 text-sm font-bold text-ink">{TRIAGE_META[k].icon} {TRIAGE_META[k].label}（{match.grouped.get(k)!.length}件）</h3>
                <div className="space-y-2">
                  {match.grouped.get(k)!.slice(0, 5).map(({ item, r, v }) => (
                    <CandidateCard key={item.id} item={item} r={r} v={v} catKey={k} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 申請準備チェックリスト */}
      <section className="mt-6">
        <h2 className="mb-1 text-lg font-bold text-ink">申請準備チェックリスト</h2>
        <p className="mb-2 text-xs text-gray-500">この案件で確認すべきこと（{doneCount}/{PROJECT_CHECKLIST.length} 完了）。{prepHint(project, doneCount)}</p>
        <div className="grid gap-1.5 rounded-lg border bg-white p-4 sm:grid-cols-2">
          {PROJECT_CHECKLIST.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={!!project.checklist[c.key]} onChange={() => toggleCheck(c.key)} className="h-4 w-4" />
              <span className={project.checklist[c.key] ? "text-gray-400 line-through" : "text-ink"}>{c.label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

// 次に何をすべきかの一言
function prepHint(p: SpendingProject, done: number): string {
  if (!p.checklist["pre_order"]) return "まず発注前か確認してください。";
  if (!p.checklist["guideline"]) return "次に公式の公募要領を確認してください。";
  if (!p.checklist["estimate"]) return "見積取得の前に対象経費を確認しましょう。";
  if (done >= PROJECT_CHECKLIST.length) return "準備完了です。締切前に申請しましょう。";
  return "残りの確認を進めましょう。";
}

function CandidateCard({ item, r, v, catKey }: { item: DiscoveredItem; r: TriageResult; v: VerifyResult; catKey: TriageKey }) {
  const m = TRIAGE_META[catKey];
  const dd = daysUntil(r.deadline);
  return (
    <div className={`rounded-lg border p-3 ${m.tone}`}>
      <p className="text-sm font-bold text-ink">結論：{r.conclusion}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-ink">{item.title}</span>
        {r.score > 0 && <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-ink">合いそう {r.score}</span>}
        {r.deadline && <span className={`rounded bg-white/70 px-1.5 py-0.5 text-[10px] ${dd != null && dd <= 14 ? "font-semibold text-red-600" : "text-gray-600"}`}>締切 {formatDate(r.deadline)}{dd != null && dd >= 0 ? `（あと${dd}日）` : ""}</span>}
      </div>
      {/* 確認状況（弱い表現）と、なぜこの案件に関係するか */}
      <p className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] ${v.tone}`}>{v.label}</p>
      <p className="mt-1 text-xs text-gray-600"><span className="text-gray-400">関係する理由：</span>{v.projectRelationReason}</p>
      {v.matchedConditions.length > 0 && <p className="mt-0.5 text-xs text-green-700"><span className="text-green-500">一致している条件：</span>{v.matchedConditions.join("・")}</p>}
      {v.missingFields.length > 0 && <p className="mt-0.5 text-xs text-amber-800"><span className="text-amber-500">未確認項目：</span>{v.missingFields.slice(0, 5).join("・")}</p>}
      {r.killers.length > 0 && <p className="mt-1 text-xs text-red-700">注意：{r.killers.join(" / ")}</p>}
      {r.nextActions.length > 0 && <p className="mt-1 text-xs text-orange-700">今やること：{r.nextActions.slice(0, 3).join(" → ")}</p>}
      {(item.official_url || item.url) && (
        <a href={item.official_url ?? item.url ?? "#"} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">🔗 公式ページを見る ↗</a>
      )}
    </div>
  );
}
