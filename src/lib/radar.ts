import type {
  DiscoveredItem,
  SourceSite,
  ExtractionResult,
  ExtractedGrantCandidate,
  GrantInput,
} from "./types";
import {
  REGIONS,
  INDUSTRIES,
  EXPENSE_CATEGORIES,
  ENTITY_TYPES,
  GRANT_TYPES,
  SECONDARY_SOURCE_TYPES,
  SOURCE_TYPE_DEFAULT_TRUST,
  SECONDARY_SOURCE_WARNING_TEXT,
  OFFICIAL_UNCONFIRMED_WARNING_TEXT,
  type SourceType,
  type TrustLevel,
} from "./constants";

// 情報源カテゴリから既定の信頼度を導く
export function deriveTrustLevel(sourceType: SourceType | null | undefined): TrustLevel {
  if (!sourceType) return "E";
  return SOURCE_TYPE_DEFAULT_TRUST[sourceType] ?? "E";
}

// 二次情報（民間まとめ・記事・ニュース・不明）かどうか
export function isSecondarySource(sourceType: SourceType | null | undefined): boolean {
  if (!sourceType) return true;
  return SECONDARY_SOURCE_TYPES.includes(sourceType);
}

// 公式URLが公的ドメインらしいか（go.jp / lg.jp / city.* など）を簡易判定
export function looksOfficialUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(go|lg)\.jp|\.city\.|\.pref\.|\.town\.|\.vill\.|jgrants|mirasapo|smrj\.go\.jp/i.test(url);
}

// 候補に表示すべき注意文（複数）を返す
export function candidateWarnings(opts: {
  sourceType: SourceType | null | undefined;
  officialConfirmed: boolean;
}): string[] {
  const warnings: string[] = [];
  if (isSecondarySource(opts.sourceType)) warnings.push(SECONDARY_SOURCE_WARNING_TEXT);
  if (!opts.officialConfirmed) warnings.push(OFFICIAL_UNCONFIRMED_WARNING_TEXT);
  return warnings;
}

// ---- ルールベース抽出（OpenAIキーなしでも動く） ----

const AMOUNT_MAN = /(?:上限|補助上限|最大|最高)[^0-9]{0,8}([0-9,]+)\s*万円/;
const ANY_MAN = /([0-9,]+)\s*万円/;
const ANY_OKU = /([0-9,]+(?:\.[0-9]+)?)\s*億円/;
const RATE = /([0-9]\s*\/\s*[0-9]|[0-9]{1,3}\s*[%％]|定額)/;
const ISO_DATE = /([0-9]{4})[\/\-年]\s*([0-9]{1,2})[\/\-月]\s*([0-9]{1,2})日?/;

function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function scanList(text: string, options: readonly string[]): string[] {
  const found: string[] = [];
  for (const o of options) {
    if (o.startsWith("全")) continue; // 「全国」「全業種」は明示一致のみ
    if (text.includes(o)) found.push(o);
  }
  return found;
}

function parseDate(m: RegExpMatchArray | null): string | null {
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]).toString().padStart(2, "0");
  const d = Number(m[3]).toString().padStart(2, "0");
  if (!y || !mo || !d) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * discovered_item の本文・タイトルから補助金情報をルールベースで抽出する。
 * AIキーがあれば ai.ts 側で上書きされるが、これは常にフォールバックとして機能する。
 */
export function ruleExtract(item: DiscoveredItem, site?: SourceSite | null): ExtractionResult {
  const text = [item.title ?? "", item.raw_text ?? ""].join("\n");
  const sourceType = item.source_category ?? site?.source_type ?? null;

  const name = (item.title ?? "").trim() || "（名称未抽出の候補）";

  // 種別
  let grant_type: string | null = null;
  for (const t of GRANT_TYPES) {
    if (t !== "その他" && text.includes(t)) {
      grant_type = t;
      break;
    }
  }

  // 金額
  let max_amount: number | null = null;
  const mMan = text.match(AMOUNT_MAN) ?? text.match(ANY_MAN);
  const mOku = text.match(ANY_OKU);
  if (mOku) max_amount = Math.round(num(mOku[1]) * 100_000_000);
  else if (mMan) max_amount = num(mMan[1]) * 10_000;

  // 補助率
  const rate = text.match(RATE);
  const subsidy_rate = rate ? rate[1].replace(/\s/g, "") : null;

  // 締切・開始日（本文中の最初の日付を締切候補にする簡易ロジック）
  const deadline = parseDate(text.match(ISO_DATE));

  // 募集状態
  let application_status: string | null = null;
  if (/(募集終了|受付終了|終了しました|締切ました|受付を終了)/.test(text)) application_status = "終了";
  else if (/(募集中|受付中|公募中)/.test(text)) application_status = "募集中";
  else if (/(募集予定|公募予定|今後)/.test(text)) application_status = "募集予定";

  const target_regions = scanList(text, REGIONS);
  const target_industries = scanList(text, INDUSTRIES);
  const target_business_types = scanList(text, ENTITY_TYPES);
  const eligible_expenses = scanList(text, EXPENSE_CATEGORIES);

  const pre_application_ng_risk = /(交付決定前|事前着手|着手前|契約.{0,4}前|発注.{0,4}前)/.test(text);
  const professional_check_recommended = /(社会保険労務士|社労士|行政書士|認定支援機関|税理士|専門家)/.test(text);

  const official_url = item.official_url ?? (looksOfficialUrl(item.url) ? item.url : null);
  const official_pdf_url = item.official_pdf_url ?? item.pdf_url ?? null;

  // 抽出できなかった項目を記録
  const missing_fields: string[] = [];
  if (!grant_type) missing_fields.push("種別");
  if (max_amount == null) missing_fields.push("補助上限額");
  if (!subsidy_rate) missing_fields.push("補助率");
  if (!deadline) missing_fields.push("締切日");
  if (target_regions.length === 0) missing_fields.push("対象地域");
  if (target_industries.length === 0) missing_fields.push("対象業種");
  if (eligible_expenses.length === 0) missing_fields.push("対象経費");
  if (!official_url && !official_pdf_url) missing_fields.push("公式URL/公募要領PDF");

  // 信頼度ベースの確信度（公式に近いほど高く、欠損が多いほど低く）
  const filled = 8 - missing_fields.length;
  const trustBonus = isSecondarySource(sourceType) ? 0 : 25;
  const confidence_score = Math.max(
    5,
    Math.min(95, Math.round((filled / 8) * 60) + trustBonus + (official_url ? 10 : 0))
  );

  return {
    name,
    grant_type,
    organizer: site?.name ?? null,
    target_regions,
    target_industries,
    target_business_types,
    target_people: null,
    eligible_expenses,
    subsidy_rate,
    max_amount,
    min_amount: null,
    application_start_date: null,
    deadline,
    application_status,
    application_method: null,
    required_documents: null,
    official_url,
    official_pdf_url,
    notes: null,
    pre_application_ng_risk,
    professional_check_recommended,
    confidence_score,
    missing_fields,
  };
}

/**
 * 人間が承認した抽出候補を、正式登録用の GrantInput に変換する。
 * 既存の grants スキーマに合わせてマッピングする（既存の照合導線を壊さない）。
 */
export function candidateToGrantInput(c: ExtractedGrantCandidate): GrantInput {
  const trust = c.trust_level ?? "E";
  return {
    name: c.name ?? "（名称未設定）",
    grant_type: c.grant_type ?? "その他",
    organization: c.organizer,
    org_type: null,
    regions: c.target_regions ?? [],
    industries: c.target_industries ?? [],
    entity_types: c.target_business_types ?? [],
    target_audience: c.target_people,
    expense_categories: c.eligible_expenses ?? [],
    subsidy_rate: c.subsidy_rate,
    min_amount: c.min_amount,
    max_amount: c.max_amount,
    application_start: c.application_start_date,
    application_deadline: c.deadline,
    recruitment_status: c.application_status ?? "不明",
    application_method: c.application_method,
    required_documents: c.required_documents,
    official_url: c.official_url,
    guideline_pdf_url: c.official_pdf_url,
    notes: c.notes,
    pre_application_ng: c.pre_application_ng_risk,
    requires_professional: c.professional_check_recommended,
    keywords: [],
    purposes: [],
    exclusion_conditions: null,
    early_termination_risk: false,
    selection_type: "不明",
    difficulty: "不明",
    source: `自動探索（信頼度${trust}）`,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * 重複候補・過年度候補の簡易検知。
 * 既存 grants / 他の discovered_items とタイトル・公式URLの近さで判定する。
 */
export function detectDuplicateFlags(
  item: { title: string | null; official_url: string | null; url: string | null },
  existingTitles: { id: string; title: string | null; url: string | null }[]
): { duplicateOfId: string | null; isOldYear: boolean } {
  const title = (item.title ?? "").replace(/\s/g, "");
  const isOldYear = /(令和[0-9０-９]+年度|平成[0-9０-９]+年度|過年度|昨年度|前年度|[0-9]{4}年度)/.test(
    item.title ?? ""
  );
  let duplicateOfId: string | null = null;
  for (const e of existingTitles) {
    const et = (e.title ?? "").replace(/\s/g, "");
    if (!et || !title) continue;
    // 公式URL一致、またはタイトルが一方を包含する場合は重複候補
    if (
      (item.official_url && e.url && item.official_url === e.url) ||
      (title.length > 4 && (et.includes(title) || title.includes(et)))
    ) {
      duplicateOfId = e.id;
      break;
    }
  }
  return { duplicateOfId, isOldYear };
}
