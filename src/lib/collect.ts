import {
  supabase,
  upsertDiscoveredByExternal,
  discoveredExists,
  findDiscoveredByNormalizedKey,
  setDiscoveredDuplicate,
  createSourceFetchLog,
  findOrCreateSourceSite,
  fetchSourceSites,
} from "./supabase";
import { htmlToText } from "./discovery";
import { regionTextInTarget, type AudienceType } from "./constants";
import type { SourceSite } from "./types";

// =============================================================
// 自動収集（合法ルートのみ）
//   - Jグランツ公開API（デジタル庁）: GET /exp/v1/public/subsidies, /subsidies/id/{id}
//   - 公式ページのサーバー側fetch（HTMLのリンク抽出。robots等で取れない場合はスキップ）
//   - 公開RSS/Atomフィードの購読
//   ※ 民間まとめサイトの自動スクレイピングは実装しない（方針）
// =============================================================

// 取得時のタイムアウト付き fetch。失敗してもアプリを落とさず ok:false を返す。
async function safeFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; text?: string; error?: string }> {
  const timeoutMs = init?.timeoutMs ?? 10000;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "HojokinRadar/1.0 (+contact: tool admin)",
        Accept: "application/json, text/html, application/xml;q=0.9, */*;q=0.8",
        ...(init?.headers ?? {}),
      },
    });
    clearTimeout(timer);
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    const err = e as Error;
    return { ok: false, status: 0, error: err.name === "AbortError" ? "timeout" : err.message };
  }
}

// 事業者向け / 個人向け の簡易判定（本文キーワード）
export function inferAudience(text: string): AudienceType {
  const t = text ?? "";
  const business = /(中小企業|小規模事業者|事業者|法人|個人事業主|創業|起業|スタートアップ|商工|販路|設備投資|生産性|事業再構築)/.test(t);
  // 「個人事業主」は事業者扱いなので、個人判定からは除外した語のみ
  const individual = /(個人(?!事業)|住民|県民|市民|町民|子育て|出産|育児|移住|定住|結婚|新婚|住宅|リフォーム|学生|奨学|求職|就職|高齢者|障害|介護|医療費)/.test(t);
  if (business && individual) return "both";
  if (business) return "business";
  if (individual) return "individual";
  return "unknown";
}

// 情報源をまたいだ重複検知用の正規化キー（補助金名ベース）。
//   公式名称は情報源（Jグランツ/ミラサポ/J-Net21/自治体）が違っても概ね共通なため、
//   名称を NFKC 正規化＋空白記号除去して突き合わせる（実施主体やドメインはあえて含めない）。
export function buildNormalizedKey(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[、。・,.\-―ー–—_()（）「」『』【】\[\]"'’“”:：;；/／|｜~〜!！?？#＃&＆＊*]/g, "");
}

// 取り込み後にクロスソース重複を検知し duplicate_of を設定（自動統合はしない）。
//   優先順位: Jグランツ ＞ ミラサポplus ＝ J-Net21 ＝ その他。
//   - 新規が Jグランツ → 既存の非Jグランツ同名を「重複候補」として新規に紐づける（新規を本体）。
//   - 新規が非Jグランツ → 既存（Jグランツ優先）を本体として新規を重複候補に回す。
async function resolveCrossSourceDuplicate(
  newId: string | null,
  normalizedKey: string,
  newSource: string | null
): Promise<void> {
  if (!newId || !normalizedKey) return;
  let matches: { id: string; external_source: string | null; duplicate_of: string | null }[] = [];
  try {
    matches = await findDiscoveredByNormalizedKey(normalizedKey, newId);
  } catch {
    return;
  }
  if (matches.length === 0) return;
  const isJ = (s: string | null) => s === "jgrants";

  if (isJ(newSource)) {
    // 新規(Jグランツ)を本体に。既存の非Jグランツ同名を重複候補として紐づける。
    for (const m of matches) {
      if (!isJ(m.external_source) && m.duplicate_of !== newId) {
        try {
          await setDiscoveredDuplicate(m.id, newId);
        } catch {
          /* noop */
        }
      }
    }
  } else {
    // 新規(非Jグランツ)は、Jグランツ＞重複でない既存＞先頭 を本体として紐づける。
    const canonical =
      matches.find((m) => isJ(m.external_source)) ??
      matches.find((m) => !m.duplicate_of) ??
      matches[0];
    if (canonical && canonical.id !== newId) {
      try {
        await setDiscoveredDuplicate(newId, canonical.id);
      } catch {
        /* noop */
      }
    }
  }
}

// ---------------- Jグランツ公開API ----------------
const JGRANTS_BASE = "https://api.jgrants-portal.go.jp/exp/v1/public";
const JGRANTS_PORTAL = "https://www.jgrants-portal.go.jp/subsidy";

// 対象地域×複数キーワードでループ検索するための既定キーワード
const JGRANTS_DEFAULT_KEYWORDS = [
  "補助金",
  "助成金",
  "IT",
  "DX",
  "省エネ",
  "創業",
  "販路",
  "設備",
];
// target_area_search に渡す地域（全国＋対象地域）。空でも regionTextInTarget で再フィルタ。
const JGRANTS_AREAS = ["全国", "愛知県", "名古屋市", "弥富市", "岐阜県", "岐阜市", "三重県", "四日市市"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type JgrantsListItem = {
  id?: string;
  name?: string;
  title?: string;
  target_area_search?: string;
  subsidy_max_limit?: number | null;
  acceptance_start_datetime?: string | null;
  acceptance_end_datetime?: string | null;
  target_number_of_employees?: string | null;
  institution_name?: string | null;
};

type JgrantsDetail = {
  subsidy_catch_phrase?: string | null;
  detail?: string | null;
  use_purpose?: string | null;
  industry?: string | null;
  target_area_detail?: string | null;
  subsidy_rate?: string | null;
  project_end_deadline?: string | null;
  front_subsidy_detail_page_url?: string | null;
};

// Jグランツ一覧API（keyword 必須・2〜255文字、sort/order/acceptance 必須、target_area_search 任意）
async function jgrantsSearch(keyword: string, targetArea?: string): Promise<JgrantsListItem[]> {
  const qs = new URLSearchParams({
    keyword,
    sort: "created_date",
    order: "DESC",
    acceptance: "1", // 募集中のみ
  });
  if (targetArea) qs.set("target_area_search", targetArea);
  const r = await safeFetch(`${JGRANTS_BASE}/subsidies?${qs.toString()}`, { timeoutMs: 12000 });
  if (!r.ok || !r.text) throw new Error(r.error ?? `HTTP ${r.status}`);
  let json: any;
  try {
    json = JSON.parse(r.text);
  } catch {
    throw new Error("JSON parse error");
  }
  const result = Array.isArray(json?.result) ? json.result : [];
  return result as JgrantsListItem[];
}

// Jグランツ詳細API（公式詳細ページURLや補助率・締切などを補完）。失敗時は null。
async function jgrantsDetail(id: string): Promise<JgrantsDetail | null> {
  const r = await safeFetch(`${JGRANTS_BASE}/subsidies/id/${encodeURIComponent(id)}`, { timeoutMs: 12000 });
  if (!r.ok || !r.text) return null;
  try {
    const json = JSON.parse(r.text);
    const d = Array.isArray(json?.result) ? json.result[0] : json?.result;
    return (d as JgrantsDetail) ?? null;
  } catch {
    return null;
  }
}

export type CollectSummary = {
  source: string;
  ok: boolean;
  inserted: number;
  updated: number;
  scanned: number;
  error?: string;
};

/**
 * Jグランツから対象地域×複数キーワードでループ検索し discovered_items に upsert する。
 * - 一覧APIで募集中の補助金を取得 → 対象地域で再フィルタ → upsert（external_id で重複排除）。
 * - 新規分は詳細APIで front_subsidy_detail_page_url・補助率・締切等を補完（件数上限あり）。
 * - レート制限に配慮し各リクエスト間に小待機。取得失敗時も throw せず ok:false を返す。
 */
export async function runJgrantsSync(opts?: {
  keywords?: string[];
  maxListCalls?: number;
  maxDetail?: number;
}): Promise<CollectSummary> {
  const summary: CollectSummary = { source: "jgrants", ok: true, inserted: 0, updated: 0, scanned: 0 };

  // Jグランツ用の情報源（source_sites）を用意（ログ紐づけ用）
  let site: SourceSite | null = null;
  try {
    site = await findOrCreateSourceSite(
      { url: "https://www.jgrants-portal.go.jp/" },
      {
        name: "Jグランツ（補助金電子申請システム・公開API）",
        source_type: "semi_official",
        trust_level: "B",
        url: "https://www.jgrants-portal.go.jp/",
        region: "全国",
        priority: "high",
        crawl_frequency: "daily",
        is_active: true,
        last_checked_at: null,
        notes: "デジタル庁 Jグランツ公開API（GET /exp/v1/public/subsidies）。認証不要。利用規約: https://www.jgrants-portal.go.jp/open-api",
      }
    );
  } catch {
    // source_sites が無い環境でも収集自体は継続（ログだけ諦める）
  }

  const keywords = opts?.keywords?.length ? opts.keywords : JGRANTS_DEFAULT_KEYWORDS;
  const maxListCalls = opts?.maxListCalls ?? 36;
  const maxDetail = opts?.maxDetail ?? 20;

  const seen = new Set<string>();
  let listCalls = 0;
  let callsTried = 0;
  let callsFailed = 0;
  let detailFetched = 0;
  let lastError = "";

  try {
    outer: for (const area of JGRANTS_AREAS) {
      for (const kw of keywords) {
        if (!kw || kw.length < 2) continue;
        if (listCalls >= maxListCalls) break outer;
        listCalls++;
        callsTried++;
        let items: JgrantsListItem[] = [];
        try {
          items = await jgrantsSearch(kw, area);
        } catch (e) {
          callsFailed++;
          lastError = (e as Error).message;
          await sleep(200);
          continue;
        }
        for (const it of items) {
          if (!it.id || seen.has(it.id)) continue;
          seen.add(it.id);
          summary.scanned++;
          // 対象地域でフィルタ（全国・空も対象）
          if (!regionTextInTarget(it.target_area_search)) continue;

          const name = (it.name || it.title || "").trim() || "（名称不明のJグランツ補助金）";
          const baseLines = [
            name,
            it.institution_name ? `実施機関: ${it.institution_name}` : "",
            it.target_area_search ? `対象地域: ${it.target_area_search}` : "",
            it.subsidy_max_limit != null ? `上限額: ${it.subsidy_max_limit}円` : "",
            it.acceptance_start_datetime ? `募集開始: ${it.acceptance_start_datetime}` : "",
            it.acceptance_end_datetime ? `締切: ${it.acceptance_end_datetime}` : "",
            it.target_number_of_employees ? `従業員規模: ${it.target_number_of_employees}` : "",
          ].filter(Boolean);

          const portalUrl = `${JGRANTS_PORTAL}/${it.id}`;
          let officialUrl = portalUrl;
          let pdfUrl: string | null = null;

          // 新規候補だけ詳細APIで補完（件数上限・小待機）
          const exists = await discoveredExists(`jgrants:${it.id}`);
          if (!exists && detailFetched < maxDetail) {
            detailFetched++;
            await sleep(150);
            const d = await jgrantsDetail(it.id);
            if (d) {
              if (d.front_subsidy_detail_page_url) officialUrl = d.front_subsidy_detail_page_url;
              if (d.subsidy_catch_phrase) baseLines.push(`概要: ${d.subsidy_catch_phrase}`);
              if (d.subsidy_rate) baseLines.push(`補助率: ${d.subsidy_rate}`);
              if (d.use_purpose) baseLines.push(`目的: ${d.use_purpose}`);
              if (d.industry) baseLines.push(`業種: ${d.industry}`);
              if (d.project_end_deadline) baseLines.push(`事業終了期限: ${d.project_end_deadline}`);
            }
          }

          const rawText = baseLines.join("\n");
          const normalizedKey = buildNormalizedKey(name);
          try {
            const { inserted, id } = await upsertDiscoveredByExternal({
              external_id: `jgrants:${it.id}`,
              external_source: "jgrants",
              source_site_id: site?.id ?? null,
              title: name,
              url: officialUrl,
              raw_text: rawText,
              raw_html: null,
              pdf_url: pdfUrl,
              detection_type: "new",
              status: "unreviewed",
              source_category: "semi_official",
              trust_level: "B",
              original_source_url: portalUrl,
              // Jグランツは公的ポータルなので公式URLとして扱う
              official_url: officialUrl,
              official_pdf_url: null,
              official_source_confirmed: true,
              source_warning: null,
              last_verified_at: null,
              verification_status: "official_found",
              duplicate_of: null,
              normalized_key: normalizedKey,
              audience_type: inferAudience(rawText) === "unknown" ? "business" : inferAudience(rawText),
            });
            if (inserted) summary.inserted++;
            else summary.updated++;
            // 情報源をまたいだ重複検知（Jグランツを本体に）
            await resolveCrossSourceDuplicate(id, normalizedKey, "jgrants");
          } catch {
            // 1件の保存失敗は無視して継続
          }
        }
        await sleep(200); // レート配慮
      }
    }
  } catch (e) {
    summary.ok = false;
    summary.error = (e as Error).message;
  }

  // 全リクエストで取得に失敗した場合は ok:false（外部到達不可・API障害を可視化）
  if (summary.ok && callsTried > 0 && callsFailed === callsTried) {
    summary.ok = false;
    summary.error = `Jグランツへの取得に全て失敗しました（${lastError || "ネットワーク不可"}）`;
  }

  if (site) {
    await createSourceFetchLog({
      source_site_id: site.id,
      status: summary.ok ? "success" : "error",
      detected_count: summary.inserted + summary.updated,
      error_message: summary.error ?? null,
    });
    try {
      await supabase.from("source_sites").update({ last_checked_at: new Date().toISOString() }).eq("id", site.id);
    } catch {
      /* noop */
    }
  }
  return summary;
}

// ---------------- 公式ページ巡回（リンク抽出） ----------------
const SUBSIDY_LINK_RE = /(補助金|助成金|給付金|支援金|補助|助成|奨励金)/;

function extractLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = htmlToText(m[2]).trim();
    if (!text || text.length < 4) continue;
    if (!SUBSIDY_LINK_RE.test(text)) continue;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    out.push({ href: abs, text });
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * 指定した公式ページ(source_sites.url)を取得し、補助金関連リンクを discovered_items に保存。
 * 取得失敗(robots/JS描画/タイムアウト)時は source_fetch_logs に error を記録しスキップ。
 */
export async function runCrawl(site: SourceSite): Promise<CollectSummary> {
  const summary: CollectSummary = { source: `crawl:${site.name}`, ok: true, inserted: 0, updated: 0, scanned: 0 };
  if (!site.url) {
    summary.ok = false;
    summary.error = "URL未設定";
    await createSourceFetchLog({ source_site_id: site.id, status: "skipped", error_message: summary.error });
    return summary;
  }

  const r = await safeFetch(site.url, { timeoutMs: 12000 });
  if (!r.ok || !r.text) {
    summary.ok = false;
    summary.error = r.error ?? `HTTP ${r.status}`;
    await createSourceFetchLog({
      source_site_id: site.id,
      status: "error",
      http_status: r.status || null,
      error_message: `取得失敗（${summary.error}）。手動確認に切替を推奨。`,
    });
    await supabase.from("source_sites").update({ last_checked_at: new Date().toISOString() }).eq("id", site.id);
    return summary;
  }

  const links = extractLinks(r.text, site.url);
  const audienceScope = site.audience_scope ?? "both";
  for (const lk of links) {
    summary.scanned++;
    const normalizedKey = buildNormalizedKey(lk.text);
    try {
      const { inserted, id } = await upsertDiscoveredByExternal({
        external_id: `crawl:${lk.href}`,
        external_source: "crawl",
        source_site_id: site.id,
        title: lk.text.slice(0, 200),
        url: lk.href,
        raw_text: null,
        raw_html: null,
        pdf_url: lk.href.toLowerCase().endsWith(".pdf") ? lk.href : null,
        detection_type: "new",
        status: "unreviewed",
        source_category: site.source_type,
        trust_level: site.trust_level,
        original_source_url: lk.href,
        official_url: site.source_type === "official" ? lk.href : null,
        official_pdf_url: null,
        official_source_confirmed: site.source_type === "official",
        source_warning: null,
        last_verified_at: null,
        verification_status: site.source_type === "official" ? "official_found" : "unverified",
        duplicate_of: null,
        normalized_key: normalizedKey,
        audience_type: audienceScope === "both" ? inferAudience(lk.text) : (audienceScope as AudienceType),
      });
      if (inserted) summary.inserted++;
      else summary.updated++;
      await resolveCrossSourceDuplicate(id, normalizedKey, "crawl");
    } catch {
      /* skip one */
    }
  }

  await createSourceFetchLog({
    source_site_id: site.id,
    status: "success",
    http_status: r.status,
    detected_count: summary.inserted + summary.updated,
  });
  await supabase.from("source_sites").update({ last_checked_at: new Date().toISOString() }).eq("id", site.id);
  return summary;
}

// ---------------- RSS/Atom フィード取り込み ----------------
function parseFeed(xml: string): { title: string; link: string; desc: string }[] {
  const items: { title: string; link: string; desc: string }[] = [];
  const pick = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (!m) return "";
    return htmlToText(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
  };
  // RSS <item>
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const b = m[0];
    items.push({ title: pick(b, "title"), link: pick(b, "link"), desc: pick(b, "description") });
  }
  // Atom <entry>
  if (items.length === 0) {
    const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
    while ((m = entryRe.exec(xml)) !== null) {
      const b = m[0];
      let link = "";
      const lm = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (lm) link = lm[1];
      items.push({ title: pick(b, "title"), link, desc: pick(b, "summary") || pick(b, "content") });
    }
  }
  return items.filter((i) => i.title && i.link).slice(0, 40);
}

/**
 * 公開RSS/Atomフィードを購読し discovered_items に保存。失敗時は error ログ。
 */
export async function runFeed(site: SourceSite): Promise<CollectSummary> {
  const summary: CollectSummary = { source: `feed:${site.name}`, ok: true, inserted: 0, updated: 0, scanned: 0 };
  const feedUrl = site.feed_url;
  if (!feedUrl) {
    summary.ok = false;
    summary.error = "feed_url未設定";
    return summary;
  }
  const r = await safeFetch(feedUrl, { timeoutMs: 12000 });
  if (!r.ok || !r.text) {
    summary.ok = false;
    summary.error = r.error ?? `HTTP ${r.status}`;
    await createSourceFetchLog({
      source_site_id: site.id,
      status: "error",
      http_status: r.status || null,
      error_message: `フィード取得失敗（${summary.error}）`,
    });
    return summary;
  }

  const entries = parseFeed(r.text);
  const audienceScope = site.audience_scope ?? "both";
  for (const e of entries) {
    summary.scanned++;
    const text = `${e.title}\n${e.desc}`;
    const normalizedKey = buildNormalizedKey(e.title);
    try {
      const { inserted, id } = await upsertDiscoveredByExternal({
        external_id: `feed:${e.link}`,
        external_source: "feed",
        source_site_id: site.id,
        title: e.title.slice(0, 200),
        url: e.link,
        raw_text: e.desc || null,
        raw_html: null,
        pdf_url: null,
        detection_type: "new",
        status: "unreviewed",
        source_category: site.source_type,
        trust_level: site.trust_level,
        original_source_url: e.link,
        official_url: site.source_type === "official" ? e.link : null,
        official_pdf_url: null,
        official_source_confirmed: site.source_type === "official",
        source_warning: null,
        last_verified_at: null,
        verification_status: site.source_type === "official" ? "official_found" : "unverified",
        duplicate_of: null,
        normalized_key: normalizedKey,
        audience_type: audienceScope === "both" ? inferAudience(text) : (audienceScope as AudienceType),
      });
      if (inserted) summary.inserted++;
      else summary.updated++;
      await resolveCrossSourceDuplicate(id, normalizedKey, "feed");
    } catch {
      /* skip one */
    }
  }

  await createSourceFetchLog({
    source_site_id: site.id,
    status: "success",
    http_status: r.status,
    detected_count: summary.inserted + summary.updated,
  });
  await supabase.from("source_sites").update({ last_checked_at: new Date().toISOString() }).eq("id", site.id);
  return summary;
}

// ---------------- 地域フィルタ補助（対象地域＋全国を残し、他県のみ明示のものは除外） ----------------
const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県",
  "東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県",
  "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県",
  "香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];
const TARGET_PREFS = ["愛知県", "岐阜県", "三重県"];
function keepForRegion(text: string): boolean {
  if (regionTextInTarget(text)) return true; // 全国 or 対象地域を含む / 空
  // 対象外の都道府県が明示されているなら除外、どの県も無ければ全国扱いで残す
  const mentionsOther = PREFECTURES.some((p) => !TARGET_PREFS.includes(p) && text.includes(p));
  return !mentionsOther;
}

// RSS/Atom を {title, link, pubDate, description} で詳細抽出（runFeed の parseFeed より項目多め）
function parseRssDetailed(xml: string): { title: string; link: string; pubDate: string; description: string }[] {
  const get = (b: string, tag: string) => {
    const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (!m) return "";
    return htmlToText(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
  };
  const items: { title: string; link: string; pubDate: string; description: string }[] = [];
  let m: RegExpExecArray | null;
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  while ((m = itemRe.exec(xml)) !== null) {
    const b = m[0];
    items.push({
      title: get(b, "title"),
      link: get(b, "link"),
      pubDate: get(b, "pubDate") || get(b, "dc:date") || get(b, "date"),
      description: get(b, "description"),
    });
  }
  if (items.length === 0) {
    const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
    while ((m = entryRe.exec(xml)) !== null) {
      const b = m[0];
      let link = "";
      const lm = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (lm) link = lm[1];
      items.push({
        title: get(b, "title"),
        link,
        pubDate: get(b, "updated") || get(b, "published"),
        description: get(b, "summary") || get(b, "content"),
      });
    }
  }
  return items;
}

// ---------------- 層2: J-Net21（支援情報ヘッドライン RSS の実取得） ----------------
const JNET21_RSS_URL = "https://j-net21.smrj.go.jp/snavi/support/support.xml";
const JNET21_SITE = "https://j-net21.smrj.go.jp/";

/**
 * J-Net21 の RSS を実HTTP取得し、title/link/pubDate/description を抽出して discovered_items に upsert。
 * 取得失敗時はモックを返さず、source_fetch_logs に status/理由を記録して ok:false を返す。
 */
export async function runJnet21(): Promise<CollectSummary> {
  const summary: CollectSummary = { source: "jnet21", ok: true, inserted: 0, updated: 0, scanned: 0 };

  let site: SourceSite | null = null;
  try {
    site = await findOrCreateSourceSite(
      { url: JNET21_SITE },
      {
        name: "J-Net21 支援情報ヘッドライン（中小機構）",
        source_type: "semi_official",
        trust_level: "B",
        url: JNET21_SITE,
        region: "全国",
        priority: "high",
        crawl_frequency: "daily",
        is_active: true,
        last_checked_at: null,
        notes: "中小機構 J-Net21 の公開RSS（support.xml）を購読。出典明記のうえ利用。",
        feed_url: JNET21_RSS_URL,
      }
    );
  } catch {
    /* ログ紐づけ不可でも継続 */
  }

  const fetchedAt = new Date().toISOString();
  const r = await safeFetch(JNET21_RSS_URL, { timeoutMs: 15000 });
  if (!r.ok || !r.text) {
    summary.ok = false;
    summary.error = `J-Net21 RSS取得失敗 HTTP ${r.status}${r.error ? ` (${r.error})` : ""}`;
    if (site) await createSourceFetchLog({ source_site_id: site.id, status: "error", http_status: r.status || null, error_message: summary.error });
    return summary;
  }

  const items = parseRssDetailed(r.text);
  for (const it of items) {
    if (!it.title || !it.link) continue;
    summary.scanned++;
    const text = `${it.title}\n${it.description}`;
    if (!keepForRegion(text)) continue; // 対象地域＋全国のみ
    const normalizedKey = buildNormalizedKey(it.title);
    const confidence = Math.min(100, 40 + (it.link ? 20 : 0) + (it.pubDate ? 20 : 0) + (it.description ? 20 : 0));
    try {
      const { inserted, id } = await upsertDiscoveredByExternal({
        external_id: `jnet21:${it.link}`,
        external_source: "jnet21",
        source_site_id: site?.id ?? null,
        title: it.title.slice(0, 200),
        url: it.link,
        raw_text: [it.title, it.pubDate ? `公開日: ${it.pubDate}` : "", it.description].filter(Boolean).join("\n"),
        raw_html: null,
        pdf_url: null,
        detection_type: "new",
        status: "unreviewed",
        source_category: "semi_official",
        trust_level: "B",
        original_source_url: it.link,
        official_url: it.link,
        official_pdf_url: null,
        official_source_confirmed: false,
        source_warning: null,
        last_verified_at: null,
        verification_status: "needs_review",
        duplicate_of: null,
        normalized_key: normalizedKey,
        audience_type: inferAudience(text) === "unknown" ? "business" : inferAudience(text),
        fetched_at: fetchedAt,
        extraction_confidence: confidence,
      });
      if (inserted) summary.inserted++;
      else summary.updated++;
      await resolveCrossSourceDuplicate(id, normalizedKey, "jnet21");
    } catch {
      /* skip one */
    }
  }

  if (site) {
    await createSourceFetchLog({
      source_site_id: site.id,
      status: "success",
      http_status: r.status,
      detected_count: summary.inserted + summary.updated,
    });
    await supabase.from("source_sites").update({ last_checked_at: fetchedAt }).eq("id", site.id);
  }
  return summary;
}

// ---------------- 層3: ミラサポplus（補助金一覧HTMLの実取得） ----------------
const MIRASAPO_LIST_URL = "https://mirasapo-plus.go.jp/subsidy/";
const MIRASAPO_SITE = "https://mirasapo-plus.go.jp/";
const DATE_RANGE_RE =
  /((?:令和|R)?\s*[0-9０-９]{1,4}\s*[年./-]\s*[0-9０-９]{1,2}\s*[月./-]\s*[0-9０-９]{1,2}\s*日?)/g;

/**
 * ミラサポplus の補助金一覧を実HTTP取得し、補助金名・リンク・日付・公募要領URLを抽出して upsert。
 * 出典「中小企業庁 ミラサポplus」を付与。SPA等で静的HTMLから一覧が取れない場合は、
 * モックを返さず source_fetch_logs に理由を記録し ok:false（抽出0件）を返す。
 */
export async function runMirasapo(): Promise<CollectSummary> {
  const summary: CollectSummary = { source: "mirasapo", ok: true, inserted: 0, updated: 0, scanned: 0 };

  let site: SourceSite | null = null;
  try {
    site = await findOrCreateSourceSite(
      { url: MIRASAPO_SITE },
      {
        name: "ミラサポplus（経産省・中小企業庁／出典表示）",
        source_type: "semi_official",
        trust_level: "B",
        url: MIRASAPO_SITE,
        region: "全国",
        priority: "medium",
        crawl_frequency: "weekly",
        is_active: true,
        last_checked_at: null,
        notes: "ミラサポplus 補助金一覧を実取得。出典『中小企業庁 ミラサポplus』を表示。",
      }
    );
  } catch {
    /* 継続 */
  }

  const fetchedAt = new Date().toISOString();
  const r = await safeFetch(MIRASAPO_LIST_URL, { timeoutMs: 15000 });
  if (!r.ok || !r.text) {
    summary.ok = false;
    summary.error = `ミラサポplus取得失敗 HTTP ${r.status}${r.error ? ` (${r.error})` : ""}`;
    if (site) await createSourceFetchLog({ source_site_id: site.id, status: "error", http_status: r.status || null, error_message: summary.error });
    return summary;
  }

  // 補助金関連リンク＋アンカー近傍の日付を抽出
  const html = r.text;
  const links = extractLinks(html, MIRASAPO_LIST_URL); // 補助金/助成金 等を含むアンカー
  if (links.length === 0) {
    summary.ok = false;
    summary.error = `一覧を抽出できませんでした（HTML ${html.length} 文字。JS描画/構造変更の可能性）`;
    if (site) await createSourceFetchLog({ source_site_id: site.id, status: "success", http_status: r.status, detected_count: 0, error_message: summary.error });
    if (site) await supabase.from("source_sites").update({ last_checked_at: fetchedAt }).eq("id", site.id);
    return summary;
  }

  for (const lk of links) {
    summary.scanned++;
    if (!keepForRegion(lk.text)) continue;
    // リンク周辺テキストから日付（公開日/受付期間）を拾う
    const idx = html.indexOf(lk.href);
    const around = idx >= 0 ? htmlToText(html.slice(Math.max(0, idx - 400), idx + 400)) : lk.text;
    const dates = (around.match(DATE_RANGE_RE) || []).slice(0, 3);
    const isPdf = lk.href.toLowerCase().endsWith(".pdf");
    const normalizedKey = buildNormalizedKey(lk.text);
    const confidence = Math.min(100, 30 + 25 /*url*/ + (dates.length ? 25 : 0) + (isPdf ? 20 : 0));
    try {
      const { inserted, id } = await upsertDiscoveredByExternal({
        external_id: `mirasapo:${lk.href}`,
        external_source: "mirasapo",
        source_site_id: site?.id ?? null,
        title: lk.text.slice(0, 200),
        url: lk.href,
        raw_text: [`出典：中小企業庁『ミラサポplus』`, lk.text, dates.length ? `日付: ${dates.join(" / ")}` : ""].filter(Boolean).join("\n"),
        raw_html: null,
        pdf_url: isPdf ? lk.href : null,
        detection_type: "new",
        status: "unreviewed",
        source_category: "semi_official",
        trust_level: "B",
        original_source_url: MIRASAPO_LIST_URL,
        official_url: lk.href,
        official_pdf_url: isPdf ? lk.href : null,
        official_source_confirmed: false,
        source_warning: null,
        last_verified_at: null,
        verification_status: "needs_review",
        duplicate_of: null,
        normalized_key: normalizedKey,
        audience_type: inferAudience(lk.text) === "unknown" ? "business" : inferAudience(lk.text),
        fetched_at: fetchedAt,
        extraction_confidence: confidence,
      });
      if (inserted) summary.inserted++;
      else summary.updated++;
      await resolveCrossSourceDuplicate(id, normalizedKey, "mirasapo");
    } catch {
      /* skip one */
    }
  }

  if (site) {
    await createSourceFetchLog({
      source_site_id: site.id,
      status: "success",
      http_status: r.status,
      detected_count: summary.inserted + summary.updated,
    });
    await supabase.from("source_sites").update({ last_checked_at: fetchedAt }).eq("id", site.id);
  }
  return summary;
}

/**
 * 全収集をまとめて実行（Jグランツ + J-Net21 + ミラサポplus + アクティブな公式巡回/フィード）。
 * /api/discovery/run と手動「今すぐ全収集」ボタンの両方から呼ぶ。
 */
export async function runAll(): Promise<{ summaries: CollectSummary[]; totals: { inserted: number; updated: number } }> {
  const summaries: CollectSummary[] = [];

  // 1) Jグランツ公開API
  summaries.push(await runJgrantsSync());
  // 2) J-Net21（RSS実取得）
  summaries.push(await runJnet21());
  // 3) ミラサポplus（補助金一覧HTML実取得）
  summaries.push(await runMirasapo());

  // 4) その他のアクティブな情報源（公式ページ巡回 / フィード）
  let sites: SourceSite[] = [];
  try {
    sites = await fetchSourceSites();
  } catch {
    sites = [];
  }
  for (const s of sites) {
    if (!s.is_active) continue;
    const u = s.url ?? "";
    // 専用fetcherで取得済みのソースは除外（二重取得防止）
    if (u.includes("jgrants-portal.go.jp") || u.includes("j-net21.smrj.go.jp") || u.includes("mirasapo-plus.go.jp")) continue;
    if (s.feed_url) summaries.push(await runFeed(s));
    else if (u) summaries.push(await runCrawl(s));
  }

  const totals = summaries.reduce(
    (acc, s) => ({ inserted: acc.inserted + s.inserted, updated: acc.updated + s.updated }),
    { inserted: 0, updated: 0 }
  );
  return { summaries, totals };
}
