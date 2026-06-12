"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import {
  getProject, upsertProject, deleteProject, syncProjectsFromSupabase, classifyForProject, orderAdvice, getTemplate, projectTasks,
  missingInfo, estimateRange, generateConsultMemo, generateEstimateMemo,
  ORDER_STATUS_LABEL, PROJECT_CHECKLIST, type SpendingProject, type ProjectMatch, type ProjectTask,
} from "@/lib/projects";
import { TRIAGE_META, type TriageKey, type TriageResult } from "@/lib/triage";
import type { VerifyResult } from "@/lib/verify";
import { getCoreProgramChecks, coreOfficialHref, coreGuidelineHref, coreFreshness, OFFICIAL_STATUS_LABEL, OFFICIAL_STATUS_TONE, type CoreProgramCheck, type CoreGroup } from "@/lib/coreMaster";
import { ApplicationRoadmap, ConsultRouting } from "@/components/ApplicationRoadmap";

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
  const [highlightTask, setHighlightTask] = useState<string | null>(null);
  const [showDiagnosis, setShowDiagnosis] = useState(false);

  useEffect(() => {
    const applyLocal = () => {
      const p = getProject(id);
      if (p) { setProject(p); setNotFound(false); }
      return p;
    };
    const local = applyLocal();
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      setHighlightTask(q.get("task"));
      setShowDiagnosis(q.get("created") === "1");
    }
    const onChange = () => applyLocal();
    window.addEventListener("projects-changed", onChange);
    // クラウド同期：別端末で作られた案件もここで取り込む。見つからない場合のみ同期後に判定。
    syncProjectsFromSupabase()
      .then(() => { if (!getProject(id) && !local) setNotFound(true); })
      .catch(() => { if (!local) setNotFound(true); });
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
    return () => window.removeEventListener("projects-changed", onChange);
  }, [id]);

  const match = useMemo(() => (project ? classifyForProject(project, items) : null), [project, items]);
  const tasks = useMemo(() => (project ? projectTasks(project, match ?? undefined) : []), [project, match]);
  const coreChecks = useMemo(() => (project ? getCoreProgramChecks(project) : []), [project]);

  const [memo, setMemo] = useState<{ kind: "consult" | "estimate"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function fillMissing(key: string) {
    if (!project) return;
    if (key === "budget") { const v = window.prompt("見積・予算（万円）"); if (v) setProject(upsertProject({ ...project, budget: (Number(v.replace(/[^0-9]/g, "")) || 0) * 10000 })); return; }
    if (key === "employees") { const v = window.prompt("従業員数（人）"); if (v) setProject(upsertProject({ ...project, employees: Number(v.replace(/[^0-9]/g, "")) || null })); return; }
    if (key === "location") { const v = window.prompt("どこで使いますか？（市区町村）"); if (v) setProject(upsertProject({ ...project, location: v.trim() })); return; }
    if (key === "industry") { const v = window.prompt("業種は？"); if (v) setProject(upsertProject({ ...project, industry: v.trim() })); return; }
    if (key === "schedule") { const v = window.prompt("いつ頃実施しますか？"); if (v) setProject(upsertProject({ ...project, schedule: v.trim() })); return; }
  }
  async function copyMemo() {
    if (!memo) return;
    try { await navigator.clipboard.writeText(memo.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  }

  function setCoreCheck(key: string, val: "done" | "skip") {
    if (!project) return;
    const cur = project.coreChecks?.[key];
    const next = { ...project, coreChecks: { ...project.coreChecks, [key]: cur === val ? undefined as any : val } };
    if (next.coreChecks[key] === undefined) delete next.coreChecks[key];
    setProject(upsertProject(next));
  }

  function toggleCheck(key: string) {
    if (!project) return;
    const next = { ...project, checklist: { ...project.checklist, [key]: !project.checklist[key] } };
    setProject(upsertProject(next));
  }

  // 「次にやること」の完了：チェック項目は true に、従業員数/予算は入力して消す
  function completeTask(t: ProjectTask) {
    if (!project) return;
    if (t.taskKey === "employees") {
      const v = window.prompt("従業員数（人）を入力してください");
      if (v != null && v.trim()) setProject(upsertProject({ ...project, employees: Number(v.replace(/[^0-9]/g, "")) || null }));
      return;
    }
    if (t.taskKey === "budget") {
      const v = window.prompt("予算（万円）を入力してください");
      if (v != null && v.trim()) setProject(upsertProject({ ...project, budget: (Number(v.replace(/[^0-9]/g, "")) || 0) * 10000 }));
      return;
    }
    setProject(upsertProject({ ...project, checklist: { ...project.checklist, [t.taskKey]: true } }));
  }
  function remove() {
    if (!project) return;
    if (!confirm("この補助金チェックを削除しますか？")) return;
    deleteProject(project.id);
    router.push("/projects");
  }

  if (notFound) return (
    <div className="py-12 text-center text-gray-500">
      <p className="mb-3">補助金チェックが見つかりませんでした。</p>
      <Link href="/projects" className="text-accent hover:underline">補助金チェックの一覧へ</Link>
    </div>
  );
  if (!project) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  const adv = orderAdvice(project.orderStatus);
  const doneCount = PROJECT_CHECKLIST.filter((c) => project.checklist[c.key]).length;
  const tpl = getTemplate(project.templateKey);
  const conclusion = match ? caseConclusion(match) : null;

  return (
    <div>
      <div className="mb-2 text-xs text-gray-400"><Link href="/projects" className="hover:underline">補助金チェック</Link> ／ 詳細</div>

      {/* 作成直後の診断結果 */}
      {showDiagnosis && (
        <div className="mb-4 rounded-xl border-2 border-accent/40 bg-accent/5 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">診断結果：{project.name || "（名称未設定）"}</h2>
            <button onClick={() => setShowDiagnosis(false)} className="text-xs text-gray-400 hover:text-gray-600">✕ 閉じる</button>
          </div>
          <div className={`rounded-lg border p-3 ${adv.tone}`}>
            <p className="text-sm font-bold">{adv.icon} 発注判断：{adv.title}</p>
            <p className="mt-0.5 text-xs">{adv.text}</p>
          </div>
          {coreChecks.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-600">まず確認すべき定番制度</p>
              <ol className="mt-1 list-decimal pl-5 text-sm text-ink">
                {coreChecks.slice(0, 3).map((c) => <li key={c.key}>{c.name}<span className="ml-1 text-[11px] text-green-700">（{c.confidenceLabel}）</span></li>)}
              </ol>
            </div>
          )}
          {tasks.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-600">今日やる申請準備</p>
              <ol className="mt-1 list-decimal pl-5 text-sm text-ink">
                {tasks.slice(0, 3).map((t) => <li key={t.taskKey}>{t.action}</li>)}
              </ol>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {coreChecks[0] && <a href={coreOfficialHref(coreChecks[0])} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:opacity-90">🔗 公式情報を確認する</a>}
            {tasks[0] && <button onClick={() => completeTask(tasks[0])} className="rounded-md border border-green-300 px-4 py-2 text-xs font-medium text-green-700 hover:bg-green-50">このタスクを完了する</button>}
            <button onClick={() => setShowDiagnosis(false)} className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">詳しく見る</button>
          </div>
        </div>
      )}

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
        <p className="text-base font-bold">{adv.icon} {adv.title}</p>
        <p className="mt-1 text-sm leading-relaxed">{adv.text}</p>
        {!adv.wait && (
          <div className="mt-2 rounded-md bg-white/60 p-2 text-xs text-gray-700">
            <p className="font-medium">それでもできること（あきらめないで）：</p>
            <ul className="mt-0.5 list-disc pl-5">
              <li>追加の費用や別の費用で使える制度がないか確認する</li>
              <li>次回公募を確認する（次回狙い）</li>
              <li>専門家（商工会議所・士業）に相談する</li>
            </ul>
          </div>
        )}
      </div>

      {/* 足りない情報だけ聞く（最大3件） */}
      {missingInfo(project).length > 0 && (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="mb-1.5 text-sm font-semibold text-sky-900">判定を強くするために、あと{missingInfo(project).length}つだけ教えてください</p>
          <div className="flex flex-wrap gap-2">
            {missingInfo(project).map((m) => (
              <button key={m.key} onClick={() => fillMissing(m.key)} className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs text-sky-800 hover:bg-sky-100">{m.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* 概算の補助額イメージ（断定しない） */}
      {(() => {
        const est = estimateRange(project);
        return est ? (
          <div className="mt-3 rounded-lg border bg-white p-3 text-sm">
            <p className="font-semibold text-ink">概算イメージ</p>
            <p className="mt-0.5 text-gray-700">予算：{formatAmount(est.budget)}／補助率の例：{est.rateLabel}／戻る可能性のある金額：{formatAmount(est.low)}〜{formatAmount(est.high)} 程度</p>
            <p className="mt-0.5 text-[11px] text-gray-400">※ 制度・要件・採択結果により変わります。最終判断は公式サイトで確認してください。</p>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border bg-white p-3 text-xs text-gray-500">補助率は公式サイトで確認してください。（予算を入力すると概算イメージを表示します）</p>
        );
      })()}

      {/* 相談メモ・見積依頼メモ */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => { setMemo({ kind: "consult", text: generateConsultMemo(project, coreChecks.map((c) => c.name)) }); setCopied(false); }} className="rounded-md border px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5">📝 相談用メモを作る</button>
        <button onClick={() => { setMemo({ kind: "estimate", text: generateEstimateMemo(project) }); setCopied(false); }} className="rounded-md border px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5">🧾 見積依頼メモを作る</button>
      </div>
      {memo && (
        <div className="mt-2 rounded-lg border bg-white p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">{memo.kind === "consult" ? "相談用メモ" : "見積依頼メモ"}</span>
            <span className="flex gap-2">
              <button onClick={copyMemo} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90">{copied ? "コピーしました ✓" : "コピー"}</button>
              <button onClick={() => setMemo(null)} className="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
            </span>
          </div>
          <textarea readOnly value={memo.text} rows={memo.text.split("\n").length + 1} className="w-full rounded-md border bg-slate-50 p-2 text-xs text-gray-700" />
        </div>
      )}

      {/* 見つけたあとの進め方＋相談先 */}
      <ApplicationRoadmap project={project} />
      <ConsultRouting project={project} />

      {/* 次にやること（完了できる） */}
      {tasks.length > 0 && (
        <div className="mt-3 rounded-xl border bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-ink">次にやること</h2>
          <ol className="space-y-1.5">
            {tasks.map((t) => (
              <li key={t.taskKey} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${highlightTask === t.taskKey ? "bg-amber-50 ring-1 ring-amber-300" : ""}`}>
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-ink">{t.action}</span>
                  <span className="ml-1 text-xs text-gray-400">（{t.reason}）</span>
                </span>
                <button onClick={() => completeTask(t)} className="shrink-0 rounded-md border border-green-300 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50">完了</button>
              </li>
            ))}
          </ol>
        </div>
      )}

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
          <p><span className="font-medium">対象になりやすい費用：</span>{tpl.expenses.join("、")}</p>
          <p><span className="font-medium">関係しそうな補助金：</span>{tpl.genres.join("、")}</p>
          {tpl.killers.length > 0 && <p className="text-rose-700 sm:col-span-2"><span className="font-medium">ダメになりやすい条件：</span>{tpl.killers.join(" / ")}</p>}
        </div>
      )}

      {/* まず確認すべき定番制度（検索に依存せず、案件タイプから必ず表示） */}
      {coreChecks.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-lg font-bold text-ink">まず確認すべき定番制度</h2>
          <p className="mb-2 text-xs text-gray-500">中小企業・小規模事業者が一般的にまず確認する制度です。「使える」と断定するものではありません。条件が合えば使える可能性があります。年度・公募回は公式で確認してください。</p>
          <div className="space-y-2">
            {coreChecks.map((c) => (
              <CoreCard key={c.key} c={c} state={project.coreChecks?.[c.key]} onSet={setCoreCheck} />
            ))}
          </div>
        </section>
      )}

      {/* 申請準備の進捗（チェックリスト） */}
      <section className="mt-6">
        <h2 className="mb-1 text-lg font-bold text-ink">申請準備の進捗</h2>
        <div className="mb-2">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="h-2.5 w-40 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full bg-green-500" style={{ width: `${Math.round((doneCount / PROJECT_CHECKLIST.length) * 100)}%` }} />
            </div>
            <span className="font-semibold text-ink">{doneCount}/{PROJECT_CHECKLIST.length} 完了</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">{prepHint(project, doneCount)}</p>
        </div>
        <div className="grid gap-1.5 rounded-lg border bg-white p-4 sm:grid-cols-2">
          {PROJECT_CHECKLIST.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={!!project.checklist[c.key]} onChange={() => toggleCheck(c.key)} className="h-4 w-4" />
              <span className={project.checklist[c.key] ? "text-gray-400 line-through" : "text-ink"}>{c.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* 検索・収集で見つかった候補（定番制度より下） */}
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold text-ink">検索・収集で見つかった候補</h2>
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
    </div>
  );
}

// 次に何をすべきかの一言
function prepHint(p: SpendingProject, done: number): string {
  if (!p.checklist["pre_order"]) return "まず発注前か確認してください。";
  if (!p.checklist["guideline"]) return "次に公式サイトで条件を確認してください。";
  if (!p.checklist["estimate"]) return "見積もりの前に、補助金の対象になる費用を確認しましょう。";
  if (done >= PROJECT_CHECKLIST.length) return "準備完了です。締切前に申請しましょう。";
  return "残りの確認を進めましょう。";
}

function regionWord(t: VerifyResult["regionMatchType"]): string {
  return t === "region_mismatch" ? "不一致" : t === "region_unknown" ? "未確認" : "一致";
}
function expenseWord(t: VerifyResult["expenseMatchType"]): string {
  return t === "exact" ? "一致" : t === "near" ? "近い" : t === "possible" ? "要確認" : t === "unknown" ? "未確認" : "不一致";
}

const CORE_GROUP_LABEL: Record<CoreGroup, string> = { national_subsidy: "国の定番", labor_grant: "厚労省系助成金", local_pattern: "自治体で探す" };
const CORE_PRI_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

function CoreCard({ c, state, onSet }: { c: CoreProgramCheck; state?: "done" | "skip"; onSet: (k: string, v: "done" | "skip") => void }) {
  const confTone = c.confidenceLabel === "確認推奨" ? "bg-green-100 text-green-800" : c.confidenceLabel === "条件確認" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800";
  const fresh = coreFreshness(c);
  const guideline = coreGuidelineHref(c);
  return (
    <div className={`rounded-lg border p-3 ${state === "done" ? "border-green-300 bg-green-50/40" : state === "skip" ? "border-gray-200 bg-gray-50 opacity-70" : "bg-white"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-bold text-ink">{c.name}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{CORE_GROUP_LABEL[c.group]}</span>
        {state === "done" && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">確認済み</span>}
        {state === "skip" && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">今回は対象外</span>}
      </div>
      {/* 確認推奨度を必ず上部に明示（「使える」と断定しない） */}
      <p className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold ${confTone}`}>{c.confidenceLabel}：{CORE_PRI_LABEL[c.priority]}</p>
      {/* 制度情報のメタ：年度・募集状況・締切・最終確認日（古い場合は注意） */}
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
        <span className={`rounded px-1.5 py-0.5 ${OFFICIAL_STATUS_TONE[c.officialStatus]}`}>{OFFICIAL_STATUS_LABEL[c.officialStatus]}</span>
        {c.fiscalYear && c.fiscalYear !== "—" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{c.fiscalYear}年度想定</span>}
        {c.applicationRound && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{c.applicationRound}</span>}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">締切：{c.deadline ?? "公式サイトで確認"}</span>
        <span className="text-gray-400">最終確認 {fresh.asOf}</span>
      </div>
      {fresh.stale && <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">⚠ {fresh.note}</p>}
      <p className="mt-1 text-xs text-gray-500">条件が合えば使える可能性があります。対象になるかは公式サイトで確認してください。</p>
      <p className="mt-1 text-xs text-gray-600"><span className="text-gray-400">なぜ確認すべきか：</span>{c.projectFitReason}</p>
      {/* 確認パック（何を確認すればいいか） */}
      {c.whatToCheck.length > 0 && (
        <div className="mt-1.5 rounded-md bg-slate-50 p-2">
          <p className="text-[11px] font-semibold text-gray-600">確認パック</p>
          <ul className="mt-0.5 grid grid-cols-1 gap-x-3 text-xs text-gray-700 sm:grid-cols-2">
            {c.whatToCheck.map((w) => <li key={w}>☐ {w}</li>)}
          </ul>
        </div>
      )}
      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-accent">必要になりやすいもの・注意</summary>
        {c.requiredInfo.length > 0 && <p className="mt-1 text-xs text-gray-500">必要になりやすいもの：{c.requiredInfo.join("・")}</p>}
        {c.caution.length > 0 && <p className="mt-0.5 text-xs text-amber-700">注意：{c.caution.join("／")}</p>}
      </details>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <a href={coreOfficialHref(c)} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:opacity-90">{c.officialUrl ? "🔗 公式ページを見る ↗" : "🔍 公式情報を探す ↗"}</a>
        {guideline && <a href={guideline} target="_blank" rel="noopener noreferrer" className="rounded-md border border-emerald-300 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50">📄 公募要領 ↗</a>}
        <button onClick={() => onSet(c.key, "done")} className="rounded-md border border-green-300 px-3 py-1.5 text-green-700 hover:bg-green-50">確認済みにする</button>
        <button onClick={() => onSet(c.key, "skip")} className="rounded-md border px-3 py-1.5 text-gray-500 hover:bg-gray-50">今回は対象外</button>
      </div>
    </div>
  );
}

function CandidateCard({ item, r, v, catKey }: { item: DiscoveredItem; r: TriageResult; v: VerifyResult; catKey: TriageKey }) {
  const m = TRIAGE_META[catKey];
  const dd = daysUntil(r.deadline);
  return (
    <div className={`rounded-lg border p-3 ${m.tone}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-ink">{item.title}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${v.tone}`}>{v.label}</span>
      </div>
      {/* 3行：結論・理由・次にやること */}
      <p className="mt-1 text-sm font-bold text-ink">結論：{r.conclusion}</p>
      <p className="mt-0.5 text-xs text-gray-600">理由：{v.projectRelationReason}</p>
      {r.nextActions.length > 0 && <p className="mt-0.5 text-xs text-orange-700">次：{r.nextActions.slice(0, 3).join(" → ")}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {(item.official_url || item.url) && (
          <a href={item.official_url ?? item.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">🔗 公式ページを見る ↗</a>
        )}
      </div>
      {/* 詳細は折りたたみ */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-gray-400 hover:text-accent">くわしく見る</summary>
        <div className="mt-1 space-y-0.5">
          <p className="text-xs text-gray-600">地域：{regionWord(v.regionMatchType)}（{v.regionMatchReason}）</p>
          <p className="text-xs text-gray-600">経費：{expenseWord(v.expenseMatchType)}（{v.expenseMatchReason}）</p>
          {r.deadline && <p className="text-xs text-gray-600">締切：{formatDate(r.deadline)}{dd != null && dd >= 0 ? `（あと${dd}日）` : ""}</p>}
          {v.missingFields.length > 0 && <p className="text-xs text-amber-800">未確認項目：{v.missingFields.slice(0, 5).join("・")}</p>}
          {r.killers.length > 0 && <p className="text-xs text-red-700">注意：{r.killers.join(" / ")}</p>}
        </div>
      </details>
    </div>
  );
}
