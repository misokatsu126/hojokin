// 補助金「実務」の記録：必要書類・証憑ボックス／期限・スケジュール／公式確認ログ／AI回答のタスク化。
//   ※ いまは localStorage 保存（projectId ごと）。型は将来 Supabase 移行できる形にしてある。
//   ※ AI回答は参考情報。確定情報にはしない。

// ---------- 必要書類・証憑 ----------
export type DocStatus = "missing" | "preparing" | "ready" | "needs_review" | "not_needed";
export type DocRecord = { status: DocStatus; memo?: string; storageUrl?: string; fileName?: string; checkedAt?: string };

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  missing: "未準備", preparing: "準備中", ready: "入手済み", needs_review: "要確認", not_needed: "不要",
};

export type DocPhase = { key: string; title: string; items: { kind: string; label: string }[] };
export const DOC_CATALOG: DocPhase[] = [
  { key: "before", title: "申請前", items: [
    { kind: "estimate", label: "見積書" }, { kind: "company_info", label: "会社情報" },
    { kind: "plan_memo", label: "事業計画メモ" }, { kind: "gbizid", label: "GビズID" },
    { kind: "employees", label: "従業員数" }, { kind: "official_guideline", label: "公式要領" },
    { kind: "expense_memo", label: "対象経費メモ" }, { kind: "consult_log", label: "相談記録" },
  ] },
  { key: "order", title: "発注・契約時", items: [
    { kind: "order", label: "発注書" }, { kind: "contract", label: "契約書" },
    { kind: "vendor_comm", label: "業者とのやり取り" }, { kind: "grant_decision", label: "交付決定（日）" },
    { kind: "order_date", label: "発注日" }, { kind: "contract_date", label: "契約日" },
  ] },
  { key: "pay", title: "納品・支払い時", items: [
    { kind: "delivery", label: "納品書" }, { kind: "invoice", label: "請求書" },
    { kind: "payment_proof", label: "振込明細" }, { kind: "receipt", label: "領収書" },
    { kind: "payment_date", label: "支払日" }, { kind: "payment_method", label: "支払方法" },
    { kind: "company_account", label: "会社名義口座か" },
  ] },
  { key: "report", title: "実績報告時", items: [
    { kind: "before_photo", label: "導入前写真" }, { kind: "after_photo", label: "導入後写真" },
    { kind: "deliverable", label: "成果物" }, { kind: "catalog", label: "カタログ" },
    { kind: "spec", label: "仕様書" }, { kind: "screenshot", label: "画面キャプチャ" },
    { kind: "report_memo", label: "実績報告書メモ" }, { kind: "effect_memo", label: "事業効果メモ" },
  ] },
];

// ---------- 期限・スケジュール ----------
export type DeadlineCatalogItem = { kind: string; label: string; relativeHint?: string };
export const DEADLINE_CATALOG: DeadlineCatalogItem[] = [
  { kind: "application_deadline", label: "公募締切" },
  { kind: "pre_consult_deadline", label: "事前相談期限" },
  { kind: "support_form_deadline", label: "様式発行依頼期限（商工会議所・商工会）" },
  { kind: "gbiz_deadline", label: "GビズID取得目安", relativeHint: "できれば今すぐ" },
  { kind: "estimate_deadline", label: "見積取得目安", relativeHint: "公募締切の2週間前" },
  { kind: "application_draft_deadline", label: "申請書作成期限" },
  { kind: "grant_decision_date", label: "交付決定日" },
  { kind: "implementation_deadline", label: "事業実施期限" },
  { kind: "payment_deadline", label: "支払期限" },
  { kind: "report_deadline", label: "実績報告期限" },
  { kind: "payment_received_date", label: "入金予定" },
];
export type DeadlineRecord = { date?: string; memo?: string };

// ---------- 公式確認ログ ----------
export type OfficialCheckLog = {
  id: string; projectId: string; checkedAt: string;
  target: string; method: string; question: string; answer: string;
  url?: string; contactName?: string; nextCheck?: string; status: "confirmed" | "needs_followup" | "unclear" | "not_applicable";
  createdAt: string;
};
export const CHECK_TARGET_LABEL: Record<string, string> = {
  official_guideline: "公式要領", secretariat: "事務局", local_government: "自治体", chamber: "商工会議所",
  society_of_commerce: "商工会", certified_support_org: "認定支援機関", labor_office: "労働局",
  expert: "専門家", vendor: "業者・ベンダー", other: "その他",
};
export const CHECK_METHOD_LABEL: Record<string, string> = {
  website: "公式サイト", phone: "電話", email: "メール", visit: "訪問", ai_reference: "AI（参考）", other: "その他",
};
export const CHECK_STATUS_LABEL: Record<OfficialCheckLog["status"], string> = {
  confirmed: "確認済み", needs_followup: "要フォロー", unclear: "不明", not_applicable: "対象外",
};

// ---------- AI回答のタスク化 ----------
export type AiTaskCandidate = {
  id: string; projectId: string; sourceResponseId?: string;
  title: string; reason?: string; status: "candidate" | "accepted" | "rejected";
  createdAt: string; acceptedAt?: string;
};

// ============ localStorage ストア ============
function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const r = window.localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fallback; } catch { return fallback; }
}
function write(key: string, val: unknown, evt = "case-records-changed") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(val));
  window.dispatchEvent(new Event(evt));
}
const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const DOC_KEY = "case_docs_v1";       // Record<projectId, Record<kind, DocRecord>>
const DL_KEY = "case_deadlines_v1";   // Record<projectId, Record<kind, DeadlineRecord>>
const LOG_KEY = "case_checklogs_v1";  // OfficialCheckLog[]
const TASK_KEY = "case_aitasks_v1";   // AiTaskCandidate[]

// --- 書類 ---
export function loadDocs(projectId: string): Record<string, DocRecord> {
  return read<Record<string, Record<string, DocRecord>>>(DOC_KEY, {})[projectId] ?? {};
}
export function setDoc(projectId: string, kind: string, patch: Partial<DocRecord>) {
  const all = read<Record<string, Record<string, DocRecord>>>(DOC_KEY, {});
  const cur = all[projectId] ?? {};
  const prev: DocRecord = cur[kind] ?? { status: "missing" };
  cur[kind] = { ...prev, ...patch, checkedAt: new Date().toISOString().slice(0, 10) };
  all[projectId] = cur;
  write(DOC_KEY, all);
}
export function docSummary(projectId: string): { phases: { key: string; title: string; ready: number; total: number }[]; missingImportant: string[] } {
  const docs = loadDocs(projectId);
  const IMPORTANT = ["estimate", "official_guideline", "payment_proof", "invoice"];
  const phases = DOC_CATALOG.map((ph) => ({
    key: ph.key, title: ph.title, total: ph.items.length,
    ready: ph.items.filter((it) => ["ready", "not_needed"].includes(docs[it.kind]?.status ?? "missing")).length,
  }));
  const labelOf = (kind: string) => DOC_CATALOG.flatMap((p) => p.items).find((i) => i.kind === kind)?.label ?? kind;
  const missingImportant = IMPORTANT.filter((k) => (docs[k]?.status ?? "missing") === "missing").map((k) => `${labelOf(k)}が未準備です`);
  return { phases, missingImportant };
}

// --- 期限 ---
export function loadDeadlines(projectId: string): Record<string, DeadlineRecord> {
  return read<Record<string, Record<string, DeadlineRecord>>>(DL_KEY, {})[projectId] ?? {};
}
export function setDeadline(projectId: string, kind: string, patch: Partial<DeadlineRecord>) {
  const all = read<Record<string, Record<string, DeadlineRecord>>>(DL_KEY, {});
  const cur = all[projectId] ?? {};
  cur[kind] = { ...cur[kind], ...patch };
  all[projectId] = cur;
  write(DL_KEY, all);
}
const daysFromToday = (iso?: string): number | null => {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d.getTime())) return null;
  const a = new Date(); a.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - a.getTime()) / 86400000);
};
// 直近で迫っている手入力の期限（0〜30日）。ホーム/通知の優先度に使う。
export function nextManualDeadline(projectId: string): { kind: string; label: string; date: string; days: number } | null {
  const dl = loadDeadlines(projectId);
  let best: { kind: string; label: string; date: string; days: number } | null = null;
  for (const item of DEADLINE_CATALOG) {
    const rec = dl[item.kind];
    const d = daysFromToday(rec?.date);
    if (d == null || d < 0) continue;
    if (!best || d < best.days) best = { kind: item.kind, label: item.label, date: rec!.date!, days: d };
  }
  return best;
}

// --- 公式確認ログ ---
export function loadCheckLogs(projectId: string): OfficialCheckLog[] {
  return read<OfficialCheckLog[]>(LOG_KEY, []).filter((l) => l.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function addCheckLog(l: Omit<OfficialCheckLog, "id" | "createdAt">): OfficialCheckLog {
  const all = read<OfficialCheckLog[]>(LOG_KEY, []);
  const log: OfficialCheckLog = { ...l, id: uid("log"), createdAt: new Date().toISOString() };
  all.unshift(log); write(LOG_KEY, all); return log;
}
export function deleteCheckLog(id: string) {
  write(LOG_KEY, read<OfficialCheckLog[]>(LOG_KEY, []).filter((l) => l.id !== id));
}

// --- AIタスク候補 ---
export function loadTaskCandidates(projectId: string): AiTaskCandidate[] {
  return read<AiTaskCandidate[]>(TASK_KEY, []).filter((t) => t.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function addTaskCandidates(projectId: string, titles: string[], sourceResponseId?: string): number {
  const all = read<AiTaskCandidate[]>(TASK_KEY, []);
  for (const title of titles) {
    all.unshift({ id: uid("aitask"), projectId, sourceResponseId, title, status: "candidate", createdAt: new Date().toISOString() });
  }
  write(TASK_KEY, all); return titles.length;
}
export function setTaskCandidateStatus(id: string, status: AiTaskCandidate["status"]) {
  const all = read<AiTaskCandidate[]>(TASK_KEY, []);
  const t = all.find((x) => x.id === id);
  if (t) { t.status = status; if (status === "accepted") t.acceptedAt = new Date().toISOString(); }
  write(TASK_KEY, all);
}
// AI回答テキストから「確認すること」候補を抽出（行・箇条書きベースのルール抽出。AIには投げない）。
export function extractTaskCandidates(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[0-9０-９]+[.)、．]|[-・*●○◦▪️•]|【.*?】)\s*/, "").trim())
    .filter((l) => l.length >= 6 && l.length <= 60)
    .filter((l) => /(確認|相談|取得|準備|提出|登録|見積|問い合わせ|チェック|揃え|保管|申請|届出)/.test(l))
    .slice(0, 8);
}
