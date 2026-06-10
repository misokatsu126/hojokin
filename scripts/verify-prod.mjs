// scripts/verify-prod.mjs
// 本番Vercel（または制限のないローカル）で実データ取得を検証するワンショット・コマンド。
// 使い方:
//   BASE_URL=https://<your-app>.vercel.app npm run verify:prod
//   もしくは: node scripts/verify-prod.mjs https://<your-app>.vercel.app
// 実施内容:
//   1. {BASE}/api/discovery/jnet21/sync を実行（POST）
//   2. {BASE}/api/discovery/mirasapo/sync を実行（POST）
//   3. 生の対象URL（J-Net21 RSS / ミラサポplus 一覧）を直接実HTTP取得し、文字数・件数・失敗種別を分類
//   4. robots.txt を確認
//   5. Supabase REST で source_fetch_logs と discovered_items(jnet21/mirasapo) を照会しサンプル表示
// .env.local の NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を使用（Supabase照会用）。

import { readFileSync } from "node:fs";

function loadEnv() {
  for (const p of [`${process.cwd()}/.env.local`]) {
    try {
      const txt = readFileSync(p, "utf8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
}
loadEnv();

const BASE = (process.argv[2] || process.env.BASE_URL || "").replace(/\/+$/, "");
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const UA = "HojokinRadar/1.0 (+prod verify; contact: tool admin)";

const RAW = {
  jnet21: "https://j-net21.smrj.go.jp/snavi/support/support.xml",
  mirasapo: "https://mirasapo-plus.go.jp/subsidy/",
};

async function httpGet(url, opt = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opt.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, {
      method: opt.method || "GET",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "*/*", ...(opt.headers || {}) },
    });
    clearTimeout(t);
    const body = await res.text();
    return { ok: res.ok, status: res.status, contentType: res.headers.get("content-type") || "", body };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, status: 0, error: e?.name === "AbortError" ? "timeout" : String(e?.message || e) };
  }
}

function countRss(xml) {
  return (xml.match(/<item\b/gi) || []).length || (xml.match(/<entry\b/gi) || []).length;
}
function countSubsidyAnchors(html) {
  const re = /<a\b[^>]*href=["'][^"'#]+["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m, n = 0;
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length >= 4 && /(補助金|助成金|給付金|支援金|補助|助成)/.test(text)) n++;
  }
  return n;
}

// 失敗種別の分類
function classify(res, kind) {
  if (!res) return "不明";
  if (res.error === "timeout") return "timeout";
  if (res.error) return `通信エラー(${res.error})`;
  if (res.status === 0) return "到達不可";
  if (res.status === 403) {
    if (/host not in allowlist/i.test(res.body || "")) return "403（このネットワークのegress許可リスト遮断＝本番では別結果の可能性）";
    if (/robot|disallow/i.test(res.body || "")) return "403（robots/クローラ拒否の可能性）";
    return "403（User-Agent拒否 / IP拒否 / WAF の可能性）";
  }
  if (res.status === 404) return "404（URL誤り/移転）";
  if (res.status >= 500) return `サーバエラー(${res.status})`;
  if (res.status === 200) {
    const n = kind === "rss" ? countRss(res.body || "") : countSubsidyAnchors(res.body || "");
    if (n === 0) return "200だが抽出0件（HTML/RSS構造不一致 or SPA(JS描画)）";
    return `成功（抽出可能 ${n} 件相当）`;
  }
  return `HTTP ${res.status}`;
}

async function supaGet(path) {
  if (!SUPA_URL || !SUPA_KEY) return { error: "Supabase未設定" };
  const r = await httpGet(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!r.ok) return { error: `HTTP ${r.status} ${r.error || ""}` };
  try { return { data: JSON.parse(r.body) }; } catch { return { error: "JSON parse" }; }
}

async function main() {
  console.log("=== verify-prod: 本番実データ検証 ===", new Date().toISOString());
  console.log("BASE_URL:", BASE || "(未指定)");

  // 1-2. 本番エンドポイント実行
  if (BASE) {
    for (const ep of ["jnet21", "mirasapo"]) {
      const url = `${BASE}/api/discovery/${ep}/sync`;
      const r = await httpGet(url, { method: "POST", timeoutMs: 60000 });
      console.log(`\n■ POST ${url}`);
      console.log(`  HTTP: ${r.status}  本文長: ${r.body?.length ?? 0}`);
      console.log(`  応答: ${(r.body || r.error || "").slice(0, 400)}`);
    }
  } else {
    console.log("\n(注) BASE_URL 未指定のため本番エンドポイント実行はスキップ。引数か BASE_URL で指定してください。");
  }

  // 3. 生URL直接取得＋分類
  for (const [name, url] of Object.entries(RAW)) {
    const r = await httpGet(url, { timeoutMs: 15000 });
    const kind = name === "jnet21" ? "rss" : "html";
    console.log(`\n■ 生URL GET ${url}`);
    console.log(`  HTTP: ${r.status}  Content-Type: ${r.contentType || "-"}  取得文字数: ${r.body?.length ?? 0}`);
    if (r.body) console.log(`  抽出件数(目安): ${kind === "rss" ? countRss(r.body) : countSubsidyAnchors(r.body)}`);
    console.log(`  失敗種別/判定: ${classify(r, kind)}`);
    // 4. robots.txt
    try {
      const u = new URL(url);
      const rob = await httpGet(`${u.origin}/robots.txt`, { timeoutMs: 10000 });
      const disallow = (rob.body || "").split("\n").filter((l) => /^disallow/i.test(l.trim())).slice(0, 8);
      console.log(`  robots.txt: HTTP ${rob.status}${disallow.length ? " / Disallow:\n    " + disallow.join("\n    ") : " / Disallow行なし(または取得不可)"}`);
    } catch {}
  }

  // 5. Supabase 確認
  console.log("\n■ Supabase source_fetch_logs（最新10件）");
  const logs = await supaGet("source_fetch_logs?select=fetched_at,status,http_status,detected_count,error_message&order=fetched_at.desc&limit=10");
  if (logs.error) console.log("  取得不可:", logs.error);
  else for (const l of logs.data) console.log(`  ${l.fetched_at} | ${l.status} | http=${l.http_status ?? "-"} | 検知=${l.detected_count} | ${l.error_message ?? ""}`);

  console.log("\n■ discovered_items（jnet21/mirasapo 由来の件数とサンプル1件）");
  const cnt = await supaGet("discovered_items?select=id&external_source=in.(jnet21,mirasapo)");
  if (cnt.error) console.log("  件数取得不可:", cnt.error);
  else console.log(`  保存件数: ${cnt.data.length}`);
  const sample = await supaGet("discovered_items?select=title,external_source,url,official_url,fetched_at,extraction_confidence,status&external_source=in.(jnet21,mirasapo)&order=detected_at.desc&limit=1");
  if (sample.error) console.log("  サンプル取得不可:", sample.error);
  else if (sample.data.length === 0) console.log("  サンプル: 0件（J-Net21/ミラサポ由来の保存なし）");
  else {
    const s = sample.data[0];
    console.log("  サンプル:", JSON.stringify(s, null, 2));
    console.log("  「本物を見る」で開けるURL:", s.official_url || s.url || "(なし)");
  }

  console.log("\n=== 完了 ===");
}

main();
