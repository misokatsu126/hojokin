import type {
  Recommendation,
  MatchStatus,
  ApplicationStatus,
  AlertType,
} from "./constants";

export type Grant = {
  id: string;
  name: string;
  grant_type: string | null; // 補助金/助成金/...
  organization: string | null; // 実施主体
  org_type: string | null; // 国/自治体/...
  regions: string[];
  industries: string[];
  entity_types: string[];
  target_audience: string | null; // 対象者
  expense_categories: string[]; // 対象経費カテゴリ
  subsidy_rate: string | null; // 補助率
  min_amount: number | null;
  max_amount: number | null; // 補助上限額
  application_start: string | null;
  application_deadline: string | null;
  recruitment_status: string | null; // 募集中/...
  application_method: string | null;
  required_documents: string | null;
  official_url: string | null;
  guideline_pdf_url: string | null;
  notes: string | null; // 注意点
  pre_application_ng: boolean; // 申請前着手NGの可能性
  requires_professional: boolean; // 士業確認推奨
  keywords: string[];
  purposes: string[]; // 目的カテゴリ
  exclusion_conditions: string | null; // 対象外条件
  early_termination_risk: boolean; // 予算上限・早期終了の可能性
  selection_type: string | null; // 採択制/条件達成型/不明
  difficulty: string | null; // 低/中/高/不明
  source: string | null; // 取得元（将来の自動収集用）
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GrantInput = Omit<Grant, "id" | "created_at" | "updated_at">;

export type BusinessProfile = {
  id: string;
  name: string; // 事業名
  entity_type: string | null; // 法人種別
  location: string | null; // 所在地
  regions: string[]; // 対象地域
  industries: string[];
  description: string | null; // 事業内容
  purposes: string[]; // 目的
  expenses: string[]; // 使いたい経費
  keywords: string[];
  exclude_keywords: string[];
  desired_amount: number | null; // 補助上限額の希望
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessProfileInput = Omit<
  BusinessProfile,
  "id" | "created_at" | "updated_at"
>;

export type WatchCondition = {
  id: string;
  profile_id: string;
  regions: string[];
  industries: string[];
  entity_types: string[];
  purposes: string[];
  keywords: string[];
  exclude_keywords: string[];
  expense_categories: string[];
  max_amount: number | null;
  recruitment_status: string | null;
  deadline_condition: string | null;
  created_at: string;
  updated_at: string;
};

// AI / ルールベース判定の結果（仕様のJSON形式に準拠）
export type MatchResult = {
  match_score: number; // 0-100
  recommendation: Recommendation; // A/B/C/D
  status: MatchStatus; // high_match/...
  matched_reasons: string[];
  possible_uses: string[];
  eligible_expenses: string[];
  exclusion_risks: string[];
  deadline_warning: string;
  pre_application_warning: string;
  next_actions: string[];
  professional_consultation_needed: boolean;
  summary: string;
};

// grant_matches テーブルの行
export type GrantMatch = MatchResult & {
  id: string;
  grant_id: string;
  profile_id: string;
  engine: "ai" | "rule";
  created_at: string;
  updated_at: string;
};

export type Alert = {
  id: string;
  grant_id: string;
  profile_id: string;
  alert_type: AlertType;
  match_score: number | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
};

export type AppStatusRow = {
  id: string;
  grant_id: string;
  profile_id: string;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
};

export type StatusNote = {
  id: string;
  grant_id: string;
  profile_id: string;
  status: string | null;
  note: string;
  created_at: string;
};

// 自然文AI検索の出力（仕様のJSON形式に準拠）
export type InterpretedConditions = {
  regions: string[];
  industries: string[];
  business_types: string[];
  purposes: string[];
  eligible_expenses: string[];
  min_grant_amount: number | null;
  deadline_condition: string;
  status: string;
  keywords: string[];
};

export type NlSearchResultItem = {
  grant_id: string;
  grant_name: string;
  match_score: number;
  recommendation: Recommendation;
  matched_reasons: string[];
  possible_uses: string[];
  concerns: string[];
  next_actions: string[];
  official_url: string | null;
};

export type NlSearchResponse = {
  interpreted_conditions: InterpretedConditions;
  results: NlSearchResultItem[];
  relaxed_search_suggestions: string[];
  summary: string;
  engine: "ai" | "rule";
};
