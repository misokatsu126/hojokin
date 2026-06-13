// 補助金「実務」の記録：必要書類・証憑ボックス／期限・スケジュール／公式確認ログ／AI回答のタスク化。
//   ※ localStorage を即時キャッシュにしつつ、Supabase（case_records）に1案件1行で保存・同期する。
//   ※ AI回答は参考情報。確定情報にはしない。

import { supabaseConfigured, fetchCaseRecord, upsertCaseRecord } from "./supabase";

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
  { kind: "pre_consult_deadline", label: "事前相談期限", relativeHint: "公募締切より前に必要な場合があります" },
  { kind: "support_form_deadline", label: "様式発行依頼期限（商工会議所・商工会）", relativeHint: "持続化補助金などは公募締切より前に締切がある場合があります" },
  { kind: "gbiz_deadline", label: "GビズID取得目安", relativeHint: "できれば今すぐ" },
  { kind: "estimate_deadline", label: "見積取得目安", relativeHint: "公募締切の2週間前まで" },
  { kind: "application_draft_deadline", label: "申請書作成目安", relativeHint: "公募締切の1週間前まで" },
  { kind: "grant_decision_date", label: "交付決定日", relativeHint: "通知が出るまで発注しない" },
  { kind: "implementation_deadline", label: "事業実施期限" },
  { kind: "payment_deadline", label: "支払期限", relativeHint: "補助事業期間内に支払い完了が必要な場合があります" },
  { kind: "report_deadline", label: "実績報告期限", relativeHint: "事業完了後に期限があります" },
  { kind: "payment_received_date", label: "入金予定", relativeHint: "実績報告のあと（後払い）" },
];

// 公募締切から、見積取得・申請書作成の目安日を提案する（-14日 / -7日）。
export function suggestDeadlinesFromApplication(applicationDate: string): { estimate_deadline: string; application_draft_deadline: string } | null {
  const d = new Date(applicationDate);
  if (isNaN(d.getTime())) return null;
  const minus = (days: number) => { const x = new Date(d); x.setDate(x.getDate() - days); return x.toISOString().slice(0, 10); };
  return { estimate_deadline: minus(14), application_draft_deadline: minus(7) };
}
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
  title: string; reason?: string; status: "candidate" | "accepted" | "rejected" | "done";
  createdAt: string; acceptedAt?: string; doneAt?: string;
};

// 支出テーマ別の「この支出で特に重要な証憑」
export const THEME_DOC_GROUPS: { keys: string[]; title: string; items: { kind: string; label: string }[] }[] = [
  { keys: ["aircon", "energy", "machinery", "hygiene", "bcp", "vehicle", "decarbon"], title: "空調・省エネ・設備で特に重要", items: [
    { kind: "t_model", label: "型番" }, { kind: "t_energy_perf", label: "省エネ性能資料" }, { kind: "t_machine_catalog", label: "機器カタログ" },
    { kind: "t_before_const", label: "工事前写真" }, { kind: "t_after_const", label: "工事後写真" },
    { kind: "t_removal_detail", label: "既存設備撤去費の明細" }, { kind: "t_construction_detail", label: "施工内容の明細" },
  ] },
  { keys: ["ad", "signboard", "website", "event", "export", "inbound"], title: "広告・LP・看板で特に重要", items: [
    { kind: "t_creative", label: "制作物" }, { kind: "t_period", label: "掲載期間" }, { kind: "t_ad_report", label: "広告配信レポート" },
    { kind: "t_public_url", label: "公開URL" }, { kind: "t_flyer_data", label: "チラシデータ" },
    { kind: "t_sign_before", label: "看板施工前写真" }, { kind: "t_sign_after", label: "看板施工後写真" }, { kind: "t_deliverable_ss", label: "成果物スクリーンショット" },
  ] },
  { keys: ["ai_pos", "ec", "system", "ai", "labor_saving"], title: "IT・AI・POS・在庫管理で特に重要", items: [
    { kind: "t_tool_name", label: "ツール名" }, { kind: "t_plan", label: "契約プラン" }, { kind: "t_tool_registered", label: "対象ツール登録の有無" },
    { kind: "t_it_provider_check", label: "IT導入支援事業者の確認" }, { kind: "t_init_cost", label: "初期費用" }, { kind: "t_monthly_cost", label: "月額費用" },
    { kind: "t_support_cost", label: "導入支援費" }, { kind: "t_admin_capture", label: "管理画面キャプチャ" }, { kind: "t_start_date", label: "利用開始日" },
  ] },
  { keys: ["hire", "training", "wage", "workstyle"], title: "採用・研修・賃上げで特に重要", items: [
    { kind: "t_employment_contract", label: "雇用契約書" }, { kind: "t_work_rules", label: "就業規則" }, { kind: "t_wage_ledger", label: "賃金台帳" },
    { kind: "t_attendance", label: "出勤簿" }, { kind: "t_curriculum", label: "研修カリキュラム" }, { kind: "t_training_hours", label: "研修時間記録" }, { kind: "t_attendee_list", label: "受講者名簿" },
  ] },
  { keys: ["succession"], title: "事業承継・M&Aで特に重要", items: [
    { kind: "t_scheme", label: "承継スキーム概要" }, { kind: "t_expert_estimate", label: "専門家見積" }, { kind: "t_expert_contract", label: "専門家契約書" },
    { kind: "t_transfer_docs", label: "株式譲渡／事業譲渡資料" }, { kind: "t_pmi_docs", label: "PMI費用資料" }, { kind: "t_dd_docs", label: "デューデリジェンス費用資料" },
    { kind: "t_broker_docs", label: "仲介手数料資料" }, { kind: "t_license_docs", label: "許認可確認資料" },
  ] },
];
export function themeDocGroup(templateKey?: string): { title: string; items: { kind: string; label: string }[] } | null {
  if (!templateKey) return null;
  return THEME_DOC_GROUPS.find((g) => g.keys.includes(templateKey)) ?? null;
}

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
  markDirty(projectId);
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
  markDirty(projectId);
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
  all.unshift(log); write(LOG_KEY, all); markDirty(l.projectId); return log;
}
export function deleteCheckLog(id: string) {
  const all = read<OfficialCheckLog[]>(LOG_KEY, []);
  const pid = all.find((l) => l.id === id)?.projectId;
  write(LOG_KEY, all.filter((l) => l.id !== id));
  if (pid) markDirty(pid);
}

// --- AIタスク候補 ---
export function loadTaskCandidates(projectId: string): AiTaskCandidate[] {
  return read<AiTaskCandidate[]>(TASK_KEY, []).filter((t) => t.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
// 正式タスク化された（accepted・未完了）もの。getAllProjectTasks がこれを取り込む。
export function loadAcceptedTaskCandidates(projectId: string): AiTaskCandidate[] {
  return loadTaskCandidates(projectId).filter((t) => t.status === "accepted");
}
export function completeTaskCandidateByTaskKey(taskKey: string) {
  const id = taskKey.startsWith("ai:") ? taskKey.slice(3) : taskKey;
  setTaskCandidateStatus(id, "done");
}
export function addTaskCandidates(projectId: string, titles: string[], sourceResponseId?: string): number {
  const all = read<AiTaskCandidate[]>(TASK_KEY, []);
  for (const title of titles) {
    all.unshift({ id: uid("aitask"), projectId, sourceResponseId, title, status: "candidate", createdAt: new Date().toISOString() });
  }
  write(TASK_KEY, all); markDirty(projectId); return titles.length;
}
export function setTaskCandidateStatus(id: string, status: AiTaskCandidate["status"]) {
  const all = read<AiTaskCandidate[]>(TASK_KEY, []);
  const t = all.find((x) => x.id === id);
  if (t) { t.status = status; if (status === "accepted") t.acceptedAt = new Date().toISOString(); if (status === "done") t.doneAt = new Date().toISOString(); }
  write(TASK_KEY, all);
  if (t) markDirty(t.projectId);
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

// ============ Supabase 同期（1案件1行のJSONBブロブ） ============
const META_KEY = "case_meta_v1"; // Record<projectId, { updatedAt: string }>
let currentOwner = "";
export function setCaseOwner(owner: string) { currentOwner = owner || ""; }

function metaUpdatedAt(projectId: string): string {
  return read<Record<string, { updatedAt: string }>>(META_KEY, {})[projectId]?.updatedAt ?? "";
}
function setMetaUpdatedAt(projectId: string, iso: string) {
  const all = read<Record<string, { updatedAt: string }>>(META_KEY, {});
  all[projectId] = { updatedAt: iso };
  if (typeof window !== "undefined") window.localStorage.setItem(META_KEY, JSON.stringify(all));
}

type CaseBlob = { docs: Record<string, DocRecord>; deadlines: Record<string, DeadlineRecord>; checkLogs: OfficialCheckLog[]; aiTasks: AiTaskCandidate[] };
function getLocalBlob(projectId: string): CaseBlob {
  return {
    docs: loadDocs(projectId),
    deadlines: loadDeadlines(projectId),
    checkLogs: read<OfficialCheckLog[]>(LOG_KEY, []).filter((l) => l.projectId === projectId),
    aiTasks: read<AiTaskCandidate[]>(TASK_KEY, []).filter((t) => t.projectId === projectId),
  };
}
function applyBlob(projectId: string, blob: Partial<CaseBlob>) {
  if (typeof window === "undefined") return;
  const docsAll = read<Record<string, Record<string, DocRecord>>>(DOC_KEY, {}); docsAll[projectId] = blob.docs ?? {}; window.localStorage.setItem(DOC_KEY, JSON.stringify(docsAll));
  const dlAll = read<Record<string, Record<string, DeadlineRecord>>>(DL_KEY, {}); dlAll[projectId] = blob.deadlines ?? {}; window.localStorage.setItem(DL_KEY, JSON.stringify(dlAll));
  const logs = read<OfficialCheckLog[]>(LOG_KEY, []).filter((l) => l.projectId !== projectId).concat(blob.checkLogs ?? []); window.localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  const tasks = read<AiTaskCandidate[]>(TASK_KEY, []).filter((t) => t.projectId !== projectId).concat(blob.aiTasks ?? []); window.localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
  window.dispatchEvent(new Event("case-records-changed"));
}

const pushTimers: Record<string, ReturnType<typeof setTimeout>> = {};
// 変更時に呼ぶ：localの更新時刻を進め、クラウドへ遅延push（ベストエフォート）。
export function markDirty(projectId: string) {
  if (!projectId) return;
  setMetaUpdatedAt(projectId, new Date().toISOString());
  if (!supabaseConfigured || typeof window === "undefined") return;
  clearTimeout(pushTimers[projectId]);
  pushTimers[projectId] = setTimeout(() => {
    upsertCaseRecord({ project_id: projectId, owner: currentOwner, data: getLocalBlob(projectId), updated_at: metaUpdatedAt(projectId) })
      .catch((e) => console.warn("[caseRecords] cloud push failed:", (e as any)?.message ?? e));
  }, 800);
}

// 案件を開いたとき：クラウドと突き合わせ（updated_at が新しい方を採用）。
export async function syncCaseRecord(projectId: string) {
  if (!supabaseConfigured || typeof window === "undefined") return;
  try {
    const row = await fetchCaseRecord(projectId);
    const localAt = metaUpdatedAt(projectId);
    const remoteAt = row?.updated_at ?? "";
    if (row && remoteAt && remoteAt > localAt) {
      applyBlob(projectId, (row.data as CaseBlob) ?? {});
      setMetaUpdatedAt(projectId, remoteAt);
    } else if (localAt && (!row || localAt > remoteAt)) {
      await upsertCaseRecord({ project_id: projectId, owner: currentOwner, data: getLocalBlob(projectId), updated_at: localAt });
    }
  } catch (e) {
    console.warn("[caseRecords] sync failed (localStorage 継続):", (e as any)?.message ?? e);
  }
}
