import type {
  Recommendation,
  MatchStatus,
  ApplicationStatus,
  AlertType,
  SourceType,
  TrustLevel,
  SourcePriority,
  CrawlFrequency,
  DetectionType,
  DiscoveredStatus,
  VerificationStatus,
  ReviewStatus,
  AudienceType,
  ReviewState,
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
  source_type?: "grant";
};

// 自然文検索で返す「自動検知候補（discovered_items）」側の結果
export type DiscoveredSearchItem = {
  source_type: "discovered_item";
  id: string;
  title: string;
  url: string | null;
  official_url: string | null;
  external_source: string | null;
  match_score: number | null;
  match_profile: string | null;
  status: string;
  score: number; // 検索関連度
};

// URL直接取り込みの結果（検索文にURLが含まれていた場合）
export type IngestResult = {
  ok: boolean;
  title?: string;
  url?: string;
  official_url?: string | null;
  inserted?: boolean;
  error?: string;
};

export type NlSearchResponse = {
  interpreted_conditions: InterpretedConditions;
  results: NlSearchResultItem[];
  relaxed_search_suggestions: string[];
  summary: string;
  engine: "ai" | "rule";
  // 自動検知候補（discovered_items）側の検索結果（任意・後方互換）
  discovered_results?: DiscoveredSearchItem[];
  // 検索文にURLが含まれていた場合の直接取り込み結果（任意）
  ingested?: IngestResult;
};

// =============================================================
// 自動探索レーダー用の型
// =============================================================

// 監視対象サイト（情報源）
export type SourceSite = {
  id: string;
  name: string;
  source_type: SourceType;
  trust_level: TrustLevel;
  url: string | null;
  region: string | null;
  priority: SourcePriority;
  crawl_frequency: CrawlFrequency;
  is_active: boolean;
  last_checked_at: string | null;
  notes: string | null;
  // discovery_collect_schema.sql で追加（既存環境では未定義のこともあるため任意）
  feed_url?: string | null;
  audience_scope?: AudienceType | null;
  created_at: string;
  updated_at: string;
};
export type SourceSiteInput = Omit<SourceSite, "id" | "created_at" | "updated_at">;

// 巡回ログ（将来の自動巡回用）
export type SourceFetchLog = {
  id: string;
  source_site_id: string | null;
  fetched_at: string;
  status: "success" | "error" | "skipped";
  http_status: number | null;
  error_message: string | null;
  detected_count: number;
  created_at: string;
};

// 自動/手動で検知した補助金候補
export type DiscoveredItem = {
  id: string;
  source_site_id: string | null;
  title: string | null;
  url: string | null;
  detected_at: string;
  raw_text: string | null;
  raw_html: string | null;
  pdf_url: string | null;
  detection_type: DetectionType;
  status: DiscoveredStatus;
  source_category: SourceType | null;
  trust_level: TrustLevel | null;
  original_source_url: string | null;
  official_url: string | null;
  official_pdf_url: string | null;
  official_source_confirmed: boolean;
  source_warning: string | null;
  last_verified_at: string | null;
  verification_status: VerificationStatus;
  duplicate_of: string | null;
  // discovery_collect_schema.sql で追加（既存環境では未定義のこともあるため任意）
  audience_type?: AudienceType | null;
  external_id?: string | null;
  external_source?: string | null;
  // discovery_dedup_schema.sql で追加（情報源をまたいだ重複検知用の正規化キー）
  normalized_key?: string | null;
  // discovery_fetch_schema.sql で追加（実HTTP取得メタ）
  fetched_at?: string | null;
  extraction_confidence?: number | null;
  // discovery_match_schema.sql で追加（事業プロフィールとの自動照合結果）
  match_score?: number | null;
  match_profile?: string | null;
  match_recommendation?: string | null;
  extracted_deadline?: string | null;
  // discovery_ui_schema.sql で追加（人による確認状態・相性理由）
  review_state?: ReviewState | null;
  match_reason?: string | null;
  // discovery_note_schema.sql で追加（担当者メモ）
  human_note?: string | null;
  created_at: string;
  updated_at: string;
};
export type DiscoveredItemInput = Omit<
  DiscoveredItem,
  "id" | "detected_at" | "created_at" | "updated_at"
>;

// AI/ルールで抽出・正規化した補助金候補
export type ExtractedGrantCandidate = {
  id: string;
  discovered_item_id: string | null;
  name: string | null;
  grant_type: string | null;
  organizer: string | null;
  target_regions: string[];
  target_industries: string[];
  target_business_types: string[];
  target_people: string | null;
  eligible_expenses: string[];
  subsidy_rate: string | null;
  max_amount: number | null;
  min_amount: number | null;
  application_start_date: string | null;
  deadline: string | null;
  application_status: string | null;
  application_method: string | null;
  required_documents: string | null;
  official_url: string | null;
  official_pdf_url: string | null;
  notes: string | null;
  pre_application_ng_risk: boolean;
  professional_check_recommended: boolean;
  confidence_score: number;
  missing_fields: string[];
  source_category: SourceType | null;
  trust_level: TrustLevel | null;
  verification_status: VerificationStatus;
  // discovery_collect_schema.sql で追加（既存環境では未定義のこともあるため任意）
  audience_type?: AudienceType | null;
  created_at: string;
  updated_at: string;
};
export type ExtractedGrantCandidateInput = Omit<
  ExtractedGrantCandidate,
  "id" | "created_at" | "updated_at"
>;

// 人間による確認・承認履歴
export type ImportReview = {
  id: string;
  extracted_grant_candidate_id: string | null;
  reviewer_name: string | null;
  review_status: ReviewStatus;
  review_note: string | null;
  approved_grant_id: string | null;
  created_at: string;
  updated_at: string;
};

// AI/ルール抽出の出力（extracted_grant_candidates への保存前の形）
export type ExtractionResult = {
  name: string;
  grant_type: string | null;
  organizer: string | null;
  target_regions: string[];
  target_industries: string[];
  target_business_types: string[];
  target_people: string | null;
  eligible_expenses: string[];
  subsidy_rate: string | null;
  max_amount: number | null;
  min_amount: number | null;
  application_start_date: string | null;
  deadline: string | null;
  application_status: string | null;
  application_method: string | null;
  required_documents: string | null;
  official_url: string | null;
  official_pdf_url: string | null;
  notes: string | null;
  pre_application_ng_risk: boolean;
  professional_check_recommended: boolean;
  confidence_score: number;
  missing_fields: string[];
};
