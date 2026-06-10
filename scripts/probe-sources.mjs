// scripts/probe-sources.mjs
// 対象の外部URLを実際に HTTP 取得し、ステータス/Content-Type/本文長/抽出件数を表示する。
// 使い方: node scripts/probe-sources.mjs  （npm run probe:sources）
// ※ ネットワーク制限環境では到達できない場合があるが、その場合も理由をそのまま表示する。

const TARGETS = [
  { name: "J-Net21 snavi2 (HTML)", url: "https://j-net21.smrj.go.jp/snavi2/index.html", kind: "html" },
  { name: "J-Net21 support RSS/XML", url: "https://j-net21.smrj.go.jp/snavi/support/support.xml", kind: "xml" },
  { name: "ミラサポplus top (HTML)", url: "https://mirasapo-plus.go.jp/", kind: "html" },
  { name: "ミラサポplus 補助金一覧 (HTML)", url: "https://mirasapo-plus.go.jp/subsidy/", kind: "html" },
];

const UA = "HojokinRadar/1.0 (+source probe; contact: tool admin)";

function stripTags(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRss(xml) {
  const items = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[0];
    items.push({
      title: pick(b, "title"),
      link: pick(b, "link"),
      pubDate: pick(b, "pubDate") || pick(b, "dc:date"),
      description: pick(b, "description"),
    });
  }
  if (items.length === 0) {
    const re2 = /<entry\b[\s\S]*?<\/entry>/gi;
    while ((m = re2.exec(xml)) !== null) {
      const b = m[0];
      let link = "";
      const lm = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (lm) link = lm[1];
      items.push({ title: pick(b, "title"), link, pubDate: pick(b, "updated") || pick(b, "published"), description: pick(b, "summary") });
    }
  }
  return items;
}

async function probe(t) {
  const started = Date.now();
  const out = { ...t, status: 0, contentType: "", length: 0, ms: 0, error: null, items: 0, sample: [] };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(t.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    clearTimeout(timer);
    out.status = res.status;
    out.contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    out.length = body.length;
    out.ms = Date.now() - started;
    if (t.kind === "xml" || /xml|rss/i.test(out.contentType) || body.trimStart().startsWith("<?xml")) {
      const items = parseRss(body);
      out.items = items.length;
      out.sample = items.slice(0, 3).map((i) => ({ title: i.title?.slice(0, 60), link: i.link, pubDate: i.pubDate }));
    } else {
      out.sample = [stripTags(body).slice(0, 160)];
    }
  } catch (e) {
    out.error = e?.name === "AbortError" ? "timeout(15s)" : String(e?.message || e);
    out.ms = Date.now() - started;
  }
  return out;
}

async function main() {
  console.log("=== probe-sources: 実HTTP取得 ===");
  console.log("時刻:", new Date().toISOString());
  for (const t of TARGETS) {
    const r = await probe(t);
    console.log("\n----------------------------------------");
    console.log(`■ ${r.name}`);
    console.log(`  URL        : ${r.url}`);
    console.log(`  HTTP status: ${r.status}`);
    console.log(`  Content-Type: ${r.contentType}`);
    console.log(`  本文長(chars): ${r.length}`);
    console.log(`  所要(ms)   : ${r.ms}`);
    if (r.error) console.log(`  エラー     : ${r.error}`);
    if (r.items) console.log(`  RSS抽出件数: ${r.items}`);
    if (r.sample?.length) console.log(`  サンプル   : ${JSON.stringify(r.sample, null, 2)}`);
  }
  console.log("\n=== 完了 ===");
}

main();
