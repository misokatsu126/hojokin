"use client";

import { useEffect, useMemo, useState } from "react";
import type { SpendingProject } from "@/lib/projects";
import {
  buildPrompt, loadResponses, saveResponse, deleteResponse, DEFAULT_PRIVACY, COMMON_NOTE,
  CONSULT_TARGETS, type AiPromptKind, type PrivacyOpts, type ConsultTarget, type ExternalAiResponse,
} from "@/lib/aiPrompts";
import {
  extractTaskCandidates, addTaskCandidates, loadTaskCandidates, setTaskCandidateStatus, type AiTaskCandidate,
} from "@/lib/caseRecords";

type Card = { kind: AiPromptKind; name: string; what: string; when: string };

// 初心者向けの呼び方（やさしい言葉）
const CARDS: Card[] = [
  { kind: "subsidy_check", name: "補助金についてAIに聞く", what: "この支出に使えそうな制度、発注前の注意、次に確認することを整理してもらいます。", when: "まず最初に" },
  { kind: "guideline_reading", name: "公式要領を読ませる", what: "公募要領PDFや公式ページをAIに貼って、必要な情報を抜き出してもらう文章を作ります。", when: "公式ページを見つけたとき" },
  { kind: "estimate_check", name: "見積書をチェックしてもらう", what: "見積書をAIに貼って、補助金で不備になりそうな点を確認します。", when: "見積をもらったとき" },
  { kind: "application_material", name: "申請書に使うメモを作る", what: "申請書を書くための材料（課題・目的・効果など）を整理してもらいます。", when: "申請書を書く前に" },
  { kind: "consult_message", name: "相談先に送る文章を作る", what: "商工会議所・自治体・専門家などへ送る相談文を作ってもらいます。", when: "相談・問い合わせのとき" },
  { kind: "payment_check", name: "支払い前に確認する", what: "交付決定後、支払い前に補助金で不利にならないかを確認します。", when: "支払いの前に" },
  { kind: "evidence_report", name: "実績報告に必要なものを整理する", what: "採択後の実績報告で必要な書類・証憑を整理してもらいます。", when: "採択・実施のあとで" },
];

// 実務者向けの呼び方（折りたたみで表示）
const PRO_NAMES: { kind: AiPromptKind; pro: string }[] = [
  { kind: "subsidy_check", pro: "対象制度・対象経費の整理" },
  { kind: "guideline_reading", pro: "公募要領 要件抽出" },
  { kind: "estimate_check", pro: "見積（証憑）チェック" },
  { kind: "application_material", pro: "申請書素材生成" },
  { kind: "consult_message", pro: "相談文ドラフト生成" },
  { kind: "payment_check", pro: "支払い前チェック" },
  { kind: "evidence_report", pro: "実績報告・証憑チェック" },
];

const STATUS_LABEL: Record<ExternalAiResponse["status"], string> = {
  reference: "参考情報", needs_review: "要確認", converted_to_task: "タスク化",
};

export function AiConsult({ project, coreNames, tasks, missing }: { project: SpendingProject; coreNames: string[]; tasks: string[]; missing: string[] }) {
  const [privacy, setPrivacy] = useState<PrivacyOpts>(DEFAULT_PRIVACY);
  const [active, setActive] = useState<{ kind: AiPromptKind; target?: ConsultTarget } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [manualTask, setManualTask] = useState("");
  const [responses, setResponses] = useState<ExternalAiResponse[]>([]);
  const [candidates, setCandidates] = useState<AiTaskCandidate[]>([]);

  useEffect(() => {
    const refresh = () => { setResponses(loadResponses(project.id)); setCandidates(loadTaskCandidates(project.id)); };
    refresh();
    window.addEventListener("ai-responses-changed", refresh);
    window.addEventListener("case-records-changed", refresh);
    return () => { window.removeEventListener("ai-responses-changed", refresh); window.removeEventListener("case-records-changed", refresh); };
  }, [project.id]);

  const card = active ? CARDS.find((c) => c.kind === active.kind)! : null;
  // consult はターゲット未選択のうちはプロンプトを作らない
  const prompt = useMemo(() => {
    if (!active) return "";
    if (active.kind === "consult_message" && !active.target) return "";
    return buildPrompt(active.kind, project, privacy, { coreNames, tasks, missing, target: active.target });
  }, [active, project, privacy, coreNames, tasks, missing]);

  const openCard = (kind: AiPromptKind) => { setActive({ kind }); setCopied(false); };

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* noop */ }
  }
  function saveTxt() {
    const blob = new Blob([prompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${card?.name ?? "prompt"}.txt`; a.click();
    URL.revokeObjectURL(url);
  }
  function savePaste(status: ExternalAiResponse["status"]) {
    const content = pasteText.trim();
    if (!content) return;
    saveResponse({ projectId: project.id, promptKind: active?.kind ?? "subsidy_check", title: card?.name ?? "AIの回答", content, status });
    setPasteText("");
  }

  return (
    <section id="ai-consult" className="mt-6 scroll-mt-4 rounded-xl border-2 border-violet-200 bg-violet-50/40 p-4">
      <h2 className="text-lg font-bold text-ink">🤖 自分のAIに相談する</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-600">
        この案件情報をもとに、ChatGPT・Claude・Geminiなどに貼って相談できる文章を作ります。
        AIの回答は申請可否を保証するものではないため、最終判断は公式要領・窓口・専門家に確認してください。
      </p>

      {/* 個人情報の注意＋伏せる設定 */}
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
        AIに貼る前に、個人名・住所・電話番号・口座情報・契約金額など、公開したくない情報は必要に応じて伏せてください。
        <div className="mt-1.5 flex flex-wrap gap-2 text-amber-900">
          <label className="flex items-center gap-1"><input type="checkbox" checked={privacy.maskNames} onChange={(e) => setPrivacy((v) => ({ ...v, maskNames: e.target.checked }))} />会社名・個人名を伏せる</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={privacy.budgetApprox} onChange={(e) => setPrivacy((v) => ({ ...v, budgetApprox: e.target.checked }))} />金額を概算にする</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={privacy.cityOnly} onChange={(e) => setPrivacy((v) => ({ ...v, cityOnly: e.target.checked }))} />住所を市区町村まで</label>
        </div>
      </div>

      {/* カード一覧 */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <div key={c.kind} className={`rounded-lg border bg-white p-3 ${active?.kind === c.kind ? "border-violet-400" : ""}`}>
            <p className="text-sm font-semibold text-ink">{c.name}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-600">{c.what}</p>
            <p className="mt-0.5 text-[10px] text-gray-400">使うとき：{c.when}</p>
            <button onClick={() => openCard(c.kind)} className="mt-2 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">プロンプトを作る</button>
          </div>
        ))}
      </div>

      {/* 生成パネル */}
      {active && card && (
        <div className="mt-3 rounded-lg border border-violet-300 bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink">{card.name}</p>
            <button onClick={() => setActive(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ 閉じる</button>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">{card.what}</p>

          {/* consult はまず相談先を選ぶ */}
          {active.kind === "consult_message" && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-600">相談先を選んでください</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CONSULT_TARGETS.map((t) => (
                  <button key={t} onClick={() => setActive({ kind: "consult_message", target: t })}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${active.target === t ? "border-violet-500 bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{t}</button>
                ))}
              </div>
            </div>
          )}

          {prompt ? (
            <>
              <textarea readOnly value={prompt} rows={Math.min(prompt.split("\n").length + 1, 22)} className="mt-2 w-full rounded-md border bg-slate-50 p-2 text-xs text-gray-700" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button onClick={copyPrompt} className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90">📋 コピーする</button>
                <button onClick={saveTxt} className="rounded-md border px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">💾 テキストで保存</button>
                {copied && <span className="text-xs font-medium text-green-700">コピーしました。ChatGPT・Claude・Geminiなどに貼って相談してください。</span>}
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-gray-400">相談先を選ぶとプロンプトが表示されます。</p>
          )}
        </div>
      )}

      {/* AI回答の貼り戻し */}
      <details className="mt-3 rounded-lg border bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">AIの回答を貼り戻す（参考メモとして保存）</summary>
        <p className="mt-1 text-[11px] text-gray-500">AI回答は参考情報です。公式確認前の情報として保存します（そのまま確定情報にはしません）。</p>
        <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder="AIの回答をここに貼り付け" className="mt-2 w-full rounded-md border p-2 text-xs" />
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button onClick={() => savePaste("reference")} disabled={!pasteText.trim()} className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">参考メモとして保存</button>
          <button onClick={() => savePaste("needs_review")} disabled={!pasteText.trim()} className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">次の確認事項として保存</button>
          <button onClick={() => { const t = extractTaskCandidates(pasteText); if (t.length) addTaskCandidates(project.id, t); }} disabled={!pasteText.trim()} className="rounded-md border border-violet-300 px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50">タスク候補を抽出する</button>
        </div>
        {/* 手動でタスク追加 */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <input value={manualTask} onChange={(e) => setManualTask(e.target.value)} placeholder="手動でタスクを追加（例：商工会議所に管轄を確認）" className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs" />
          <button onClick={() => { if (manualTask.trim()) { addTaskCandidates(project.id, [manualTask.trim()]); setManualTask(""); } }} className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50">追加</button>
        </div>
        {/* タスク候補（未確定）＝必要なものだけ正式タスク化 */}
        {candidates.some((c) => c.status === "candidate") && (
          <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/40 p-2">
            <p className="text-[11px] text-violet-800">AI回答から見つかった確認候補です（公式確認前の参考情報）。必要なものだけ追加してください。</p>
            <div className="mt-1 space-y-1">
              {candidates.filter((c) => c.status === "candidate").map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs">
                  <span className="min-w-0 flex-1 text-gray-700">{c.title}</span>
                  <span className="flex shrink-0 gap-1.5">
                    <button onClick={() => setTaskCandidateStatus(c.id, "accepted")} className="rounded border border-green-300 px-2 py-0.5 text-[11px] text-green-700 hover:bg-green-50">追加する</button>
                    <button onClick={() => setTaskCandidateStatus(c.id, "rejected")} className="rounded border px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50">却下</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {candidates.some((c) => c.status === "accepted") && (
          <div className="mt-2">
            <p className="text-[11px] font-semibold text-gray-600">追加した確認タスク</p>
            <ul className="mt-1 space-y-0.5">
              {candidates.filter((c) => c.status === "accepted").map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs text-gray-700">
                  <span>☐ {c.title}</span>
                  <button onClick={() => setTaskCandidateStatus(c.id, "rejected")} className="text-[10px] text-gray-400 hover:text-red-600">取消</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {responses.length > 0 && (
          <div className="mt-3 space-y-2">
            {responses.map((r) => (
              <div key={r.id} className="rounded-md border bg-slate-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-gray-600">{r.title}<span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">{STATUS_LABEL[r.status]}</span></span>
                  <button onClick={() => deleteResponse(r.id)} className="text-[11px] text-gray-400 hover:text-red-600">削除</button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[11px] text-gray-700">{r.content.length > 400 ? r.content.slice(0, 400) + "…" : r.content}</p>
                <p className="mt-1 text-[10px] text-amber-700">※ 公式確認前の参考情報です。</p>
              </div>
            ))}
          </div>
        )}
      </details>

      {/* 実務者向けの呼び方 */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-accent">実務者向けの呼び方を見る</summary>
        <ul className="mt-1 grid gap-0.5 text-[11px] text-gray-500 sm:grid-cols-2">
          {PRO_NAMES.map((n) => <li key={n.kind}>・{CARDS.find((c) => c.kind === n.kind)!.name} ＝ {n.pro}</li>)}
        </ul>
      </details>
    </section>
  );
}
