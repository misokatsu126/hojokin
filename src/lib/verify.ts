// 検索結果の検証ゲート：「検索ヒット＝補助金候補」にしない。
//   ページ種別 → 公式/民間/ノイズ → 制度ページ → 要件抽出 → 年度・募集状況 → 表示可否 の順で判定。
//   タイトル/URLだけでなく本文（raw_text）から制度名・対象者・対象経費・補助率・上限・募集期間・
//   公募要領・問い合わせ先を探し、ほとんど取れなければユーザー表示せず管理者確認待ちにする。
//   ※ ノイズ（採択結果・議会・入札・ニュース・セミナー・営業ページ）は除外。
//      民間まとめ・士業記事は削除せず「発見用」として管理者確認待ちに残す。

import type { DiscoveredItem, BusinessProfile } from "./types";
import { ruleExtract } from "./discovery";

// ページ種別
export type PageType =
  | "official_grant_page" | "official_pdf" | "official_index"
  | "private_summary" | "news_article" | "past_result" | "seminar"
  | "bid_or_procurement" | "council_or_budget" | "company_sales_page" | "unknown";

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  official_grant_page: "公式の制度ページ",
  official_pdf: "公式の公募要領PDF",
  official_index: "公式の補助金一覧",
  private_summary: "民間まとめ・士業記事",
  news_article: "ニュース記事",
  past_result: "採択結果・交付決定一覧",
  seminar: "セミナー案内",
  bid_or_procurement: "入札・調達情報",
  council_or_budget: "議会・予算資料",
  company_sales_page: "施工・制作会社の営業ページ",
  unknown: "判定不能",
};

// 表示可否の状態
export type VerifyState = "user_visible" | "admin_review" | "reference_only" | "rejected_noise" | "archived_or_old";
export const VERIFY_STATE_LABEL: Record<VerifyState, string> = {
  user_visible: "表示OK（公式・制度ページ）",
  admin_review: "管理者確認待ち",
  reference_only: "参考情報",
  rejected_noise: "ノイズ除外",
  archived_or_old: "古い・募集終了の可能性",
};

// ノイズ・種別判定パターン
const PAT = {
  past_result: /(採択結果|採択者|交付決定(一覧|者)|採択事業者|選定結果|採択一覧)/,
  council: /(議会|定例会|委員会資料|予算(案|資料|説明書?)|決算(書|資料))/,
  bid: /(入札|落札|一般競争|指名競争|調達|プロポーザル(公告|方式)|見積(合せ|り合わせ))/,
  seminar: /(セミナー|説明会|相談会|ウェビナー)(の)?(案内|開催|参加者?募集|お知らせ)/,
  news: /(プレスリリース|ニュースリリース|報道発表|記者発表|ニュース一覧)/,
  sales: /(導入事例|活用事例|成功事例|お客様の声|施工事例|弊社|当社では|お見積りはこちら|無料相談受付)/,
  index: /(補助金(一覧|の一覧|制度一覧)|支援制度(一覧)?|助成金一覧|支援メニュー)/,
};

function endedOrOld(text: string): string | null {
  if (/(募集(は)?終了|受付(を)?終了|受付終了しました|申請(は)?締め切り|終了しました)/.test(text)) return "募集終了の可能性";
  const m = text.match(/(?:令和|R)\s*([0-9０-９]{1,2})\s*年度/);
  if (m) {
    const n = Number(m[1].replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d).toString()));
    if (n && n <= 4) return "古い年度（令和4年度以前）の可能性";
  }
  const y = text.match(/(20[0-9]{2})\s*年度/);
  if (y && Number(y[1]) <= 2022) return "古い年度の可能性";
  return null;
}

function isOfficial(item: DiscoveredItem): boolean {
  if (item.official_source_confirmed) return true;
  const url = `${item.official_url ?? ""} ${item.url ?? ""}`;
  if (/\.(go|lg)\.jp|\.(city|pref|town|vill)\.|jgrants|smrj\.go\.jp|mirasapo/i.test(url)) return true;
  return ["jgrants", "official_city", "official_prefecture"].includes(item.external_source ?? "");
}
function isSecondary(item: DiscoveredItem): boolean {
  if (isOfficial(item)) return false;
  const t = item.trust_level ?? "E";
  return t === "C" || t === "D" || t === "E" || ["feed", "crawl"].includes(item.external_source ?? "");
}

// 本文から「制度ページに必要な要素」がいくつ取れるか
export type Requirements = {
  name: boolean; target: boolean; expense: boolean; rate: boolean; cap: boolean;
  period: boolean; method: boolean; guideline: boolean; contact: boolean; count: number;
};
function detectRequirements(item: DiscoveredItem, text: string): Requirements {
  const has = (re: RegExp) => re.test(text);
  const r = {
    name: has(/(補助金|助成金|給付金|支援金|補助制度|助成制度)/),
    target: has(/(対象者|対象事業者|対象となる|対象企業|対象は)/),
    expense: has(/(対象経費|補助対象経費|助成対象|対象となる経費)/),
    rate: has(/(補助率|助成率)/),
    cap: has(/(補助上限|上限額|助成上限|限度額|上限\s*[0-9０-９])/),
    period: has(/(募集期間|受付期間|申請期間|公募期間|締切|締め切り)/) || !!item.extracted_deadline,
    method: has(/(申請方法|申請手続|電子申請|郵送|gBiz|GビズID|jGrants)/),
    guideline: has(/(公募要領|募集要項|交付要綱|実施要綱|交付要領)/) || !!item.official_pdf_url || !!item.pdf_url,
    contact: has(/(問い?合わせ|問合せ|お問い合わせ|連絡先|担当課|担当者)/),
  };
  const count = Object.values(r).filter(Boolean).length;
  return { ...r, count };
}

function detectPageType(item: DiscoveredItem, text: string, official: boolean, secondary: boolean, req: Requirements): PageType {
  if (PAT.past_result.test(text)) return "past_result";
  if (PAT.council.test(text)) return "council_or_budget";
  if (PAT.bid.test(text)) return "bid_or_procurement";
  if (PAT.seminar.test(text)) return "seminar";
  if (PAT.news.test(text)) return "news_article";
  if (!official && secondary && PAT.sales.test(text)) return "company_sales_page";
  const isPdf = !!(item.official_pdf_url || item.pdf_url) || /\.pdf(\?|$)/i.test(item.url ?? "");
  const grant = req.name;
  if (official && isPdf && (req.guideline || grant)) return "official_pdf";
  if (official && PAT.index.test(text) && req.count < 3) return "official_index";
  if (official && grant) return "official_grant_page";
  if (secondary && grant) return "private_summary";
  return "unknown";
}

const SCORE_BY_TYPE: Partial<Record<PageType, number>> = {
  official_grant_page: 30, official_pdf: 30, official_index: 15,
  private_summary: -20, news_article: -30, past_result: -40,
  seminar: -30, bid_or_procurement: -30, council_or_budget: -30, company_sales_page: -25,
};

export type VerifyResult = {
  state: VerifyState;
  pageType: PageType;
  score: number;
  noise: string[];
  official: boolean;
  grantPage: boolean;
  req: Requirements;
  extracted: { name: string; regions: string[]; expenses: string[]; rate: string | null; maxAmount: number | null; deadline: string | null };
  userVisible: boolean;
  label: string;
  tone: string;
};

export function verifyItem(item: DiscoveredItem, profile?: BusinessProfile | null): VerifyResult {
  const text = `${item.title ?? ""}\n${item.raw_text ?? ""}`;
  const official = isOfficial(item);
  const secondary = isSecondary(item);
  const req = detectRequirements(item, text);
  const pageType = detectPageType(item, text, official, secondary, req);
  const old = endedOrOld(text);
  const ex = ruleExtract(item);

  // 信頼度スコア
  let score = SCORE_BY_TYPE[pageType] ?? 0;
  score += req.count * 8; // 要件が取れているほど加点
  if (item.official_pdf_url || item.pdf_url || req.guideline) score += 10;
  if (old?.includes("募集終了")) score -= 30;
  if (old?.includes("古い")) score -= 30;
  const noise: string[] = [];
  if (pageType === "past_result") noise.push("過去の採択・交付決定一覧");
  if (pageType === "council_or_budget") noise.push("議会・予算資料");
  if (pageType === "bid_or_procurement") noise.push("入札・調達情報");
  if (pageType === "seminar") noise.push("セミナー・説明会の案内");
  if (pageType === "news_article") noise.push("ニュース・プレスリリース");
  if (pageType === "company_sales_page") noise.push("施工・制作会社の営業ページ");

  // 案件との一致
  if (profile) {
    if ((profile.regions ?? []).some((r) => r && text.includes(r))) score += 10;
    if ((profile.expenses ?? []).some((e) => e && text.includes(e))) score += 10;
  }

  // 状態の決定（ノイズ → 古い/終了 → 公式制度ページ → 公式だが要件薄い/民間 → 不明）
  const NOISE_TYPES: PageType[] = ["past_result", "council_or_budget", "bid_or_procurement", "seminar", "news_article", "company_sales_page"];
  let state: VerifyState;
  if (NOISE_TYPES.includes(pageType)) state = "rejected_noise";
  else if (old) state = "archived_or_old";
  else if ((pageType === "official_grant_page" || pageType === "official_pdf") && req.count >= 3) state = "user_visible";
  else if (pageType === "private_summary" || pageType === "official_index" || ((pageType === "official_grant_page" || pageType === "official_pdf") && req.count < 3)) state = "admin_review";
  else state = "reference_only";

  // ユーザー画面に出してよいのは「公式・制度ページで要件が説明できるもの」だけ（狭く見せる）
  const userVisible = state === "user_visible";

  // 確度ラベル
  let label: string, tone: string;
  if (pageType === "official_pdf" && state === "user_visible") { label = "公式PDF確認済み"; tone = "bg-green-100 text-green-800"; }
  else if (state === "user_visible") { label = "公式ページ確認済み"; tone = "bg-green-100 text-green-800"; }
  else if (state === "archived_or_old") { label = old?.includes("募集終了") ? "募集終了の可能性あり" : "古い可能性あり"; tone = "bg-slate-100 text-slate-600"; }
  else if (state === "admin_review") { label = secondary ? "民間サイトで発見（公式確認が必要）" : "公式確認待ち"; tone = "bg-amber-100 text-amber-800"; }
  else if (state === "reference_only") { label = "制度ページではない可能性"; tone = "bg-slate-100 text-slate-500"; }
  else { label = "ノイズ除外"; tone = "bg-gray-100 text-gray-400"; }

  return {
    state, pageType, score, noise, official, grantPage: req.name, req,
    extracted: { name: item.title ?? "", regions: ex.target_regions, expenses: ex.eligible_expenses, rate: ex.subsidy_rate, maxAmount: ex.max_amount, deadline: item.extracted_deadline ?? ex.deadline },
    userVisible, label, tone,
  };
}
