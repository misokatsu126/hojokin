// 相談文（自然文）→ 内部カテゴリ（目的・経費・業種・キーワード）への展開辞書。
//   補助金初心者は制度名を知らないため、「ECサイトを作りたい」「空調を入れ替えたい」のような
//   “やりたいこと・困りごと・使いたい経費” から、使える可能性がある制度を探せるようにする。
//   ここで展開したカテゴリは、PURPOSES / EXPENSE_CATEGORIES / INDUSTRIES（constants.ts）に揃える。

import { REGIONS } from "./constants";

// 地域の言い換え・略称（「岐阜」だけでも 岐阜県・岐阜市 を対象にする等）。
//   キーが相談文に含まれていれば、対応する正式な地域名（grants.regions と突き合わせる値）に展開する。
const REGION_ALIASES: Record<string, string[]> = {
  岐阜: ["岐阜県", "岐阜市"],
  名古屋: ["名古屋市", "愛知県"],
  愛知: ["愛知県", "名古屋市"],
  三重: ["三重県", "四日市市"],
  弥富: ["弥富市", "愛知県"],
  四日市: ["四日市市", "三重県"],
  東京: ["東京都"],
  大阪: ["大阪府"],
  京都: ["京都府"],
  福岡: ["福岡県"],
  北海道: ["北海道"],
};

// 異体字（旧字・俗字）のゆれを吸収する。地名・人名でよく揺れる字を正規化。
//   例：弥冨→弥富、髙→高、﨑/崎、濱→浜、澤→沢、邉/邊→辺 …
const VARIANT_MAP: Record<string, string> = {
  "冨": "富", "髙": "高", "﨑": "崎", "嵜": "崎", "濱": "浜", "濵": "浜",
  "澤": "沢", "邉": "辺", "邊": "辺", "廣": "広", "龍": "竜", "嶋": "島",
  "槇": "槙", "桒": "桑", "齋": "斎", "齊": "斎", "靏": "鶴", "舘": "館",
  "渕": "淵", "塚": "塚", "栁": "柳", "祐": "祐",
};
export function normalizeVariants(s: string): string {
  let out = (s ?? "").normalize("NFKC");
  for (const [from, to] of Object.entries(VARIANT_MAP)) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

// 「○○市/区/町/村/郡」を文中から汎用的に抽出（全国どの市区町村でも効く）。
const MUNICIPALITY_RE = /[一-龥々ヶ]{1,6}(?:市|区|町|村|郡)/g;

// 相談文から対象地域を抽出する（正式名 REGIONS ＋ 略称エイリアス ＋ 汎用市区町村。異体字も吸収）。
export function expandRegions(text: string): string[] {
  const norm = normalizeVariants(text);
  const out = new Set<string>();
  for (const r of REGIONS) {
    if (r !== "全国" && norm.includes(r)) out.add(r);
  }
  for (const [alias, list] of Object.entries(REGION_ALIASES)) {
    if (norm.includes(alias)) list.forEach((x) => out.add(x));
  }
  // 文中の「○○市/区/町/村/郡」をそのまま地域語として追加（弥富市・各務原市など）
  for (const m of norm.match(MUNICIPALITY_RE) ?? []) {
    if (m.length >= 3) out.add(m); // 「○市」単独などの短すぎる誤検出を避ける
  }
  return [...out];
}

export type SynonymRule = {
  triggers: string[];
  purposes?: string[]; // PURPOSES に存在する値
  expenses?: string[]; // EXPENSE_CATEGORIES に存在する値
  industries?: string[]; // INDUSTRIES に存在する値
  keywords?: string[]; // 自由キーワード（grants 本文照合に使う）
  professional?: boolean; // 専門家（社労士等）確認推奨の領域か
  // 「なぜ候補に出たか」を初心者向けに説明する短文（カテゴリ名で構成）
  reasonLabel: string;
};

// 言い換え・類義語の辞書（brief §6）。上から順に評価し、発火したものを合算する。
export const SYNONYM_RULES: SynonymRule[] = [
  // ── 小売・店舗・トレカ屋など「お店」系 ──
  {
    triggers: [
      "トレカ", "トレーディングカード", "カードショップ", "カード屋", "ホビーショップ", "ホビー",
      "フィギュア", "ガチャ", "雑貨", "小売", "物販",
    ],
    purposes: ["販路開拓", "EC強化", "店舗改装", "設備導入"],
    expenses: ["設備費", "内装工事費", "システム導入費", "広告宣伝費", "委託費"],
    industries: ["小売", "EC", "トレーディングカード"],
    keywords: ["小売", "店舗", "トレーディングカード", "物販"],
    reasonLabel: "小売・店舗・販路開拓",
  },
  // ── EC・ネット販売系 ──
  {
    triggers: [
      "ecサイト", "ＥＣサイト", "ネットショップ", "通販サイト", "通販", "オンライン販売",
      "web販売", "ｗｅｂ販売", "ウェブ販売", "ネット販売", "ネット通販",
      "shopify", "base", "stores", "ecカート", "ＥＣカート", "ec強化", "ec構築", "ec導入",
    ],
    purposes: ["EC強化", "ホームページ制作", "販路開拓", "DX"],
    expenses: ["システム導入費", "ソフトウェア費", "委託費", "外注費", "広告宣伝費", "専門家経費"],
    industries: ["EC", "小売"],
    keywords: ["EC", "ネットショップ", "通販", "オンライン"],
    reasonLabel: "EC強化・ホームページ制作・販路開拓・DX",
  },
  // ── ホームページ・LP（EC以外の制作） ──
  {
    triggers: ["ホームページ", "ｈｐ", "ＨＰ", "lp", "ＬＰ", "ランディングページ", "webサイト", "ｗｅｂサイト", "ウェブサイト", "サイトを作", "サイトをつく"],
    purposes: ["ホームページ制作", "販路開拓", "広告宣伝"],
    expenses: ["委託費", "外注費", "広告宣伝費", "専門家経費"],
    keywords: ["ホームページ", "Web", "サイト制作"],
    reasonLabel: "ホームページ制作・販路開拓・広告宣伝",
  },
  // ── 新規事業・新店舗・事業転換系 ──
  {
    triggers: [
      "新規事業", "新しいサービス", "新サービス", "新店舗", "新しい店", "出店", "別事業",
      "立ち上げ", "新商品", "事業転換", "業態転換", "第二創業", "新しい売上", "新事業", "起業", "開業", "創業",
    ],
    purposes: ["創業", "新店舗出店", "商品開発", "販路開拓", "設備導入"],
    expenses: ["設備費", "内装工事費", "開発費", "委託費", "外注費", "広告宣伝費", "専門家経費", "機械装置費"],
    keywords: ["創業", "新規事業", "出店", "事業再構築", "事業承継"],
    reasonLabel: "創業・新店舗出店・商品開発・販路開拓",
  },
  // ── 店舗改装・内装系 ──
  {
    triggers: ["店を改装", "店舗改装", "改装", "内装を直", "内装工事", "リフォーム", "店舗を直", "店舗改修", "改修"],
    purposes: ["店舗改装", "内装工事", "設備導入"],
    expenses: ["内装工事費", "設備費", "機械装置費"],
    keywords: ["店舗改装", "内装", "改修"],
    reasonLabel: "店舗改装・内装工事・設備導入",
  },
  // ── 空調・省エネ設備系 ──
  {
    triggers: ["空調", "エアコン", "業務用エアコン", "省エネ設備", "省エネ", "節電", "高効率", "led", "ＬＥＤ", "断熱"],
    purposes: ["空調設備", "省エネ", "設備導入", "省力化"],
    expenses: ["設備費", "機械装置費"],
    keywords: ["空調", "省エネ", "エアコン"],
    reasonLabel: "空調設備・省エネ・設備導入",
  },
  // ── 防犯・POS・レジ・在庫など店舗設備系 ──
  {
    triggers: ["防犯カメラ", "防犯", "監視カメラ", "pos", "ＰＯＳ", "レジ", "在庫管理", "店舗設備", "券売機", "キャッシュレス"],
    purposes: ["防犯カメラ", "POS導入", "在庫管理", "設備導入", "省力化", "業務自動化"],
    expenses: ["設備費", "機械装置費", "システム導入費"],
    keywords: ["防犯カメラ", "POS", "レジ", "在庫管理"],
    reasonLabel: "POS・防犯カメラ・在庫管理・設備導入",
  },
  // ── 広告・集客・展示会系 ──
  {
    triggers: [
      "広告", "宣伝", "チラシ", "看板", "集客", "sns広告", "ＳＮＳ広告", "sns", "ＳＮＳ",
      "youtube", "ユーチューブ", "動画広告", "リスティング", "web広告", "ｗｅｂ広告", "展示会", "出展", "イベント出展",
    ],
    purposes: ["広告宣伝", "販路開拓", "イベント開催"],
    expenses: ["広告宣伝費", "委託費", "外注費", "専門家経費"],
    keywords: ["広告", "宣伝", "展示会", "集客"],
    reasonLabel: "広告宣伝・販路開拓・展示会出展",
  },
  // ── イベント開催系 ──
  {
    triggers: ["イベントを開催", "イベント開催", "催し", "フェア", "セミナー開催", "ワークショップ"],
    purposes: ["イベント開催", "地域活動", "販路開拓"],
    expenses: ["委託費", "外注費", "広告宣伝費"],
    keywords: ["イベント", "開催"],
    reasonLabel: "イベント開催・地域活動・販路開拓",
  },
  // ── AI・DX・システム・業務自動化系 ──
  {
    triggers: [
      "ai", "ＡＩ", "人工知能", "dx", "ＤＸ", "デジタル化", "システムを入れ", "システム導入",
      "業務システム", "業務効率化", "自動化", "rpa", "ＲＰＡ", "クラウド", "予約システム", "it導入", "ＩＴ導入",
    ],
    purposes: ["AI導入", "DX", "業務自動化", "省力化", "予約システム"],
    expenses: ["システム導入費", "ソフトウェア費", "委託費", "外注費"],
    industries: ["IT", "DX", "AI"],
    keywords: ["AI", "DX", "デジタル", "IT導入", "自動化"],
    reasonLabel: "AI導入・DX・業務自動化・省力化",
  },
  // ── 人材・採用・研修・賃上げ系（助成金・専門家確認領域） ──
  {
    triggers: [
      "採用", "人を雇", "人材", "求人", "社員研修", "研修", "スタッフ教育", "教育訓練", "人材育成",
      "賃上げ", "正社員化", "正社員", "キャリアアップ", "アルバイト", "雇用", "従業員", "人手不足",
    ],
    purposes: ["スタッフ採用", "社員教育"],
    expenses: ["人件費", "研修費", "専門家経費"],
    keywords: ["雇用", "採用", "研修", "人材育成", "賃上げ", "正社員化", "キャリアアップ", "助成金"],
    professional: true,
    reasonLabel: "採用・人材育成・研修・賃上げ（厚労省系の助成金が中心）",
  },
  // ── 商品開発・研究開発系 ──
  {
    triggers: ["商品開発", "新商品開発", "試作", "研究開発", "製品開発", "開発したい"],
    purposes: ["商品開発", "研究開発"],
    expenses: ["開発費", "委託費", "外注費", "機械装置費"],
    keywords: ["商品開発", "試作", "研究開発"],
    reasonLabel: "商品開発・研究開発",
  },
  // ── 設備投資・機械導入・省力化系 ──
  {
    triggers: ["設備投資", "機械を入れ", "機械装置", "設備を入れ", "設備更新", "機械導入", "生産性向上", "省力化", "ロボット"],
    purposes: ["設備導入", "省力化", "業務自動化"],
    expenses: ["設備費", "機械装置費"],
    keywords: ["設備投資", "機械装置", "省力化", "生産性向上"],
    reasonLabel: "設備導入・省力化・生産性向上",
  },
  // ── 事業承継・M&A系 ──
  {
    triggers: ["事業承継", "後継", "引き継", "m&a", "ｍ＆ａ", "事業譲渡", "廃業"],
    purposes: ["事業承継", "M&A"],
    expenses: ["専門家経費", "委託費"],
    keywords: ["事業承継", "M&A"],
    professional: true,
    reasonLabel: "事業承継・M&A",
  },
  // ── 輸出・販路開拓（海外）系 ──
  {
    triggers: ["輸出", "海外展開", "越境ec", "越境ＥＣ", "海外販路", "インバウンド"],
    purposes: ["輸出", "販路開拓", "EC強化"],
    expenses: ["委託費", "外注費", "広告宣伝費", "専門家経費"],
    keywords: ["輸出", "海外", "越境EC", "インバウンド"],
    reasonLabel: "輸出・販路開拓",
  },
];

export type ExpandResult = {
  purposes: string[];
  expenses: string[];
  industries: string[];
  keywords: string[];
  professional: boolean;
  reasons: string[]; // 発火したルールの reasonLabel（「なぜ出たか」の説明に使う）
};

// 相談文を内部カテゴリへ展開する。大文字小文字・全角半角を吸収して判定。
export function expandQuery(text: string): ExpandResult {
  const norm = (text ?? "").normalize("NFKC").toLowerCase();
  const purposes = new Set<string>();
  const expenses = new Set<string>();
  const industries = new Set<string>();
  const keywords = new Set<string>();
  const reasons: string[] = [];
  let professional = false;

  for (const rule of SYNONYM_RULES) {
    const hit = rule.triggers.some((t) => norm.includes(t.normalize("NFKC").toLowerCase()));
    if (!hit) continue;
    rule.purposes?.forEach((p) => purposes.add(p));
    rule.expenses?.forEach((e) => expenses.add(e));
    rule.industries?.forEach((i) => industries.add(i));
    rule.keywords?.forEach((k) => keywords.add(k));
    if (rule.professional) professional = true;
    reasons.push(rule.reasonLabel);
  }

  return {
    purposes: [...purposes],
    expenses: [...expenses],
    industries: [...industries],
    keywords: [...keywords],
    professional,
    reasons,
  };
}

// 相談文だけでは条件が足りないときに返す確認質問（brief §9）。
// 既に文中で言及されていそうな項目は除外して、足りない観点だけ尋ねる。
export function followUpQuestions(text: string, cond: {
  regions: string[];
  business_types: string[];
  min_grant_amount: number | null;
  purposes: string[];
  eligible_expenses: string[];
}): string[] {
  const norm = (text ?? "").normalize("NFKC");
  const qs: string[] = [];
  if (cond.regions.length === 0) qs.push("事業を行う地域はどこですか？（都道府県・市区町村）");
  if (cond.business_types.length === 0 && !/個人|法人|株式会社|事業主/.test(norm))
    qs.push("法人ですか、個人事業主ですか？");
  if (cond.min_grant_amount == null && !/万円|億|金額|円/.test(norm))
    qs.push("いくらくらいの投資・経費を予定していますか？");
  if (!/既存|今の事業|新規|これから|新しく/.test(norm))
    qs.push("既存事業ですか、これからの新規事業ですか？");
  if (cond.eligible_expenses.length === 0 && cond.purposes.length === 0)
    qs.push("どんな経費に使いたいですか？（設備・広告・システム・人件費など）");
  return qs.slice(0, 4);
}
