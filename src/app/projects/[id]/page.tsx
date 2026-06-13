"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import {
  getProject, upsertProject, deleteProject, syncProjectsFromSupabase, classifyForProject, orderAdvice, getTemplate, projectTasks,
  missingInfo, estimateRange, generateConsultMemo, generateEstimateMemo,
  ORDER_STATUS_LABEL, PROJECT_CHECKLIST, APP_STATUS_ORDER, APP_STATUS_LABEL,
  type SpendingProject, type ProjectMatch, type ProjectTask, type AppStatus,
} from "@/lib/projects";
import { TRIAGE_META, type TriageKey, type TriageResult } from "@/lib/triage";
import type { VerifyResult } from "@/lib/verify";
import { getCoreProgramChecks, coreOfficialHref, coreGuidelineHref, coreFreshness, OFFICIAL_STATUS_LABEL, OFFICIAL_STATUS_TONE, type CoreProgramCheck, type CoreGroup } from "@/lib/coreMaster";
import { ApplicationRoadmap, ConsultRouting } from "@/components/ApplicationRoadmap";
import { AiConsult } from "@/components/AiConsult";
import { DocumentBox, DeadlineBox, OfficialCheckLogBox } from "@/components/CaseRecords";

// 進行ステータス別の上部ガイダンス
const STATUS_GUIDANCE: Record<string, { tone: string; text: string }> = {
  considering: { tone: "border-amber-200 bg-amber-50 text-amber-900", text: "発注（契約・注文）の前に、補助金が使えるか確認しましょう。" },
  preparing: { tone: "border-amber-200 bg-amber-50 text-amber-900", text: "申請準備中です。発注はまだしないでください。必要書類をそろえましょう。" },
  applied: { tone: "border-sky-200 bg-sky-50 text-sky-900", text: "申請済みです。交付決定まで発注・契約しないでください。申請控えを保管し、事務局からの連絡を確認しましょう。交付決定日が出たら入力を。" },
  approved: { tone: "border-sky-200 bg-sky-50 text-sky-900", text: "交付決定後は、発注・契約・納品・支払いの日付を順番に管理します。支払い前チェックと証憑をそろえましょう。" },
  implementing: { tone: "border-sky-200 bg-sky-50 text-sky-900", text: "実施中です。見積・請求・振込明細の整合性（日付・金額・宛名）を確認しましょう。" },
  reported: { tone: "border-blue-200 bg-blue-50 text-blue-900", text: "実績報告の段階です。導入前後の写真・成果物・支払い証憑をそろえ、実績報告期限を確認しましょう。" },
  received: { tone: "border-green-200 bg-green-50 text-green-800", text: "入金まで完了です。書類は保管し、事業化報告の要否を確認。次の支出があれば新しく登録しましょう。" },
};

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
  const [mode, setMode] = useState<"simple" | "pro">("simple");

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
  const [edit, setEdit] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  function openEdit(key: string) {
    if (!project) return;
    const cur =
      key === "budget" ? (project.budget != null ? String(Math.round(project.budget / 10000)) : "")
      : key === "employees" ? (project.employees != null ? String(project.employees) : "")
      : key === "location" ? project.location
      : key === "industry" ? project.industry
      : key === "schedule" ? project.schedule
      : "";
    setEdit(key);
    setEditVal(cur);
  }
  function saveEdit() {
    if (!project || !edit) return;
    const raw = editVal.trim();
    const next = { ...project };
    if (edit === "budget") next.budget = raw ? (Number(raw.replace(/[^0-9]/g, "")) || 0) * 10000 : null;
    else if (edit === "employees") next.employees = raw ? Number(raw.replace(/[^0-9]/g, "")) || null : null;
    else if (edit === "location") next.location = raw;
    else if (edit === "industry") next.industry = raw;
    else if (edit === "schedule") next.schedule = raw;
    setProject(upsertProject(next));
    setEdit(null);
    setEditVal("");
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

  function setAppStatus(s: AppStatus) {
    if (!project) return;
    setProject(upsertProject({ ...project, appStatus: s }));
  }

  function toggleCheck(key: string) {
    if (!project) return;
    const next = { ...project, checklist: { ...project.checklist, [key]: !project.checklist[key] } };
    setProject(upsertProject(next));
  }

  // 「次にやること」の完了：チェック項目は true に、従業員数/予算は入力して消す
  function completeTask(t: ProjectTask) {
    if (!project) return;
    if (t.taskKey === "employees" || t.taskKey === "budget") { openEdit(t.taskKey); return; }
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
            <h2 className="text-lg font-bold text-ink">診断結果：{project.name || tpl?.label || "支出案件"}</h2>
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

      {/* 表示モード切替（初期はかんたん表示） */}
      <div className="mb-3 flex items-center justify-end gap-1 text-xs">
        <span className="text-gray-400">表示：</span>
        <div className="inline-flex rounded-md border p-0.5">
          <button onClick={() => setMode("simple")} className={`rounded px-2.5 py-1 ${mode === "simple" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>かんたん</button>
          <button onClick={() => setMode("pro")} className={`rounded px-2.5 py-1 ${mode === "pro" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>実務者</button>
        </div>
      </div>

      {/* 進行ステータス別の上部ガイダンス */}
      {(() => { const g = STATUS_GUIDANCE[project.appStatus ?? "considering"]; return g ? (
        <div className={`mb-3 rounded-lg border p-3 text-sm ${g.tone}`}><span className="font-semibold">{APP_STATUS_LABEL[project.appStatus ?? "considering"]}：</span>{g.text}</div>
      ) : null; })()}

      {/* ヘッダー */}
      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-ink">{project.name || tpl?.label || "支出案件"}</h1>
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

      {/* 足りない情報だけ聞く（最大3件・画面内で入力） */}
      {(missingInfo(project).length > 0 || (edit && ["budget", "employees", "location", "industry", "schedule"].includes(edit))) && (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="mb-1.5 text-sm font-semibold text-sky-900">判定を強くするために、あと{missingInfo(project).length}つだけ教えてください</p>
          <div className="flex flex-col gap-2">
            {missingInfo(project).map((m) => (
              <div key={m.key}>
                {edit === m.key ? (
                  <InlineField label={m.label} value={editVal} onChange={setEditVal} onSave={saveEdit} onCancel={() => setEdit(null)}
                    numeric={m.key === "budget" || m.key === "employees"} unit={m.key === "budget" ? "万円" : m.key === "employees" ? "人" : undefined} />
                ) : (
                  <button onClick={() => openEdit(m.key)} className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs text-sky-800 hover:bg-sky-100">{m.label}</button>
                )}
              </div>
            ))}
            {/* タスクから予算/従業員数を編集したとき（missingInfoに無くても入力欄を出す） */}
            {edit && !missingInfo(project).some((m) => m.key === edit) && (
              <InlineField label={edit === "budget" ? "見積・予算" : edit === "employees" ? "従業員数" : edit}
                value={editVal} onChange={setEditVal} onSave={saveEdit} onCancel={() => setEdit(null)}
                numeric={edit === "budget" || edit === "employees"} unit={edit === "budget" ? "万円" : edit === "employees" ? "人" : undefined} />
            )}
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
            <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
              補助金は<strong>後払い</strong>です。まず<strong>{formatAmount(est.budget)}を自分で用意</strong>して支払い、あとから{formatAmount(est.low)}〜{formatAmount(est.high)}が戻る流れです（実質の負担は約{formatAmount(est.budget - est.high)}〜{formatAmount(est.budget - est.low)}）。
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">※ 補助率・上限は制度ごとに違います。下の「まず確認すべき定番制度」に制度別の目安を表示します。最終判断は公式サイトで確認してください。</p>
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

      {/* 自分のAIに相談する（外部AI用プロンプト生成） */}
      <AiConsult
        project={project}
        coreNames={coreChecks.map((c) => c.name)}
        tasks={tasks.map((t) => t.action)}
        missing={missingInfo(project).map((m) => m.label)}
      />

      {/* 実務者表示：必要書類・証憑／期限／公式確認ログ */}
      {mode === "pro" ? (
        <>
          <DocumentBox projectId={project.id} />
          <DeadlineBox projectId={project.id} />
          <OfficialCheckLogBox projectId={project.id} />
        </>
      ) : (
        <button onClick={() => setMode("pro")} className="mt-4 w-full rounded-lg border border-dashed bg-white p-3 text-sm text-gray-600 hover:border-accent hover:bg-gray-50">
          ＋ 実務者表示にする（必要書類・証憑／期限・スケジュール／公式確認ログ）
        </button>
      )}

      {/* 進行状況（いまどの段階か） */}
      <section className="mt-6">
        <h2 className="mb-1 text-lg font-bold text-ink">いまどの段階？</h2>
        <p className="mb-2 text-xs text-gray-500">進めるごとに更新すると、下の「進め方」とホームの通知が正確になります。</p>
        <div className="flex flex-wrap gap-1.5">
          {APP_STATUS_ORDER.map((s) => (
            <button key={s} onClick={() => setAppStatus(s)}
              className={`rounded-full border px-3 py-1.5 text-xs ${(project.appStatus ?? "considering") === s ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
              {APP_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </section>

      {/* 見つけたあとの進め方＋相談先 */}
      <ApplicationRoadmap project={project} />
      <ConsultRouting project={project} />

      {/* 次にやること（完了できる） */}
      {tasks.length > 0 && (
        <div className="mt-3 rounded-xl border bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-ink">次にやる申請準備</h2>
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
          {match && match.total > 0 && <span className="ml-1 text-xs font-normal opacity-80">（候補 {match.total} 件・見逃し注意 {match.missRisk}）</span>}
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

      {/* 検索・収集で見つかった候補（実務者表示のみ。初心者画面を重くしない） */}
      {mode === "pro" && (
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
      )}
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

function InlineField({ label, value, onChange, onSave, onCancel, numeric, unit }: {
  label: string; value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; numeric?: boolean; unit?: string;
}) {
  return (
    <div className="rounded-md border border-sky-300 bg-white p-2">
      <p className="mb-1 text-xs font-medium text-sky-900">{label}</p>
      <div className="flex items-center gap-1.5">
        <input
          autoFocus value={value} inputMode={numeric ? "numeric" : "text"}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
          className="min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-sm"
        />
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
        <button onClick={onSave} className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">保存</button>
        <button onClick={onCancel} className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50">やめる</button>
      </div>
    </div>
  );
}

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
      {(c.rateText || c.maxText) ? (
        <p className="mt-1 text-xs text-gray-600">補助率の目安：{c.rateText ?? "—"}／上限の目安：{c.maxText ?? "—"}<span className="text-gray-400">（正確な額は公式要領で確認）</span></p>
      ) : c.group === "local_pattern" ? (
        <p className="mt-1 text-xs text-gray-500">補助率・上限は自治体により異なります（公式で確認）。</p>
      ) : null}
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
      {/* 地域で探す（自治体パターン等の複数検索リンク） */}
      {c.searchLinks && c.searchLinks.length > 0 && (() => {
        const generic = c.searchLinks!.some((l) => l.label.startsWith("自治体 ") || l.label.startsWith("都道府県 "));
        return (
          <div className="mt-2 rounded-md bg-slate-50 p-2">
            <p className="text-[11px] font-semibold text-gray-600">{generic ? "探す（地域を入力するとお住まいの市区町村・都道府県で探せます）" : "地域で探す"}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {c.searchLinks!.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-full border bg-white px-2.5 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50">🔍 {l.label}</a>
              ))}
            </div>
          </div>
        );
      })()}
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
