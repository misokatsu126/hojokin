// 検索結果の検証ゲート：「検索ヒット＝補助金候補」にしない。
//   ノイズ（採択結果・議会資料・入札・ニュース・まとめ記事・募集終了・古い年度）を除外し、
//   制度ページか・公式か・要件が読めるかを判定して、確度ラベルを付ける。
//   ※「見逃し防止」のため、情報不足・公式未確認は除外せず弱い表現で残す（ノイズだけ除外）。

import type { DiscoveredItem, BusinessProfile } from "./types";

export type VerifyState =
  | "user_visible_candidate" // ユーザーに表示してよい（公式・制度ページ・要件あり）
  | "needs_official_check" // 制度ページだが公式未確認（弱い表現で表示可）
  | "archived_or_old" // 古い年度・募集終了の可能性
  | "reference_only" // 参考情報（制度ページとは言い切れない／民間）
  | "rejected_noise"; // ノイズ（採択結果・議会・入札・ニュース等）

// ノイズ判定（ユーザー向け候補から外すべきページ）
const NOISE: { re: RegExp; reason: string }[] = [
  { re: /(採択結果|採択者|交付決定(一覧|者)|採択事業者|選定結果)/, reason: "過去の採択・交付決定一覧" },
  { re: /(議会|定例会|委員会資料|予算(案|資料|説明)|決算)/, reason: "議会・予算資料" },
  { re: /(入札|落札|見積(合せ|り合わせ)|調達|プロポーザル公告)/, reason: "入札・調達情報" },
  { re: /(セミナー|説明会|相談会)(の)?(案内|開催|参加者募集)/, reason: "セミナー・説明会の案内" },
  { re: /(プレスリリース|ニュースリリース|報道発表|記者発表)/, reason: "ニュース・プレスリリース" },
  { re: /(導入事例|活用事例|成功事例|お客様の声|施工事例)/, reason: "事例紹介" },
];

// 募集終了・古い年度の判定
function endedOrOld(text: string): string | null {
  if (/(募集(は)?終了|受付(を)?終了|受付終了しました|申請(は)?締め切り)/.test(text)) return "募集終了の可能性";
  // 令和3年度以前 / 2018〜2022年度などの古い年度表記（現行より十分前）
  const m = text.match(/(?:令和|R)\s*([0-9０-９]{1,2})\s*年度/);
  if (m) {
    const n = Number(m[1].replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d).toString()));
    if (n && n <= 4) return "古い年度（令和4年度以前）の可能性";
  }
  const y = text.match(/(20[0-9]{2})\s*年度/);
  if (y && Number(y[1]) <= 2022) return "古い年度の可能性";
  return null;
}

// 補助金制度ページらしいか
function looksLikeGrantPage(text: string): boolean {
  return /(補助金|助成金|給付金|支援金|補助制度|助成制度|公募|募集)/.test(text);
}

// 公式情報か（go.jp / lg.jp / 自治体ドメイン / Jグランツ / 中小機構 等、または確認済みフラグ）
function isOfficial(item: DiscoveredItem): boolean {
  if (item.official_source_confirmed) return true;
  const url = `${item.official_url ?? ""} ${item.url ?? ""}`;
  if (/\.(go|lg)\.jp|\.(city|pref|town|vill)\.|jgrants|smrj\.go\.jp|mirasapo/i.test(url)) return true;
  return item.external_source === "jgrants" || item.external_source === "official_city" || item.external_source === "official_prefecture";
}

// 民間まとめ・記事由来か
function isSecondary(item: DiscoveredItem): boolean {
  const t = item.trust_level ?? "E";
  if (isOfficial(item)) return false;
  return t === "C" || t === "D" || t === "E" || item.external_source === "feed" || item.external_source === "crawl";
}

export type VerifyResult = {
  state: VerifyState;
  score: number; // 信頼度スコア
  noise: string[]; // ノイズ判定理由
  grantPage: boolean;
  official: boolean;
  userVisible: boolean; // ユーザー画面に出してよいか
  label: string; // 確度ラベル（弱い表現）
  tone: string;
};

// 信頼度スコア（仕様の加点・減点）＋ 案件（profile）との地域・経費一致
export function verifyItem(item: DiscoveredItem, profile?: BusinessProfile | null): VerifyResult {
  const text = `${item.title ?? ""}\n${item.raw_text ?? ""}`;
  const noise = NOISE.filter((n) => n.re.test(text)).map((n) => n.reason);
  const grantPage = looksLikeGrantPage(text);
  const official = isOfficial(item);
  const secondary = isSecondary(item);
  const old = endedOrOld(text);

  let score = 0;
  if (official) score += 30;
  if (/(補助金|助成金|給付金|支援金)/.test(text)) score += 10; // 制度名
  if (/(対象者|対象事業者|対象となる)/.test(text)) score += 10;
  if (/(対象経費|補助対象経費|経費)/.test(text)) score += 10;
  if (/(補助率|補助上限|上限額|助成額)/.test(text)) score += 10;
  if (/(募集期間|受付期間|締切|申請期間)/.test(text) || item.extracted_deadline) score += 10;
  if (item.official_pdf_url || item.pdf_url || /公募要領/.test(text)) score += 10;
  if (secondary) score -= 20;
  if (/(プレスリリース|ニュース|報道発表)/.test(text)) score -= 30;
  if (noise.some((r) => r.includes("採択") || r.includes("交付決定"))) score -= 40;
  if (old?.includes("募集終了")) score -= 30;
  if (old?.includes("古い年度")) score -= 30;
  if (!grantPage) score -= 40;

  // 案件との一致（profile があれば）
  if (profile) {
    const regionHit = (profile.regions ?? []).some((r) => r && text.includes(r));
    if (regionHit) score += 10;
    else if ((profile.regions ?? []).length > 0 && /[都道府県市区町村]/.test(text)) {
      // 案件地域が出てこず、別地域が明示されていそうなら減点（強い不一致）
      // ここでは過度な誤除外を避け、軽め
      score -= 0;
    }
    const expenseHit = (profile.expenses ?? []).some((e) => e && text.includes(e));
    if (expenseHit) score += 10;
  }

  // 状態の決定（ノイズ最優先 → 古い/終了 → 制度ページ → 公式有無）
  let state: VerifyState;
  if (noise.length > 0 && score < 20) state = "rejected_noise";
  else if (old) state = "archived_or_old";
  else if (!grantPage) state = "reference_only";
  else if (official && score >= 40) state = "user_visible_candidate";
  else state = "needs_official_check";

  // ユーザー画面に出してよいか。
  //   完全に外す＝ノイズ（採択結果・議会・入札・ニュース等）と、制度ページと言えない参考情報のみ。
  //   古い/募集終了・公式未確認は「関連はする」ので、弱い表現を付けて残す（見逃し防止）。
  const userVisible = state !== "rejected_noise" && state !== "reference_only";

  // 確度ラベル（弱い表現）
  let label: string, tone: string;
  if (state === "user_visible_candidate") { label = "公式確認済み：この案件で使える可能性があります"; tone = "bg-green-100 text-green-800"; }
  else if (state === "needs_official_check") { label = secondary ? "民間サイトで発見：公式情報を確認するまで申請判断に使わないでください" : "公式確認待ち：関係する可能性があります。公式確認が必要です"; tone = "bg-amber-100 text-amber-800"; }
  else if (state === "archived_or_old") { label = old?.includes("募集終了") ? "募集終了：今回は使えませんが、次回狙いにできます" : "古い可能性：今年度の募集か確認が必要です"; tone = "bg-slate-100 text-slate-600"; }
  else if (state === "reference_only") { label = "参考情報：制度ページか確認が必要です"; tone = "bg-slate-100 text-slate-500"; }
  else { label = "ノイズの可能性：ユーザー候補から除外"; tone = "bg-gray-100 text-gray-400"; }

  return { state, score, noise, grantPage, official, userVisible, label, tone };
}

export const VERIFY_STATE_LABEL: Record<VerifyState, string> = {
  user_visible_candidate: "表示OK（公式・制度ページ）",
  needs_official_check: "公式確認待ち",
  archived_or_old: "古い・募集終了の可能性",
  reference_only: "参考情報",
  rejected_noise: "ノイズ除外",
};
