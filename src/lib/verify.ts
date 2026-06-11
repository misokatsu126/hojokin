// 検索結果の検証ゲート：「検索ヒット＝補助金候補」にしない。
//   ページ種別 → 公式/民間/ノイズ → 制度ページ → 要件抽出 → 年度・募集状況 → 表示可否 の順で判定。
//   タイトル/URLだけでなく本文（raw_text）から制度名・対象者・対象経費・補助率・上限・募集期間・
//   公募要領・問い合わせ先を探し、ほとんど取れなければユーザー表示せず管理者確認待ちにする。
//   ※ ノイズ（採択結果・議会・入札・ニュース・セミナー・営業ページ）は除外。
//      民間まとめ・士業記事は削除せず「発見用」として管理者確認待ちに残す。

import type { DiscoveredItem, BusinessProfile } from "./types";
import { ruleExtract } from "./discovery";
import { CITY_TO_PREF, PURPOSES } from "./constants";

// 目的カテゴリの近接（「店舗改装の対象経費に空調が含まれるか」等の "possible" 判定用）
const PURPOSE_ADJ: Record<string, string[]> = {
  空調設備: ["設備導入", "省エネ", "店舗改装", "省力化"],
  省エネ: ["空調設備", "設備導入", "店舗改装"],
  設備導入: ["空調設備", "省エネ", "省力化", "店舗改装", "内装工事"],
  店舗改装: ["内装工事", "設備導入", "空調設備", "新店舗出店", "省エネ"],
  内装工事: ["店舗改装", "設備導入", "新店舗出店"],
  EC強化: ["ホームページ制作", "販路開拓", "DX", "広告宣伝"],
  ホームページ制作: ["EC強化", "販路開拓", "広告宣伝"],
  販路開拓: ["広告宣伝", "EC強化", "ホームページ制作", "イベント開催"],
  広告宣伝: ["販路開拓", "ホームページ制作", "イベント開催"],
  AI導入: ["DX", "業務自動化", "省力化"],
  DX: ["AI導入", "業務自動化", "省力化", "EC強化"],
  業務自動化: ["省力化", "DX", "AI導入"],
  省力化: ["業務自動化", "設備導入", "DX"],
  スタッフ採用: ["社員教育"],
  社員教育: ["スタッフ採用"],
};

// 市区町村 → 都道府県（地域階層の判定用。constants を拡張）
const CITY_PREF: Record<string, string> = {
  ...CITY_TO_PREF,
  名古屋市: "愛知県", 豊橋市: "愛知県", 岡崎市: "愛知県", 一宮市: "愛知県", 春日井市: "愛知県",
  豊田市: "愛知県", 弥富市: "愛知県", 岐阜市: "岐阜県", 大垣市: "岐阜県", 各務原市: "岐阜県",
  多治見市: "岐阜県", 高山市: "岐阜県", 四日市市: "三重県", 津市: "三重県", 桑名市: "三重県",
  大阪市: "大阪府", 京都市: "京都府", 神戸市: "兵庫県", 横浜市: "神奈川県", 川崎市: "神奈川県",
  名張市: "三重県", 福岡市: "福岡県", 札幌市: "北海道", 仙台市: "宮城県", 広島市: "広島県",
};
const MUNI_RE = /[一-龥々ヶ]{1,6}(?:市|区|町|村)/; // ※ /g は付けない（.test の lastIndex 副作用回避）

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
  state: VerifyState; // = visibility
  pageType: PageType;
  score: number; // 総合スコア（参考）
  displayConfidence: number; // ユーザーに強く表示してよいか
  missedOpportunityRisk: number; // 捨てると見逃しになりそうか
  regionResult: string; // 地域判定結果（管理者向け）
  expenseResult: string; // 経費近似判定結果（管理者向け）
  userVisibleReason: string;
  adminReviewReason: string;
  rejectReason: string;
  regionMatch: boolean; // UI簡易表示用（判定は regionMatchType を使う）
  regionMatchType: "national" | "prefecture_contains_city" | "city_exact" | "region_unknown" | "region_mismatch";
  regionMatchReason: string;
  expenseMatch: boolean; // UI簡易表示用（判定は expenseMatchType を使う）
  expenseMatchType: "exact" | "near" | "possible" | "unknown" | "mismatch";
  expenseMatchReason: string;
  noise: string[]; // = noiseReasons
  official: boolean;
  grantPage: boolean;
  req: Requirements; // = extractedRequirements（取れた項目）
  missingFields: string[]; // 取れなかった項目（未確認）
  extracted: { name: string; regions: string[]; expenses: string[]; rate: string | null; maxAmount: number | null; deadline: string | null };
  projectRelationReason: string; // なぜこの案件に関係するか
  matchedConditions: string[]; // 一致している条件（地域・テーマ）
  recommendedAction: string; // 次に何をすべきか
  userVisible: boolean;
  label: string; // = trustLabel
  tone: string;
};

const REQ_LABEL: Record<keyof Omit<Requirements, "count">, string> = {
  name: "制度名", target: "対象者", expense: "対象経費", rate: "補助率", cap: "補助上限額",
  period: "募集期間", method: "申請方法", guideline: "公募要領", contact: "問い合わせ先",
};

const PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];

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
  score += req.count * 8;
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

  // 案件との一致・不一致（地域は階層、経費は近似カテゴリで判定）
  const pRegions = profile?.regions ?? [];
  // 案件の都道府県・市区町村
  const projectPrefs = new Set<string>();
  const projectCities: string[] = [];
  for (const r of pRegions) {
    if (PREFS.includes(r)) projectPrefs.add(r);
    else if (CITY_PREF[r]) { projectPrefs.add(CITY_PREF[r]); projectCities.push(r); }
    else if (/(市|区|町|村)$/.test(r)) projectCities.push(r);
  }
  const nationwide = /(全国|日本全国|国の(制度|補助|助成|事業))/.test(text);
  const itemPrefs = new Set<string>(PREFS.filter((p) => text.includes(p)));
  for (const [city, pref] of Object.entries(CITY_PREF)) if (text.includes(city)) itemPrefs.add(pref);
  const itemHasGeo = itemPrefs.size > 0 || MUNI_RE.test(text);
  const projectCityMentioned = projectCities.some((c) => text.includes(c));
  const prefOverlap = [...itemPrefs].some((p) => projectPrefs.has(p));

  // 地域一致（階層）：全国 / 案件の市が記載 / 都道府県が一致 / 地域情報なし は一致扱い
  let regionMatch: boolean;
  if (pRegions.length === 0) regionMatch = true;
  else if (nationwide) regionMatch = true;
  else if (projectCityMentioned) regionMatch = true;
  else if (prefOverlap) regionMatch = true;
  else if (!itemHasGeo) regionMatch = true; // 地域の明記なし＝全国の可能性。落とさない
  else regionMatch = false;
  // 明確な地域違い（別の都道府県・市が明記され、案件地域と重ならない）
  const regionConflict = pRegions.length > 0 && !regionMatch && itemHasGeo;

  // 地域の段階判定（true/false だけでなく type＋理由）
  let regionMatchType: "national" | "prefecture_contains_city" | "city_exact" | "region_unknown" | "region_mismatch";
  let regionMatchReason: string;
  const projCityLabel = projectCities[0] || [...projectPrefs][0] || "案件地域";
  if (pRegions.length === 0) { regionMatchType = "national"; regionMatchReason = "案件の地域が未設定のため、地域では絞り込んでいません"; }
  else if (nationwide) { regionMatchType = "national"; regionMatchReason = `全国対象の制度のため、${projCityLabel}案件でも地域ミスマッチではありません`; }
  else if (projectCityMentioned) { regionMatchType = "city_exact"; regionMatchReason = "案件所在地と制度の対象市区町村が一致しています"; }
  else if (prefOverlap) { regionMatchType = "prefecture_contains_city"; regionMatchReason = `${projCityLabel}は${[...itemPrefs].find((p) => projectPrefs.has(p))}内のため、地域条件に合う可能性があります`; }
  else if (!itemHasGeo) { regionMatchType = "region_unknown"; regionMatchReason = "対象地域を抽出できないため、管理者確認が必要です"; }
  else { regionMatchType = "region_mismatch"; regionMatchReason = `案件所在地は${projCityLabel}ですが、制度対象は${[...itemPrefs][0] ?? "別地域"}です`; }

  // 経費・テーマの近似一致（synonyms 展開済みの purposes/expenses/keywords/industries で判定）
  const themePool = [
    ...(profile?.purposes ?? []), ...(profile?.expenses ?? []), ...(profile?.keywords ?? []), ...(profile?.industries ?? []),
  ];
  const themeHits = themePool.filter((t) => t && text.includes(t));
  const projPurposes = profile?.purposes ?? [];
  const itemPurposes = PURPOSES.filter((p) => text.includes(p));
  // カテゴリ一致は purposes/expenses/industries で見る（keywords の "店舗" 等の汎用語は除外）
  const categoryPool = [...projPurposes, ...(profile?.expenses ?? []), ...(profile?.industries ?? [])];
  const categoryHits = categoryPool.filter((t) => t && text.includes(t));
  // exact は「空調・POS」等の固有語のみ（省エネ等のカテゴリ語は near 扱い）
  const GENERIC_KW = new Set(["小売", "物販", "事業", "サービス", "店舗", "お店"]);
  const primaryHit = (profile?.keywords ?? []).some((k) => k && !GENERIC_KW.has(k) && !categoryPool.includes(k) && k.length >= 2 && text.includes(k));
  const adjHit = itemPurposes.some((ip) => projPurposes.some((pp) => (PURPOSE_ADJ[pp] ?? []).includes(ip) || (PURPOSE_ADJ[ip] ?? []).includes(pp)));

  // 経費の段階判定
  let expenseMatchType: "exact" | "near" | "possible" | "unknown" | "mismatch";
  let expenseMatchReason: string;
  if (!profile || (projPurposes.length === 0 && (profile.expenses?.length ?? 0) === 0)) { expenseMatchType = "unknown"; expenseMatchReason = "案件の使い道が未設定のため判定できません"; }
  else if (primaryHit) { expenseMatchType = "exact"; expenseMatchReason = "案件の用途と制度の対象が直接一致しています"; }
  else if (categoryHits.length > 0) { expenseMatchType = "near"; expenseMatchReason = `${categoryHits.slice(0, 3).join("・")}に含まれる可能性があります`; }
  else if (adjHit) { expenseMatchType = "possible"; expenseMatchReason = "関連する経費カテゴリに含まれるか確認が必要です"; }
  else if (!req.expense) { expenseMatchType = "unknown"; expenseMatchReason = "対象経費を抽出できないため、管理者確認が必要です"; }
  else { expenseMatchType = "mismatch"; expenseMatchReason = "案件の使い道と対象経費が合わない可能性があります"; }

  const regionMatchBool = regionMatchType === "national" || regionMatchType === "prefecture_contains_city" || regionMatchType === "city_exact";
  const expenseMatch = expenseMatchType === "exact" || expenseMatchType === "near" || expenseMatchType === "possible";

  if (profile) {
    if (regionMatch && (prefOverlap || projectCityMentioned)) score += 10;
    if (expenseMatch) score += 10;
    if (regionConflict) score -= 50;
  }

  // ---- 2軸：displayConfidence（強く表示してよいか）/ missedOpportunityRisk（見逃すと危ないか） ----
  const grantTypePage = pageType === "official_grant_page" || pageType === "official_pdf";
  let displayConfidence = 0;
  if (official) displayConfidence += 20;
  if (req.name) displayConfidence += 12;
  if (req.target) displayConfidence += 8;
  if (req.expense) displayConfidence += 8;
  if (req.rate || req.cap) displayConfidence += 8;
  if (req.period) displayConfidence += 8;
  if (!old) displayConfidence += 6; // 募集中/予定
  if (profile && regionMatch && (prefOverlap || projectCityMentioned || nationwide)) displayConfidence += 12;
  if (profile && expenseMatch) displayConfidence += 12;
  if (profile && regionMatch && themeHits.length > 0) displayConfidence += 6; // 関係を説明できる
  if (regionConflict) displayConfidence -= 40;

  const STANDARD_PROGRAM = /(IT導入補助金|小規模事業者持続化|持続化補助金|ものづくり補助金|省力化投資|業務改善助成金|キャリアアップ助成金|事業承継.{0,6}補助金|事業再構築|人材開発支援)/;
  const recurring = themeHits.length > 0 || STANDARD_PROGRAM.test(text);
  let missedOpportunityRisk = 0;
  if (nationwide) missedOpportunityRisk += 25;
  if (prefOverlap) missedOpportunityRisk += 20;
  if (STANDARD_PROGRAM.test(text)) missedOpportunityRisk += 20; // 定番制度（具体的な制度名）
  if (pageType === "official_index") missedOpportunityRisk += 25; // 公式の一覧
  if (expenseMatch) missedOpportunityRisk += 20; // 経費近似
  if (pageType === "private_summary" && req.name) missedOpportunityRisk += 20; // 民間だが制度名あり
  if (old && recurring) missedOpportunityRisk += 20; // 古いが毎年出そう
  if (grantTypePage && req.count < 3) missedOpportunityRisk += 15; // 公式だが要件薄い
  if (regionConflict) missedOpportunityRisk -= 25;

  const dispHigh = displayConfidence >= 55;
  const riskHigh = missedOpportunityRisk >= 35;
  // 「明確に違う」とは言い切れない救済材料（定番・公式一覧・民間+制度名・古いが毎年）。
  // これらがあれば region_mismatch / expense mismatch でも捨てず admin_review に残す。
  const salvage = STANDARD_PROGRAM.test(text) || pageType === "official_index" || (pageType === "private_summary" && req.name) || (!!old && recurring);

  // ---- 状態の決定（段階判定＋2軸マトリクス） ----
  const NOISE_TYPES: PageType[] = ["past_result", "council_or_budget", "bid_or_procurement", "seminar", "news_article", "company_sales_page"];
  let state: VerifyState;
  let mismatchNote = "";
  if (NOISE_TYPES.includes(pageType)) state = "rejected_noise";
  else if (regionMatchType === "region_mismatch") { state = (riskHigh || salvage) ? "admin_review" : "rejected_noise"; mismatchNote = "対象地域が案件と違う"; }
  else if (expenseMatchType === "mismatch") { state = (riskHigh || salvage) ? "admin_review" : "rejected_noise"; mismatchNote = "対象経費が案件と合わない"; }
  else if (old) state = "archived_or_old"; // 古い/募集終了（次回狙い）
  else if (regionMatchType === "region_unknown") { state = "admin_review"; mismatchNote = "対象地域が不明（要確認）"; } // 捨てない
  else if (expenseMatchType === "unknown") { state = "admin_review"; mismatchNote = "対象経費が不明（要確認）"; } // 捨てない
  else if (expenseMatchType === "possible") { state = "admin_review"; mismatchNote = "対象経費に含まれるか要確認"; } // 条件確認
  // user_visible は厳しく：公式制度ページ・表示確度高・地域一致・経費 exact/near・要件あり
  else if (dispHigh && grantTypePage && req.count >= 3 && regionMatchBool && (expenseMatchType === "exact" || expenseMatchType === "near")) state = "user_visible";
  else if (riskHigh) state = "admin_review"; // 低×高：捨てず管理者確認（民間/一覧/定番/要件薄い公式）
  else if (req.name || grantTypePage) state = "reference_only"; // 制度ページらしいが確度低い
  else state = "rejected_noise"; // 低×低：除外
  if (mismatchNote) noise.push(mismatchNote);

  const userVisible = state === "user_visible";

  // 未確認項目（取れなかった要件）
  const missingFields = (Object.keys(REQ_LABEL) as (keyof typeof REQ_LABEL)[])
    .filter((k) => !req[k]).map((k) => REQ_LABEL[k]);

  // 一致している条件（地域＋テーマ）
  const matchedConditions: string[] = [];
  if (profile) {
    if (nationwide) matchedConditions.push("全国対象");
    else if (projectCityMentioned) matchedConditions.push(projectCities.find((c) => text.includes(c)) ?? "対象地域");
    else if (prefOverlap) matchedConditions.push([...itemPrefs].find((p) => projectPrefs.has(p)) ?? "対象地域");
    matchedConditions.push(...themeHits.slice(0, 4));
  }

  // なぜこの案件に関係するか
  let projectRelationReason: string;
  if (profile) {
    const regionPart = regionMatch ? `${pRegions.find((r) => text.includes(r)) ?? (/全国/.test(text) ? "全国対象" : "")}の事業で、` : "";
    const themePart = themeHits.length ? `${themeHits.slice(0, 3).join("・")}に該当する可能性があります` : (item.match_reason || "関係する可能性があります");
    projectRelationReason = `${regionPart}${themePart}。`;
  } else {
    projectRelationReason = item.match_reason || "事業情報と関係する可能性があります。";
  }

  // 確度ラベル
  let label: string, tone: string;
  if (pageType === "official_pdf" && state === "user_visible") { label = "公式PDF確認済み"; tone = "bg-green-100 text-green-800"; }
  else if (state === "user_visible") { label = "公式ページ確認済み"; tone = "bg-green-100 text-green-800"; }
  else if (state === "archived_or_old") { label = old?.includes("募集終了") ? "募集終了の可能性あり" : "古い可能性あり"; tone = "bg-slate-100 text-slate-600"; }
  else if (state === "admin_review") { label = mismatchNote ? mismatchNote + "（要確認）" : (secondary ? "民間サイトで発見（公式確認が必要）" : "公式確認待ち"); tone = "bg-amber-100 text-amber-800"; }
  else if (state === "reference_only") { label = "制度ページではない可能性"; tone = "bg-slate-100 text-slate-500"; }
  else { label = "ノイズ除外"; tone = "bg-gray-100 text-gray-400"; }

  // 次にやること
  let recommendedAction: string;
  if (state === "user_visible") recommendedAction = "発注前確認 → 公募要領確認 → 見積取得";
  else if (state === "archived_or_old") recommendedAction = "次回募集があるか確認する（次回狙い）";
  else if (state === "admin_review") recommendedAction = secondary ? "公式情報を探して確認（申請判断には使わない）" : "公式情報・要件を確認してから判断";
  else if (state === "reference_only") recommendedAction = "制度ページか確認する（参考情報）";
  else recommendedAction = "ユーザーには表示しない";

  // 地域判定結果（管理者向け）
  let regionResult: string;
  if (!profile || pRegions.length === 0) regionResult = "案件地域未設定";
  else if (nationwide) regionResult = "全国（一致扱い）";
  else if (projectCityMentioned) regionResult = `市区町村一致（${projectCities.find((c) => text.includes(c))}）`;
  else if (prefOverlap) regionResult = `都道府県一致（${[...itemPrefs].find((p) => projectPrefs.has(p))}）`;
  else if (regionConflict) regionResult = `地域不一致（${[...itemPrefs][0] ?? "別地域"}）`;
  else if (!itemHasGeo) regionResult = "地域不明（全国の可能性）";
  else regionResult = "地域不明";
  // 経費近似判定結果
  const expenseResult = `${expenseMatchType}：${expenseMatchReason}`;

  // 表示/管理/除外の理由
  const userVisibleReason = userVisible ? `公式の制度ページで、案件との関係（${matchedConditions.slice(0, 3).join("・") || "対象テーマ"}）が説明できます` : "";
  const adminReviewReason = state === "admin_review"
    ? (mismatchNote || (secondary ? "民間サイト由来。公式確認が必要" : pageType === "official_index" ? "補助金一覧ページ。個別制度の確認が必要" : "要件が一部しか取れず公式確認が必要"))
    : "";
  const rejectReason = state === "rejected_noise" ? (noise.join(" / ") || "制度ページと言えない／案件との関係が説明できない") : "";

  return {
    state, pageType, score, displayConfidence, missedOpportunityRisk, noise, official, grantPage: req.name, req, missingFields,
    extracted: { name: item.title ?? "", regions: ex.target_regions, expenses: ex.eligible_expenses, rate: ex.subsidy_rate, maxAmount: ex.max_amount, deadline: item.extracted_deadline ?? ex.deadline },
    projectRelationReason, matchedConditions, recommendedAction, regionResult, expenseResult,
    userVisibleReason, adminReviewReason, rejectReason,
    regionMatch: regionMatchBool, regionMatchType, regionMatchReason,
    expenseMatch, expenseMatchType, expenseMatchReason,
    userVisible, label, tone,
  };
}
