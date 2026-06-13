"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DOC_CATALOG, DOC_STATUS_LABEL, DEADLINE_CATALOG, CHECK_TARGET_LABEL, CHECK_METHOD_LABEL, CHECK_STATUS_LABEL,
  loadDocs, setDoc, docSummary, loadDeadlines, setDeadline, loadCheckLogs, addCheckLog, deleteCheckLog,
  themeDocGroup, suggestDeadlinesFromApplication,
  type DocRecord, type DocStatus, type DeadlineRecord, type OfficialCheckLog,
} from "@/lib/caseRecords";

function useCaseData<T>(load: () => T, deps: unknown[] = []): [T, () => void] {
  const [data, setData] = useState<T>(load);
  const refresh = () => setData(load());
  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener("case-records-changed", on);
    return () => window.removeEventListener("case-records-changed", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [data, refresh];
}

const STATUS_TONE: Record<DocStatus, string> = {
  missing: "bg-gray-100 text-gray-500", preparing: "bg-amber-100 text-amber-800",
  ready: "bg-green-100 text-green-800", needs_review: "bg-orange-100 text-orange-700", not_needed: "bg-slate-100 text-slate-400",
};

// ---------- 必要書類・証憑ボックス ----------
export function DocumentBox({ projectId, templateKey }: { projectId: string; templateKey?: string }) {
  const [docs, refresh] = useCaseData<Record<string, DocRecord>>(() => loadDocs(projectId), [projectId]);
  const [open, setOpen] = useState(false);
  const [editKind, setEditKind] = useState<string | null>(null);
  const sum = docSummary(projectId);
  const theme = themeDocGroup(templateKey);
  const phases = theme ? [...DOC_CATALOG, { key: "theme", title: theme.title, items: theme.items }] : DOC_CATALOG;

  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-bold text-ink">📁 必要書類・証憑ボックス</h2>
      <p className="mt-1 text-xs text-gray-600">補助金は申請して終わりではありません。採択後や実績報告で、見積書・発注書・請求書・振込明細などが必要になることがあります。</p>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {sum.phases.map((p) => (
          <span key={p.key} className={`rounded-full border px-2.5 py-1 ${p.ready === p.total && p.total > 0 ? "border-green-300 bg-green-50 text-green-700" : "text-gray-600"}`}>
            {p.title}：{p.ready}/{p.total} 準備済み
          </span>
        ))}
        {theme && (() => {
          const ready = theme.items.filter((it) => ["ready", "not_needed"].includes(docs[it.kind]?.status ?? "missing")).length;
          return <span className={`rounded-full border px-2.5 py-1 ${ready === theme.items.length ? "border-green-300 bg-green-50 text-green-700" : "border-violet-200 text-violet-700"}`}>この支出で特に重要：{ready}/{theme.items.length}</span>;
        })()}
      </div>
      {sum.missingImportant.length > 0 && (
        <ul className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-900">
          {sum.missingImportant.map((m) => <li key={m}>・{m}</li>)}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button onClick={() => setOpen((v) => !v)} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">{open ? "閉じる" : "書類を確認する"}</button>
        <a href="#ai-consult" className="rounded-md border border-violet-300 px-3 py-1.5 text-violet-700 hover:bg-violet-50">🤖 証憑チェックの相談文を作る</a>
        <a href="#ai-consult" className="rounded-md border border-violet-300 px-3 py-1.5 text-violet-700 hover:bg-violet-50">🤖 支払い前チェックの相談文を作る</a>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {phases.map((ph) => (
            <div key={ph.key}>
              <p className="mb-1 text-xs font-semibold text-gray-600">{ph.title}</p>
              <div className="space-y-1">
                {ph.items.map((it) => {
                  const rec = docs[it.kind] ?? { status: "missing" as DocStatus };
                  const editing = editKind === it.kind;
                  return (
                    <div key={it.kind} className="rounded-md border p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-ink">{it.label}</span>
                        <div className="flex items-center gap-1.5">
                          <select value={rec.status} onChange={(e) => setDoc(projectId, it.kind, { status: e.target.value as DocStatus })}
                            className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_TONE[rec.status]}`}>
                            {(Object.keys(DOC_STATUS_LABEL) as DocStatus[]).map((s) => <option key={s} value={s}>{DOC_STATUS_LABEL[s]}</option>)}
                          </select>
                          <button onClick={() => setEditKind(editing ? null : it.kind)} className="text-[11px] text-gray-400 hover:text-accent">{editing ? "閉じる" : "メモ/保管先"}</button>
                        </div>
                      </div>
                      {(rec.memo || rec.fileName || rec.storageUrl) && !editing && (
                        <p className="mt-0.5 truncate text-[11px] text-gray-500">{[rec.memo, rec.fileName, rec.storageUrl].filter(Boolean).join("／")}</p>
                      )}
                      {editing && (
                        <div className="mt-1.5 space-y-1.5">
                          <input defaultValue={rec.memo} onBlur={(e) => setDoc(projectId, it.kind, { memo: e.target.value })} placeholder="メモ" className="w-full rounded border px-2 py-1 text-xs" />
                          <input defaultValue={rec.fileName} onBlur={(e) => setDoc(projectId, it.kind, { fileName: e.target.value })} placeholder="ファイル名" className="w-full rounded border px-2 py-1 text-xs" />
                          <input defaultValue={rec.storageUrl} onBlur={(e) => setDoc(projectId, it.kind, { storageUrl: e.target.value })} placeholder="保管場所URL（クラウド等）" className="w-full rounded border px-2 py-1 text-xs" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-400">※ いまはメモ・保管先URLで管理します（将来クラウド保存に対応予定）。</p>
        </div>
      )}
    </section>
  );
}

// ---------- 期限・スケジュール ----------
export function DeadlineBox({ projectId }: { projectId: string }) {
  const [dl] = useCaseData<Record<string, DeadlineRecord>>(() => loadDeadlines(projectId), [projectId]);
  const appDate = dl["application_deadline"]?.date;
  const suggestion = appDate ? suggestDeadlinesFromApplication(appDate) : null;
  const applySuggestion = () => {
    if (!suggestion) return;
    if (!dl["estimate_deadline"]?.date) setDeadline(projectId, "estimate_deadline", { date: suggestion.estimate_deadline });
    if (!dl["application_draft_deadline"]?.date) setDeadline(projectId, "application_draft_deadline", { date: suggestion.application_draft_deadline });
  };
  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-bold text-ink">🗓 期限・スケジュール</h2>
      <p className="mt-1 text-xs text-amber-800">公募締切だけでなく、事前相談期限・様式発行依頼期限が先に来る場合があります。</p>
      {suggestion && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-sky-50 p-2 text-[11px] text-sky-900">
          公募締切から目安を提案：見積取得 {suggestion.estimate_deadline}／申請書作成 {suggestion.application_draft_deadline}
          <button onClick={applySuggestion} className="rounded border border-sky-300 bg-white px-2 py-0.5 font-medium text-sky-800 hover:bg-sky-100">目安を入れる</button>
        </div>
      )}
      <div className="mt-2 space-y-1.5">
        {DEADLINE_CATALOG.map((d) => {
          const rec = dl[d.kind] ?? {};
          return (
            <div key={d.kind} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <span className="min-w-[8rem] flex-1 text-sm text-ink">{d.label}{d.relativeHint && <span className="ml-1 text-[10px] text-gray-400">（目安：{d.relativeHint}）</span>}</span>
              <input type="date" defaultValue={rec.date} onChange={(e) => setDeadline(projectId, d.kind, { date: e.target.value })} className="rounded border px-2 py-1 text-xs" />
              <input defaultValue={rec.memo} onBlur={(e) => setDeadline(projectId, d.kind, { memo: e.target.value })} placeholder="メモ" className="w-28 rounded border px-2 py-1 text-xs" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- 公式確認ログ ----------
export function OfficialCheckLogBox({ projectId }: { projectId: string }) {
  const [logs] = useCaseData<OfficialCheckLog[]>(() => loadCheckLogs(projectId), [projectId]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ target: "official_guideline", method: "website", question: "", answer: "", url: "", contactName: "", nextCheck: "", status: "confirmed" as OfficialCheckLog["status"] });
  const save = () => {
    if (!form.question.trim() && !form.answer.trim()) return;
    addCheckLog({ projectId, checkedAt: new Date().toISOString().slice(0, 10), ...form });
    setForm({ target: "official_guideline", method: "website", question: "", answer: "", url: "", contactName: "", nextCheck: "", status: "confirmed" });
    setOpen(false);
  };
  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-bold text-ink">📝 公式確認ログ</h2>
      <p className="mt-1 text-xs text-gray-600">AI回答やまとめサイトの情報は参考です。公式要領・事務局・自治体・商工会議所などで確認した内容を残しましょう。</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button onClick={() => setOpen((v) => !v)} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">{open ? "閉じる" : "公式確認を記録する"}</button>
        <a href="#ai-consult" className="rounded-md border border-violet-300 px-3 py-1.5 text-violet-700 hover:bg-violet-50">🤖 相談メモを作る</a>
      </div>
      {open && (
        <div className="mt-2 space-y-1.5 rounded-md border bg-slate-50 p-2 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="rounded border px-2 py-1">
              {Object.entries(CHECK_TARGET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="rounded border px-2 py-1">
              {Object.entries(CHECK_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as OfficialCheckLog["status"] })} className="rounded border px-2 py-1">
              {Object.entries(CHECK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="確認したこと" className="w-full rounded border px-2 py-1" />
          <textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="回答内容" rows={2} className="w-full rounded border px-2 py-1" />
          <div className="flex flex-wrap gap-1.5">
            <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="担当者名" className="w-28 rounded border px-2 py-1" />
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="関連URL" className="flex-1 rounded border px-2 py-1" />
          </div>
          <input value={form.nextCheck} onChange={(e) => setForm({ ...form, nextCheck: e.target.value })} placeholder="次に確認すること" className="w-full rounded border px-2 py-1" />
          <button onClick={save} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">記録する</button>
        </div>
      )}
      {logs.length > 0 && (
        <div className="mt-3 space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="rounded-md border p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{CHECK_TARGET_LABEL[l.target] ?? l.target}・{CHECK_METHOD_LABEL[l.method] ?? l.method}<span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{CHECK_STATUS_LABEL[l.status]}</span></span>
                <span className="text-[10px] text-gray-400">{l.checkedAt}<button onClick={() => deleteCheckLog(l.id)} className="ml-2 hover:text-red-600">削除</button></span>
              </div>
              {l.question && <p className="mt-0.5 text-gray-700">Q: {l.question}</p>}
              {l.answer && <p className="text-gray-600">A: {l.answer}</p>}
              {l.nextCheck && <p className="mt-0.5 text-amber-700">次に確認：{l.nextCheck}</p>}
              {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">関連ページ ↗</a>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
