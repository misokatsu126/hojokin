import type { Grant, InterpretedConditions } from "./types";
import { REGIONS, INDUSTRIES, PURPOSES, ENTITY_TYPES, EXPENSE_CATEGORIES } from "./constants";
import { expandQuery, expandRegions } from "./synonyms";

// 自然文から検索条件をルールベースで抽出（OpenAI 未設定時のフォールバック）。
//   制度名を知らない初心者向けに、類義語辞書（synonyms.ts）で
//   「やりたいこと・使いたい経費」を目的/経費/業種/キーワードに展開して補強する。
export function ruleExtractConditions(text: string): InterpretedConditions {
  const found = (vocab: readonly string[]) => vocab.filter((v) => v !== "全国" && v !== "全業種" && text.includes(v));
  const expanded = expandQuery(text);
  const uniq = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));

  // 金額（「100万円以上」「上限100万」など）
  let min_grant_amount: number | null = null;
  const man = text.match(/(\d+)\s*万円?(以上)?/);
  if (man) min_grant_amount = Number(man[1]) * 10_000;
  const oku = text.match(/(\d+)\s*億円?/);
  if (oku) min_grant_amount = Number(oku[1]) * 100_000_000;

  // 締切条件
  let deadline_condition = "";
  if (text.includes("今月")) deadline_condition = "this_month";
  else if (/(締切|締め切り|期限).{0,4}(近|迫|間近)/.test(text) || text.includes("締切間近")) deadline_condition = "soon";
  else if (text.includes("30日")) deadline_condition = "within_30";
  else if (text.includes("今週") || text.includes("7日")) deadline_condition = "within_7";

  // 募集状態
  let status = "";
  if (text.includes("募集中")) status = "募集中";
  else if (text.includes("募集予定")) status = "募集予定";

  return {
    regions: uniq(found(REGIONS), expandRegions(text)),
    industries: uniq(found(INDUSTRIES), expanded.industries),
    business_types: found(ENTITY_TYPES),
    purposes: uniq(found(PURPOSES), expanded.purposes),
    eligible_expenses: uniq(found(EXPENSE_CATEGORIES), expanded.expenses),
    min_grant_amount,
    deadline_condition,
    status,
    keywords: expanded.keywords,
  };
}

// 抽出条件で登録済み補助金を絞り込み（完全一致がなければ緩和は呼び出し側で対応）
export function filterGrantsByConditions(
  grants: Grant[],
  cond: InterpretedConditions,
  strict: boolean
): Grant[] {
  return grants.filter((g) => {
    if (strict && cond.regions.length) {
      const ok = g.regions.includes("全国") || cond.regions.some((r) => g.regions.includes(r));
      if (!ok) return false;
    }
    if (strict && cond.industries.length) {
      const ok = g.industries.includes("全業種") || cond.industries.some((i) => g.industries.includes(i));
      if (!ok) return false;
    }
    if (cond.purposes.length) {
      const ok = cond.purposes.some((p) => g.purposes.includes(p) || g.keywords.includes(p));
      if (!ok) return false;
    }
    if (cond.business_types.length) {
      const ok = g.entity_types.length === 0 || cond.business_types.some((b) => g.entity_types.includes(b));
      if (!ok) return false;
    }
    if (cond.eligible_expenses.length) {
      const ok = cond.eligible_expenses.some((e) => g.expense_categories.includes(e));
      if (strict && !ok) return false;
    }
    if (cond.min_grant_amount != null && g.max_amount != null) {
      if (g.max_amount < cond.min_grant_amount) return false;
    }
    if (cond.status && g.recruitment_status && g.recruitment_status !== cond.status) {
      if (strict) return false;
    }
    return true;
  });
}
