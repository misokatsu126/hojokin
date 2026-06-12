// 定番補助金・助成金の「制度マスター」。検索・収集に依存せず、案件タイプから必ず確認候補に出す。
//   3層：① 国の定番（national_subsidy）② 厚労省系助成金（labor_grant）③ 自治体で探す定番パターン（local_pattern）
//   ※「使える」と断定しない。あくまで「確認推奨」。年度・名称変更に備えメタ情報も持つ。

import type { SpendingProject } from "./projects";

export type CoreConfidence = "確認推奨" | "条件確認" | "次回狙い";
export type CoreGroup = "national_subsidy" | "labor_grant" | "local_pattern";

export type CoreProgram = {
  key: string;
  name: string;
  aliasNames: string[];
  group: CoreGroup;
  priority: "high" | "medium" | "low";
  confidenceLabel: CoreConfidence;
  relatedReason: string; // 向いている支出
  whatToCheck: string[];
  caution: string[];
  requiredInfo: string[];
  officialUrl?: string; // 直リンク（公式ポータル等の安定URL）
  officialSearchQuery?: string; // 自治体系は {region} を案件地域で置換
  sourceAuthority: "master" | "official_seed" | "local_pattern";
  // 年度・名称変更対応
  fiscalYear: string;
  officialStatus: "active" | "scheduled" | "ended" | "unknown";
  needsAnnualRefresh: boolean;
  lastOfficialCheckedAt: string;
  // 案件マッチ条件
  templates: string[]; // 該当する templateKey
  keywords: RegExp; // 案件テキストにヒットすれば対象
};

export type CoreProgramCheck = {
  key: string;
  name: string;
  group: CoreGroup;
  priority: "high" | "medium" | "low";
  confidenceLabel: CoreConfidence;
  relatedReason: string;
  projectFitReason: string;
  whatToCheck: string[];
  caution: string[];
  requiredInfo: string[];
  relatedTemplateKeys: string[];
  relatedUses: string[];
  relatedExpenses: string[];
  officialUrl?: string;
  officialSearchQuery?: string;
  sourceAuthority: "master" | "official_seed" | "local_pattern";
  aliasNames: string[];
  fiscalYear: string;
  officialStatus: CoreProgram["officialStatus"];
};

const JGRANTS = "https://www.jgrants-portal.go.jp/";
const CHECKED = "2026-06"; // マスター最終確認（目安）

export const CORE_PROGRAM_MASTER: CoreProgram[] = [
  // ── 国・中小企業庁/経産省系 ──
  {
    key: "jizokuka", name: "小規模事業者持続化補助金", aliasNames: ["持続化補助金"], group: "national_subsidy", priority: "high", confidenceLabel: "確認推奨",
    relatedReason: "広告・チラシ・LP・HP・EC・看板・販路開拓・展示会・店舗導線改善",
    whatToCheck: ["従業員数の要件に合うか", "商工会／商工会議所の管轄", "対象経費（広告・販路開拓）", "発注前か"],
    caution: ["従業員数要件あり", "商工会/商工会議所の確認が必要", "交付決定前の発注はNG"],
    requiredInfo: ["従業員数", "事業所の所在地", "使いたい経費"],
    officialUrl: JGRANTS, sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["signboard", "website", "ad", "ec", "renovation", "event", "newstore"],
    keywords: /広告|チラシ|LP|ホームページ|ＨＰ|EC|看板|販路|展示会|販促|店舗改装|集客|新店舗|出店/i,
  },
  {
    key: "it_donyu", name: "IT導入補助金（デジタル化・AI導入補助金）", aliasNames: ["デジタル化・AI導入補助金", "IT補助金", "IT導入"], group: "national_subsidy", priority: "high", confidenceLabel: "確認推奨",
    relatedReason: "ソフトウェア・クラウド・POS・在庫管理・会計・EC・予約・セキュリティ・AI・業務効率化",
    whatToCheck: ["対象ツールに登録されているか", "IT導入支援事業者が必要か", "GビズIDの準備", "発注前か"],
    caution: ["対象ツール・支援事業者の指定あり", "GビズID取得に時間がかかる", "交付決定前の契約はNG"],
    requiredInfo: ["導入予定ツール／ベンダー", "GビズIDの有無"],
    officialUrl: "https://it-shien.smrj.go.jp/", sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["ai_pos", "ec", "website"],
    keywords: /IT|ソフト|クラウド|POS|在庫|会計|EC|予約|セキュリティ|AI|業務効率|システム|ホームページ|デジタル|決済|CRM/i,
  },
  {
    key: "monozukuri", name: "ものづくり補助金", aliasNames: ["ものづくり・商業・サービス生産性向上促進補助金"], group: "national_subsidy", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "革新的な設備投資・システム構築・新サービス開発・生産性向上",
    whatToCheck: ["事業計画（革新性）が作れるか", "賃上げ要件", "対象設備か", "発注前か"],
    caution: ["事業計画書が必要", "革新性・賃上げ要件", "交付決定前の発注はNG"],
    requiredInfo: ["投資内容と金額", "事業計画"],
    officialUrl: "https://portal.monodukuri-hojo.jp/", sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["ai_pos", "energy", "aircon", "newstore"],
    keywords: /設備投資|システム構築|新サービス|生産性|試作|機械装置|革新/i,
  },
  {
    key: "shoryokuka", name: "中小企業省力化投資補助金", aliasNames: ["省力化投資補助金", "省力化補助金"], group: "national_subsidy", priority: "high", confidenceLabel: "確認推奨",
    relatedReason: "省力化設備・IoT・ロボット・カタログ製品・現場の省力化投資",
    whatToCheck: ["カタログ型／一般型のどちらか", "対象製品・設備か", "発注前か"],
    caution: ["対象カタログ・製品の指定あり", "交付決定前の発注はNG"],
    requiredInfo: ["導入予定の設備・製品", "人手不足の状況"],
    officialUrl: "https://shoryokuka.smrj.go.jp/", sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["ai_pos", "aircon", "energy"],
    keywords: /省力化|省人化|自動化|ロボット|POS|在庫|IoT|AI|人手不足/i,
  },
  {
    key: "shinjigyo", name: "新事業進出補助金", aliasNames: ["新分野展開", "事業再構築"], group: "national_subsidy", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "新サービス・新店舗・新規事業・新分野展開",
    whatToCheck: ["既存事業との違い", "事業計画", "設備・システム投資の内容"],
    caution: ["新規性・事業計画が必要", "交付決定前の発注はNG"],
    requiredInfo: ["新規事業の内容", "投資内容"],
    officialUrl: JGRANTS, sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["newstore"],
    keywords: /新事業|新分野|新規事業|新店舗|新業態|新サービス|第二創業/i,
  },
  {
    key: "shokei_ma", name: "事業承継・M&A補助金", aliasNames: ["事業承継補助金", "M&A補助金"], group: "national_subsidy", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "M&A費用・専門家費用・引継ぎ後の設備/システム投資",
    whatToCheck: ["承継形態（譲渡・譲受）", "専門家費用の対象", "対象期間"],
    caution: ["承継形態の要件", "対象経費・期間の確認"],
    requiredInfo: ["承継・M&Aの形態", "専門家の関与"],
    officialUrl: JGRANTS, sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: [],
    keywords: /M&A|Ｍ＆Ａ|事業承継|事業譲|買収|引継|後継|PMI/i,
  },
  {
    key: "seichou", name: "中小企業成長加速化補助金（大規模成長投資系）", aliasNames: ["大規模成長投資補助金", "成長加速化補助金"], group: "national_subsidy", priority: "low", confidenceLabel: "確認推奨",
    relatedReason: "大規模設備・新拠点・大型投資",
    whatToCheck: ["投資額・売上規模の要件", "賃上げ要件"],
    caution: ["投資額・規模の下限あり", "賃上げ要件"],
    requiredInfo: ["投資規模", "売上規模"],
    officialUrl: JGRANTS, sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: [],
    keywords: /大規模|大型投資|新拠点|大型倉庫|大型システム/i,
  },
  // ── 厚労省系 助成金 ──
  {
    key: "gyomu_kaizen", name: "業務改善助成金", aliasNames: [], group: "labor_grant", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "賃上げ＋設備・POS・機械・コンサル・業務効率化",
    whatToCheck: ["従業員がいるか", "事業場内最低賃金", "賃上げ予定があるか", "交付決定前の実施はNG"],
    caution: ["従業員が必要", "事業場内最低賃金の引上げが要件", "交付決定前実施NG"],
    requiredInfo: ["従業員数", "事業場内最低賃金", "賃上げ計画"],
    officialUrl: "https://www.mhlw.go.jp/", sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["hire", "training"],
    keywords: /賃上げ|最低賃金|業務改善/i,
  },
  {
    key: "career_up", name: "キャリアアップ助成金", aliasNames: [], group: "labor_grant", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "非正規雇用の正社員化・処遇改善",
    whatToCheck: ["就業規則・雇用契約の整備", "対象労働者", "事前の計画"],
    caution: ["就業規則が必要", "事前の計画届", "社労士確認推奨"],
    requiredInfo: ["雇用形態", "対象者", "就業規則の有無"],
    officialUrl: "https://www.mhlw.go.jp/", sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["hire"],
    keywords: /正社員|非正規|アルバイト|処遇改善|賃金規定|キャリアアップ|採用|雇用/i,
  },
  {
    key: "jinzai_kaihatsu", name: "人材開発支援助成金", aliasNames: [], group: "labor_grant", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "研修・教育訓練・リスキリング（AI研修・DX研修含む）",
    whatToCheck: ["訓練計画", "対象労働者・訓練時間", "事前届出"],
    caution: ["訓練計画の事前提出", "対象訓練・時間の要件", "社労士確認推奨"],
    requiredInfo: ["研修内容", "対象者", "訓練時間"],
    officialUrl: "https://www.mhlw.go.jp/", sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["training"],
    keywords: /研修|教育訓練|リスキリング|人材育成|AI研修|DX研修|外部講座/i,
  },
  {
    key: "hatarakikata", name: "働き方改革推進支援助成金", aliasNames: [], group: "labor_grant", priority: "low", confidenceLabel: "確認推奨",
    relatedReason: "労働時間短縮・年休促進の環境整備（労務システム・設備・専門家）",
    whatToCheck: ["成果目標の設定", "就業規則", "労働局への申請"],
    caution: ["成果目標が必要", "労働局申請", "就業規則の整備"],
    requiredInfo: ["労働時間の状況", "就業規則"],
    officialUrl: "https://www.mhlw.go.jp/", sourceAuthority: "master", fiscalYear: "2025", officialStatus: "active", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["hire", "training"],
    keywords: /労働時間|年休|勤怠|労務|働き方/i,
  },
  // ── 自治体で必ず探す定番パターン ──
  {
    key: "local_energy", name: "省エネ・脱炭素・設備導入補助金（自治体）", aliasNames: ["省エネ補助金", "脱炭素補助金"], group: "local_pattern", priority: "high", confidenceLabel: "確認推奨",
    relatedReason: "空調・LED・冷蔵庫・厨房機器・業務用設備・省エネ設備",
    whatToCheck: ["省エネ診断の要否", "対象設備の型番・性能", "発注前か"],
    caution: ["省エネ性能・型番の証明", "発注前確認", "予算上限・先着の可能性"],
    requiredInfo: ["設備の型番・省エネ性能", "所在地"],
    officialSearchQuery: "{region} 省エネ 設備 補助金", sourceAuthority: "local_pattern", fiscalYear: "—", officialStatus: "unknown", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["aircon", "energy"],
    keywords: /空調|エアコン|LED|冷蔵庫|厨房|業務用|省エネ|高効率|脱炭素/i,
  },
  {
    key: "local_vacant", name: "空き店舗・中心市街地・商店街補助金（自治体）", aliasNames: ["空き店舗補助金", "中心市街地活性化"], group: "local_pattern", priority: "high", confidenceLabel: "確認推奨",
    relatedReason: "新店舗・空き店舗活用・内装・家賃・改装・看板",
    whatToCheck: ["対象区域か", "賃貸契約前か", "事前相談・商店街推薦の要否"],
    caution: ["対象区域の指定", "契約前の事前相談が必要なことが多い", "商店街推薦が要る場合あり"],
    requiredInfo: ["出店予定地（区域）", "契約状況"],
    officialSearchQuery: "{region} 空き店舗 補助金", sourceAuthority: "local_pattern", fiscalYear: "—", officialStatus: "unknown", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["newstore", "renovation"],
    keywords: /空き店舗|新店舗|内装|家賃|改装|看板|商店街|中心市街地|出店/i,
  },
  {
    key: "local_renovation", name: "店舗改装・店舗設備補助金（自治体）", aliasNames: ["店舗改装補助金"], group: "local_pattern", priority: "medium", confidenceLabel: "条件確認",
    relatedReason: "内装・外装・看板・什器・空調・店舗設備",
    whatToCheck: ["対象経費に空調・設備が含まれるか", "発注前か", "対象区域か"],
    caution: ["対象経費に空調設備が含まれるか公式要領で要確認", "発注前確認"],
    requiredInfo: ["改装・設備の内容", "所在地"],
    officialSearchQuery: "{region} 店舗改装 補助金", sourceAuthority: "local_pattern", fiscalYear: "—", officialStatus: "unknown", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["renovation", "aircon", "signboard"],
    keywords: /内装|外装|看板|什器|空調|店舗設備|改装/i,
  },
  {
    key: "local_dx", name: "DX・デジタル化補助金（自治体）", aliasNames: ["デジタル化補助金"], group: "local_pattern", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "POS・EC・在庫管理・AI・予約・CRM・業務効率化",
    whatToCheck: ["国のIT導入補助金との併用可否", "対象経費", "発注前か"],
    caution: ["国のIT導入補助金と重複しないか", "発注前確認"],
    requiredInfo: ["導入ツール", "所在地"],
    officialSearchQuery: "{region} DX デジタル化 補助金", sourceAuthority: "local_pattern", fiscalYear: "—", officialStatus: "unknown", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["ai_pos", "ec", "website"],
    keywords: /POS|EC|在庫|AI|予約|CRM|業務効率|DX|デジタル/i,
  },
  {
    key: "local_sales", name: "販路開拓・広告宣伝補助金（自治体）", aliasNames: ["販路開拓補助金", "広告宣伝補助金"], group: "local_pattern", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "LP・HP・チラシ・SNS広告・展示会・EC・看板",
    whatToCheck: ["国の持続化補助金との重複", "対象経費", "発注前か"],
    caution: ["持続化補助金との重複確認", "発注前確認"],
    requiredInfo: ["広告内容", "所在地"],
    officialSearchQuery: "{region} 販路開拓 広告 補助金", sourceAuthority: "local_pattern", fiscalYear: "—", officialStatus: "unknown", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["ad", "signboard", "website", "ec", "event"],
    keywords: /LP|HP|ホームページ|チラシ|SNS|展示会|EC|看板|広告|販路|PR|販促/i,
  },
  {
    key: "local_startup", name: "創業・新規出店補助金（自治体）", aliasNames: ["創業補助金"], group: "local_pattern", priority: "medium", confidenceLabel: "確認推奨",
    relatedReason: "新法人・新店舗・新規事業",
    whatToCheck: ["創業年数の要件", "認定創業支援等の要否", "事前相談"],
    caution: ["創業年数の要件", "認定支援・事前相談が必要なことが多い"],
    requiredInfo: ["創業時期", "所在地"],
    officialSearchQuery: "{region} 創業 補助金", sourceAuthority: "local_pattern", fiscalYear: "—", officialStatus: "unknown", needsAnnualRefresh: true, lastOfficialCheckedAt: CHECKED,
    templates: ["newstore"],
    keywords: /新法人|新店舗|新規事業|創業|起業|開業|出店/i,
  },
];

// 案件 → まず確認すべき定番制度
export function getCoreProgramChecks(project: SpendingProject): CoreProgramCheck[] {
  const tpl = project.templateKey ?? "";
  const text = [
    project.name, project.purpose, project.uses.join(" "), project.industry,
    ...Object.values(project.answers ?? {}),
  ].filter(Boolean).join(" ");
  const region = (project.location || project.store || "お住まいの自治体").trim();
  const skip = project.coreChecks ?? {};

  const out: CoreProgramCheck[] = [];
  for (const m of CORE_PROGRAM_MASTER) {
    const hit = (m.templates.length > 0 && m.templates.includes(tpl)) || m.keywords.test(text);
    if (!hit) continue;
    if (skip[m.key] === "skip") continue;
    out.push({
      key: m.key, name: m.name, group: m.group, priority: m.priority, confidenceLabel: m.confidenceLabel,
      relatedReason: m.relatedReason,
      projectFitReason: `この案件（${project.uses.join("・") || project.name || "支出"}）は、${m.relatedReason.split("・").slice(0, 3).join("・")}に関係するため確認の価値があります`,
      whatToCheck: m.whatToCheck, caution: m.caution, requiredInfo: m.requiredInfo,
      relatedTemplateKeys: m.templates, relatedUses: project.uses, relatedExpenses: [],
      officialUrl: m.officialUrl,
      officialSearchQuery: m.officialSearchQuery ? m.officialSearchQuery.replace("{region}", region) : undefined,
      sourceAuthority: m.sourceAuthority, aliasNames: m.aliasNames, fiscalYear: m.fiscalYear, officialStatus: m.officialStatus,
    });
  }
  // 並び順：国の高優先 → 国 → 厚労省 → 自治体パターン
  const groupRank: Record<CoreGroup, number> = { national_subsidy: 0, labor_grant: 1, local_pattern: 2 };
  const prRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => groupRank[a.group] - groupRank[b.group] || prRank[a.priority] - prRank[b.priority]);
}

// 公式情報リンク（直URL or 検索）
export function coreOfficialHref(c: CoreProgramCheck): string {
  if (c.officialUrl) return c.officialUrl;
  if (c.officialSearchQuery) return `https://www.google.com/search?q=${encodeURIComponent(c.officialSearchQuery)}`;
  return "https://www.jgrants-portal.go.jp/";
}
