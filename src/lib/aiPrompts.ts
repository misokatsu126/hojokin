// 「自分のAIに相談する」：案件情報から ChatGPT/Claude/Gemini に貼れる高品質プロンプトを生成する。
//   ※ サイト側で AI API は使わない。ユーザーが自分のAIにコピペして相談するための文章を作るだけ。
//   ※ AIの回答は申請可否を保証しない。最終判断は公式要領・窓口・専門家。

import { ORDER_STATUS_LABEL, formatBudget, getTemplate, type SpendingProject } from "./projects";

export type AiPromptKind =
  | "subsidy_check"
  | "guideline_reading"
  | "estimate_check"
  | "application_material"
  | "consult_message"
  | "payment_check"
  | "evidence_report";

export type AiPromptDraft = {
  id: string;
  projectId: string;
  kind: AiPromptKind;
  title: string;
  description: string;
  prompt: string;
  createdAt: string;
  copiedAt?: string;
};

export type ExternalAiResponse = {
  id: string;
  projectId: string;
  promptKind: AiPromptKind;
  title: string;
  content: string;
  createdAt: string;
  status: "reference" | "needs_review" | "converted_to_task";
  extractedTasks?: string[];
};

// プライバシー：何を伏せるか
export type PrivacyOpts = { maskNames: boolean; budgetApprox: boolean; cityOnly: boolean };
export const DEFAULT_PRIVACY: PrivacyOpts = { maskNames: false, budgetApprox: false, cityOnly: false };

// 相談先
export const CONSULT_TARGETS = [
  "商工会議所", "商工会", "自治体窓口", "認定支援機関", "社労士", "税理士", "行政書士", "中小企業診断士", "IT導入支援事業者", "業者・ベンダー",
] as const;
export type ConsultTarget = (typeof CONSULT_TARGETS)[number];

export const COMMON_NOTE =
  "注意：\nAIの回答は申請可否や採択を保証するものではありません。\n最終判断は必ず公式要領・事務局・自治体窓口・商工会議所・専門家に確認してください。\n個人情報・機密情報は必要に応じて伏せてください。";

// ---- プライバシー反映ヘルパー ----
function regionOf(p: SpendingProject, o: PrivacyOpts): string {
  const loc = (p.location || "").trim();
  if (!loc) return "（未入力）";
  if (o.cityOnly) { const m = loc.match(/^(.*?[市区町村])/); return m ? m[1] : loc; }
  return loc;
}
function budgetOf(p: SpendingProject, o: PrivacyOpts): string {
  if (p.budget == null) return "（未入力）";
  if (o.budgetApprox) return `約${formatBudget(Math.round(p.budget / 100000) * 100000)}（概算）`;
  return formatBudget(p.budget);
}
function companyOf(p: SpendingProject, o: PrivacyOpts): string {
  if (o.maskNames) return "（会社名・店舗名は非公開）";
  return p.store || "（未入力）";
}
function themeOf(p: SpendingProject): string {
  const tpl = getTemplate(p.templateKey);
  return tpl?.label || p.uses[0] || p.purpose || p.name || "（支出テーマ未設定）";
}
function detailOf(p: SpendingProject): string {
  return p.purpose || p.uses.join("、") || p.name || "（内容未入力）";
}
function estimateStatusOf(p: SpendingProject): string {
  if (p.checklist?.["estimate"]) return "見積取得済み";
  if (p.orderStatus === "estimate") return "見積だけ取得";
  return "未取得";
}

// 事業者・支出の基本ブロック（多くのプロンプトで共通）
function contextBlock(p: SpendingProject, o: PrivacyOpts): string {
  return [
    "【事業者情報】",
    `地域：${regionOf(p, o)}`,
    `業種：${p.industry || "（未入力）"}`,
    `法人／個人：${p.entity || "（未入力）"}`,
    `従業員数：${p.employees != null ? `${p.employees}人` : "（未入力）"}`,
    `店舗・事業：${companyOf(p, o)}`,
    "",
    "【支出予定】",
    `支出テーマ：${themeOf(p)}`,
    `内容：${detailOf(p)}`,
    `予算：${budgetOf(p, o)}`,
    `実施予定時期：${p.schedule || "（未入力）"}`,
    `発注状況：${ORDER_STATUS_LABEL[p.orderStatus]}`,
    `見積状況：${estimateStatusOf(p)}`,
  ].join("\n");
}

// 見積チェックの支出テーマ別項目
function estimateCheckItems(p: SpendingProject): { category: string; items: string[] } {
  const tk = p.templateKey ?? "";
  if (["aircon", "energy", "machinery", "hygiene", "bcp", "vehicle", "decarbon"].includes(tk)) {
    return {
      category: "空調・設備系",
      items: ["宛名", "発行日", "業者名", "機器名", "型番", "数量", "単価", "工事費", "既存設備の撤去費", "省エネ性能が分かる情報", "「一式」表記が多すぎないか", "補助対象外っぽい項目が混ざっていないか"],
    };
  }
  if (["ai_pos", "ec", "system", "ai"].includes(tk)) {
    return {
      category: "IT・AI・POS・在庫管理系",
      items: ["ツール名", "ベンダー名", "初期費用", "月額費用", "導入支援費", "保守費", "対象ツール登録の有無", "IT導入支援事業者か", "契約前か", "支払い前か"],
    };
  }
  if (["ad", "signboard", "event", "export", "inbound", "website"].includes(tk)) {
    return {
      category: "広告・LP・看板系",
      items: ["制作物の内容", "掲載期間", "制作費", "広告運用費", "デザイン費", "印刷費", "施工費", "数量", "単価", "成果物が分かるか", "「一式」表記が多すぎないか"],
    };
  }
  return { category: "一般", items: ["宛名", "発行日", "業者名", "品目・内容", "数量", "単価", "工事費・委託費", "「一式」表記が多すぎないか", "対象外の項目が混ざっていないか"] };
}

const numbered = (arr: string[]) => arr.map((s, i) => `${i + 1}. ${s}`).join("\n");
const bullets = (arr: string[]) => (arr.length ? arr.map((s) => `・${s}`).join("\n") : "・（なし）");

// ============ 各プロンプト生成 ============

export function subsidyCheckPrompt(p: SpendingProject, coreNames: string[], tasks: string[], missing: string[], o: PrivacyOpts): string {
  return [
    "以下の補助金の相談について、対象になりそうな制度・注意点・次に確認すべきことを、断定せず整理してください。",
    "",
    contextBlock(p, o),
    "",
    "【このサイトで候補になっている定番制度】",
    bullets(coreNames),
    "",
    "【今日やる申請準備】",
    bullets(tasks),
    ...(missing.length ? ["", "【まだ分かっていない情報】", bullets(missing)] : []),
    "",
    "【確認したいこと】",
    numbered([
      "使える可能性がある補助金（国・自治体・厚労省系を含めて）",
      "発注（契約・注文）の前に確認すべきこと",
      "対象経費になりそうか／対象外になりそうな費用",
      "相談先（商工会議所・自治体・専門家など）",
      "見積書に入れておくべき項目",
      "申請時に注意すべき落とし穴",
    ]),
    "",
    COMMON_NOTE,
  ].join("\n");
}

export function guidelineReadingPrompt(p: SpendingProject, o: PrivacyOpts): string {
  return [
    "これから貼り付ける『公募要領・公式ページの本文』を読んで、補助金申請に必要な情報を整理してください。",
    "特に以下を、書かれている範囲で抽出してください（書かれていなければ「記載なし」と明記）。",
    "",
    numbered([
      "制度名", "募集年度・公募回", "対象者", "対象地域", "対象経費", "対象外経費",
      "補助率", "補助上限", "公募締切", "事前相談の期限",
      "交付決定前の契約・発注・支払いが可能か（重要）", "必要書類", "申請方法",
      "採択後の流れ", "実績報告で必要になる証憑", "初心者向けの3行要約", "注意すべき落とし穴",
    ]),
    "",
    "そのうえで、以下の案件にこの制度が使える可能性があるか、断定せず『確認すべきポイント』として整理してください。",
    "",
    contextBlock(p, o),
    "",
    "――――――（この下に公募要領・公式ページの本文を貼ってください）――――――",
    "",
    COMMON_NOTE,
  ].join("\n");
}

export function estimateCheckPrompt(p: SpendingProject, o: PrivacyOpts): string {
  const { category, items } = estimateCheckItems(p);
  return [
    `これから貼り付ける『見積書』について、補助金申請で不備になりそうな点をチェックしてください（支出テーマ：${themeOf(p)}／分類：${category}）。`,
    "",
    "【この支出の内容】",
    detailOf(p),
    "",
    "【特に確認してほしい項目】",
    bullets(items),
    "",
    "【確認してほしいこと】",
    numbered([
      "宛名・発行日・業者名があるか",
      "品目・数量・単価が具体的か",
      "「一式」表記が多すぎないか",
      "補助対象の費用と対象外の費用が混ざっていないか",
      "申請前に業者へ修正依頼した方がよい点",
      "追加で必要になりそうな資料",
    ]),
    "",
    "――――――（この下に見積書の内容を貼る、または画像／PDFを読み込ませてください）――――――",
    "",
    COMMON_NOTE,
  ].join("\n");
}

export function applicationMaterialPrompt(p: SpendingProject, o: PrivacyOpts): string {
  return [
    "以下の支出案件について、補助金申請書を書くための『素材メモ』を作ってください。",
    "完成した申請書ではなく、申請書に使う材料として整理してください。",
    "",
    contextBlock(p, o),
    "",
    "【作ってほしい内容】",
    numbered([
      "現在の課題", "導入目的", "導入する内容", "導入後の効果",
      "売上・集客への影響", "業務効率化への影響", "販路開拓・顧客満足度への影響",
      "補助金の目的との関係", "事業計画書に使えそうな自然な表現", "盛りすぎ・弱い表現の注意",
    ]),
    "",
    "誇張せず、公式要領に合わせて確認が必要な前提で作ってください。",
    "",
    COMMON_NOTE,
  ].join("\n");
}

const CONSULT_PURPOSE: Record<ConsultTarget, string[]> = {
  "商工会議所": ["小規模事業者持続化補助金の対象になるか", "管轄（商工会議所／商工会）の確認", "事業支援計画書（様式4）の相談", "事前相談の期限"],
  "商工会": ["小規模事業者持続化補助金の対象になるか", "管轄の確認", "事業支援計画書の相談", "事前相談の期限"],
  "自治体窓口": ["地域の補助金（空き店舗・設備・省エネ・販路開拓など）の対象になるか", "申請時期・予算枠", "事前相談の要否"],
  "認定支援機関": ["ものづくり・新事業進出などの事業計画づくり", "対象になりそうな制度", "申請スケジュール"],
  "社労士": ["業務改善助成金・キャリアアップ助成金・人材開発支援助成金の対象になるか", "賃上げ・雇用条件・就業規則の整備", "事前の計画届"],
  "税理士": ["対象経費・会計処理の考え方", "資金繰り・自己負担（後払い）の確認"],
  "行政書士": ["申請書類の作成支援", "許認可が関係するか"],
  "中小企業診断士": ["事業計画・申請書のブラッシュアップ", "対象になりそうな制度の整理"],
  "IT導入支援事業者": ["導入予定ツールが対象ツールに登録されているか", "共同申請できるか", "発注前に何が必要か", "GビズIDの準備"],
  "業者・ベンダー": ["補助金申請に使える見積書の出し方", "型番・仕様・対象ツール登録などの情報", "発注・契約のタイミング"],
};

export function consultMessagePrompt(p: SpendingProject, o: PrivacyOpts, target: ConsultTarget): string {
  return [
    `${target}に相談・問い合わせするための文章を作ってください。丁寧で簡潔な、そのまま送れる文面にしてください。`,
    "",
    contextBlock(p, o),
    "",
    `【${target}に確認したいこと】`,
    bullets(CONSULT_PURPOSE[target]),
    "",
    "【文章の条件】",
    bullets(["相手にすぐ伝わる件名・本文", "長すぎない", "確認したいことが箇条書きで分かる", "返信しやすい締め"]),
    "",
    COMMON_NOTE,
  ].join("\n");
}

export function paymentCheckPrompt(p: SpendingProject, o: PrivacyOpts): string {
  return [
    "交付決定後・実施中の補助金案件について、支払い前に『補助金で不利になる点』がないか確認してください。",
    "",
    contextBlock(p, o),
    "",
    "【確認してほしいこと】",
    numbered([
      "交付決定の後に契約・発注しているか",
      "発注日→契約日→納品日→請求日→支払日 の順番が正しいか",
      "支払いは会社（事業）名義の口座か",
      "銀行振込で、振込明細が残るか",
      "請求書の金額と支払額が一致しているか",
      "支払先が見積書・請求書と同じか",
      "現金払いになっていないか（証憑が弱くないか）",
      "クレジットカード払いの場合の名義・支払回数",
    ]),
    "",
    COMMON_NOTE,
  ].join("\n");
}

export function evidenceReportPrompt(p: SpendingProject, o: PrivacyOpts): string {
  return [
    "採択・交付決定の後の『実績報告・証憑（しょうひょう）管理』で必要になるものを整理してください。",
    "",
    contextBlock(p, o),
    "",
    "【そろっているか確認したい書類・証憑】",
    bullets(["見積書", "発注書", "契約書", "納品書", "請求書", "振込明細", "領収書", "成果物（現物・画面など）", "導入前の写真", "導入後の写真", "カタログ", "仕様書", "支払い証憑"]),
    "",
    "【チェックしてほしいこと】",
    numbered([
      "上記のうち不足しているもの",
      "日付の整合性（発注→納品→請求→支払の順）",
      "金額の整合性（見積・請求・支払が一致するか）",
      "宛名の整合性（すべて同じ事業者名か）",
      "実績報告でよくある不備・落とし穴",
    ]),
    "",
    COMMON_NOTE,
  ].join("\n");
}

// kind から生成（consult は target 必須）
export function buildPrompt(
  kind: AiPromptKind,
  p: SpendingProject,
  o: PrivacyOpts,
  extra: { coreNames?: string[]; tasks?: string[]; missing?: string[]; target?: ConsultTarget }
): string {
  switch (kind) {
    case "subsidy_check": return subsidyCheckPrompt(p, extra.coreNames ?? [], extra.tasks ?? [], extra.missing ?? [], o);
    case "guideline_reading": return guidelineReadingPrompt(p, o);
    case "estimate_check": return estimateCheckPrompt(p, o);
    case "application_material": return applicationMaterialPrompt(p, o);
    case "consult_message": return consultMessagePrompt(p, o, extra.target ?? "商工会議所");
    case "payment_check": return paymentCheckPrompt(p, o);
    case "evidence_report": return evidenceReportPrompt(p, o);
  }
}

// ============ AI回答の貼り戻し（参考情報として保存） ============
const RESP_KEY = "ai_responses_v1";

export function loadResponses(projectId: string): ExternalAiResponse[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RESP_KEY);
    const all = raw ? (JSON.parse(raw) as ExternalAiResponse[]) : [];
    return (Array.isArray(all) ? all : []).filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function loadAllResponses(): ExternalAiResponse[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RESP_KEY);
    const all = raw ? (JSON.parse(raw) as ExternalAiResponse[]) : [];
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

export function saveResponse(r: Omit<ExternalAiResponse, "id" | "createdAt">): ExternalAiResponse {
  const resp: ExternalAiResponse = { ...r, id: `air_${Date.now()}_${Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString() };
  const all = loadAllResponses();
  all.unshift(resp);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RESP_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("ai-responses-changed"));
  }
  return resp;
}

export function deleteResponse(id: string) {
  const all = loadAllResponses().filter((r) => r.id !== id);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RESP_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("ai-responses-changed"));
  }
}
