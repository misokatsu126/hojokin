"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import { OwnerSwitcher } from "@/components/OwnerSwitcher";
import { nextManualDeadline } from "@/lib/caseRecords";
import {
  loadProjects, syncProjectsFromSupabase, classifyForProject, projectTasks, orderAdvice, getTemplate, templateExamples, PROJECT_TEMPLATE_GROUPS, PROJECT_CHECKLIST, APP_STATUS_LABEL, APP_STATUS_ORDER,
  type SpendingProject, type ProjectMatch, type ProjectTask,
} from "@/lib/projects";

type Row = {
  p: SpendingProject;
  match: ProjectMatch;
  tasks: ProjectTask[];
  tplLabel: string;
  preOrderRisk: boolean; // 発注前確認が必要
  orderedRisk: boolean; // すでに発注済み（対象外の恐れ）
  headline: string;
  topTaskKey: string | null;
  tone: "red" | "amber" | "blue" | "green";
  nextActions: string[];
  done: number;
  manualDl: { label: string; days: number } | null;
  rank: number; // 並び順（小さいほど上）
};

type Conclusion = {
  tone: "red" | "amber" | "blue" | "green";
  title: string;
  text: string;
  cta: { href: string; label: string };
};

export function HomeDashboard() {
  const [projects, setProjects] = useState<SpendingProject[]>([]);
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProjects(loadProjects());
    const onChange = () => setProjects(loadProjects());
    window.addEventListener("projects-changed", onChange);
    window.addEventListener("case-records-changed", onChange); // 期限の手入力をホームに反映
    syncProjectsFromSupabase().catch(() => {}); // クラウドと最新化（完了時 projects-changed で反映）
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoaded(true));
    return () => { window.removeEventListener("projects-changed", onChange); window.removeEventListener("case-records-changed", onChange); };
  }, []);

  const rows: Row[] = useMemo(() => {
    return projects.map((p) => {
      const match = classifyForProject(p, items);
      const adv = orderAdvice(p.orderStatus);
      const tasks = projectTasks(p, match);
      // 交付決定後の発注は正常なので「対象外リスク」とはしない
      const postApproval = ["approved", "implementing", "reported", "received"].includes(p.appStatus ?? "");
      const applied = p.appStatus === "applied";
      const orderedRisk = !postApproval && !applied && (p.orderStatus === "contract" || p.orderStatus === "ordered" || p.orderStatus === "paid");
      const preOrderRisk = !postApproval && !applied && adv.wait && !p.checklist?.["pre_order"];
      let headline: string;
      let tone: Row["tone"];
      // 進行ステータスを優先して headline を決める
      if (p.appStatus === "received") { headline = "入金まで完了しています"; tone = "green"; }
      else if (p.appStatus === "reported") { headline = "入金待ち：書類を保管しましょう"; tone = "blue"; }
      else if (p.appStatus === "approved" || p.appStatus === "implementing") { headline = "交付決定済み：実施と実績報告を進めましょう"; tone = "blue"; }
      else if (applied) { headline = "申請済み：交付決定を待ちましょう（発注はまだ）"; tone = "amber"; }
      else if (orderedRisk) { headline = "この費用は対象外になるかもしれません"; tone = "red"; }
      else if (tasks[0]?.taskKey === "pre_order") {
        headline = p.orderStatus === "estimate" ? "見積だけならまだ間に合う可能性があります" : "発注前に公式要領を確認してください";
        tone = "amber";
      }
      else if (tasks[0]) { headline = tasks[0].action; tone = "blue"; }
      else if (match.top?.r.key === "usable") { headline = "公式ページで最終確認しましょう"; tone = "green"; }
      else { headline = "公式ページで確認しましょう"; tone = "blue"; }
      const tpl = getTemplate(p.templateKey);
      // 「次にやること」は実際の未完了タスクから作る（チェック完了で消える）。0件のときだけテンプレ補助
      const nextActions = tasks.length ? tasks.map((t) => t.action).slice(0, 3) : (tpl?.nextActions ?? ["公式ページで確認"]).slice(0, 3);
      const done = PROJECT_CHECKLIST.filter((c) => p.checklist?.[c.key]).length;
      const md = nextManualDeadline(p.id);
      const manualDl = md && md.days <= 30 ? { label: md.label, days: md.days } : null;
      const deadlineNear = (match.top?.r.lc.deadlineDays ?? 999) <= 14;
      const rank = orderedRisk ? 0 : (manualDl && manualDl.days <= 14) ? 0.5 : preOrderRisk ? 1 : deadlineNear ? 1.5 : tasks.length ? 2 : 3;
      return { p, match, tasks, tplLabel: tpl?.label ?? "", preOrderRisk, orderedRisk, headline, topTaskKey: tasks[0]?.taskKey ?? null, tone, nextActions, done, manualDl, rank };
    }).sort((a, b) => a.rank - b.rank);
  }, [projects, items]);

  const counts = useMemo(() => {
    let preOrder = 0, todo = 0, usable = 0, missed = 0, next = 0;
    for (const r of rows) {
      if (r.preOrderRisk) preOrder++;
      todo += projectTasks(r.p, r.match).length;
      if ((r.match.grouped.get("usable")?.length ?? 0) > 0) usable++;
      if (r.match.missRisk === "高" || (r.match.grouped.get("missed")?.length ?? 0) > 0) missed++;
      if ((r.match.grouped.get("next_time")?.length ?? 0) > 0) next++;
    }
    return { preOrder, todo, usable, missed, next };
  }, [rows]);

  const anyOrdered = rows.some((r) => r.orderedRisk);
  // 今日やること＝全案件の申請準備タスクを優先度順（支出テーマは含めない）
  const allTopTasks = useMemo(
    () => rows.flatMap((r) => r.tasks).sort((a, b) => a.priority - b.priority),
    [rows]
  );
  const [showAllTasks, setShowAllTasks] = useState(false);
  const topTasks = showAllTasks ? allTopTasks.slice(0, 12) : allTopTasks.slice(0, 3);

  // 今の結論：案件数・発注状況・今日やる申請準備・締切リスクから1つの結論を作る
  const conclusion = useMemo<Conclusion>(() => {
    const total = rows.length;
    if (anyOrdered) {
      const r = rows.find((x) => x.orderedRisk)!;
      return {
        tone: "red", title: "発注後の案件があります（要注意）",
        text: `「${r.p.name || r.tplLabel || "支出案件"}」は契約・注文のあとなので、その費用は補助金の対象外になることがあります。別の費用や次回の募集で使えないか確認しましょう。`,
        cta: { href: `/projects/${r.p.id}`, label: "対象案件を確認する" },
      };
    }
    const mdRow = rows.find((r) => r.manualDl && r.manualDl.days <= 14);
    if (mdRow) {
      const m = mdRow.manualDl!;
      return {
        tone: "amber", title: `期限が近い案件があります（${m.label}：あと${m.days}日）`,
        text: `「${mdRow.p.name || mdRow.tplLabel || "支出案件"}」の${m.label}が近づいています。公募締切より先に来ることがあるので、早めに進めましょう。`,
        cta: { href: `/projects/${mdRow.p.id}`, label: "急ぎの案件を確認する" },
      };
    }
    const deadlineRow = rows.find((r) => { const d = r.match.top?.r.lc.deadlineDays ?? 999; return d >= 0 && d <= 14; });
    if (deadlineRow) {
      const dd = deadlineRow.match.top?.r.lc.deadlineDays ?? 0;
      return {
        tone: "amber", title: "締切が近い補助金があります",
        text: `「${deadlineRow.p.name || deadlineRow.tplLabel || "支出案件"}」に、あと${dd}日でしめ切られる候補があります。まず公式サイトで、締切と「対象になる費用」を確認しましょう。`,
        cta: { href: `/projects/${deadlineRow.p.id}`, label: "急ぎの案件を確認する" },
      };
    }
    const preRow = rows.find((r) => r.preOrderRisk);
    if (preRow) {
      return {
        tone: "amber", title: `発注の前に確認したい案件が${counts.preOrder}件あります`,
        text: `まず急ぐのは「${preRow.p.name || preRow.tplLabel || "優先度の高い支出案件"}」。契約・注文する前に、補助金が使えるか公式サイトで条件を確認しましょう。発注のあとだと対象外になることがあります。`,
        cta: { href: `/projects/${preRow.p.id}`, label: "発注前確認を進める" },
      };
    }
    if (allTopTasks.length > 0) {
      const t = allTopTasks[0];
      return {
        tone: "blue", title: `今日やる申請準備が${allTopTasks.length}件あります`,
        text: `支出そのものではなく、補助金を申請するための準備です。まずは「${t.action}」（${t.projectName}）から進めましょう。`,
        cta: { href: `/projects/${t.projectId}?task=${t.taskKey}`, label: "今日の準備を見る" },
      };
    }
    return {
      tone: "green", title: "いま急いで対応することはありません",
      text: total > 0 ? "登録した案件は確認が進んでいます。新しい支出が出たら追加して、契約・注文の前に補助金が使えるかチェックしましょう。" : "補助金を使えるか確認したい支出を選んで、チェックを始めましょう。",
      cta: { href: "/projects/new", label: "支出を登録する" },
    };
  }, [rows, counts, allTopTasks, anyOrdered]);

  // 進行状況の内訳（検討中→入金）
  const statusCounts = useMemo(() => {
    const m: Partial<Record<string, number>> = {};
    for (const r of rows) { const s = r.p.appStatus ?? "considering"; m[s] = (m[s] ?? 0) + 1; }
    return m;
  }, [rows]);

  // ---- 空状態：支出テーマ入口 ----
  if (loaded && projects.length === 0) {
    return (
      <div>
        <OwnerSwitcher compact />
        <Hero />
        <div className="mb-6 rounded-xl border bg-white p-5 sm:p-6">
          <p className="text-lg font-bold text-ink">まずは、これから使うお金を選びましょう</p>
          <p className="mt-1 mb-4 text-sm text-gray-600">補助金名を知らなくても大丈夫です。空調・看板・広告・EC・AI・採用など、<strong>支出テーマ</strong>から補助金チェックを始められます。</p>
          <div className="space-y-3">
            {PROJECT_TEMPLATE_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="mb-1 text-xs font-semibold text-gray-600">{g.title}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {g.keys.map((k) => getTemplate(k)).filter(Boolean).map((t) => (
                    <Link key={t!.key} href={`/projects/new?template=${t!.key}`} className="rounded-lg border p-3 text-left text-sm transition hover:border-accent hover:shadow-sm">
                      <div className="font-medium text-ink">{t!.label}</div>
                      {templateExamples(t!.key).length > 0 && <div className="mt-0.5 text-[10px] leading-snug text-gray-400">例：{templateExamples(t!.key).slice(0, 2).join("／")}</div>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/projects/new" className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">支出テーマを選ぶ</Link>
            <Link href="/projects/new" className="rounded-md border px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50">業種から選ぶ</Link>
            <Link href="/search" className="rounded-md border px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50">相談しながら探す</Link>
          </div>
          <p className="mt-3 text-[11px] text-gray-400">ここで選ぶのは「今日やること」ではなく、補助金を確認したい支出内容です。</p>
        </div>
        <AiPromoCard />
        <div className="mb-6 rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-ink">使い方が知りたいときは</p>
          <p className="mt-0.5 text-xs text-gray-600">3ステップの流れと、補助金の基本（後払い・発注前確認など）を確認できます。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/start" className="rounded-md border border-accent/40 bg-accent/5 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10">▶ スタートナビ</Link>
            <Link href="/guide" className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">❓ 使い方ガイド</Link>
          </div>
        </div>
        <FooterLinks />
      </div>
    );
  }

  return (
    <div>
      <OwnerSwitcher compact />

      {/* 1. ヒーロー */}
      <Hero />

      {/* 2. 今の結論 */}
      <ConclusionBlock c={conclusion} />

      {/* 3. 今日やる申請準備（最大3件・タスク単位） */}
      <div className="mb-6">
        <h2 className="text-base font-bold text-ink">📋 今日やる申請準備</h2>
        <p className="mb-2 text-xs text-gray-500">支出内容ではなく、補助金申請のために先に確認することです。</p>
        {topTasks.length === 0 ? (
          <p className="rounded-lg border bg-white p-4 text-sm text-gray-500">いま確認することはありません。新しい補助金チェックを作って確認しましょう。</p>
        ) : (
          <ol className="space-y-2">
            {topTasks.map((t, i) => (
              <li key={`${t.projectId}:${t.taskKey}`}>
                <Link href={`/projects/${t.projectId}?task=${t.taskKey}`} className="flex items-start gap-3 rounded-xl border-l-4 border-blue-400 bg-white p-3 transition hover:shadow-sm">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{t.action}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">案件：{t.projectName}　／　{t.reason}</span>
                  </span>
                  <span className="mt-0.5 shrink-0 self-center rounded-md bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">進める</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        {allTopTasks.length > 3 && (
          <button onClick={() => setShowAllTasks((v) => !v)} className="mt-2 text-xs text-accent hover:underline">
            {showAllTasks ? "閉じる" : `もっと見る（あと${allTopTasks.length - 3}件）`}
          </button>
        )}
      </div>

      {/* 4. 行動ベースのサマリーカード */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard n={counts.preOrder} label="発注前確認" sub="契約・注文の前に確認が必要" tone="red" href="/projects" />
        <SummaryCard n={counts.todo} label="今日やる申請準備" sub="今すぐ進める確認タスク" tone="blue" href="/projects" />
        <SummaryCard n={rows.length} label="AIに相談できる" sub="AIに貼る文章を作れます" tone="violet" href="/projects" />
        <SummaryCard n={counts.missed} label="見逃し注意" sub="複数制度に関係する可能性" tone="orange" href="/projects" />
        <SummaryCard n={counts.next} label="次回狙い" sub="今回は難しくても次に備える" tone="purple" href="/projects" />
      </div>

      {/* 進行状況の内訳 */}
      {rows.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-500">進行状況：</span>
          {APP_STATUS_ORDER.filter((s) => (statusCounts[s] ?? 0) > 0).map((s) => (
            <Link key={s} href="/projects" className="rounded-full border bg-white px-2.5 py-1 text-[11px] text-gray-600 hover:border-accent">
              {APP_STATUS_LABEL[s]} <span className="font-bold text-ink">{statusCounts[s]}</span>
            </Link>
          ))}
        </div>
      )}

      {/* 5. 自分のAIに相談する紹介 */}
      <AiPromoCard />

      {/* 6. 進行中の補助金チェック */}
      {rows.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">進行中の補助金チェック</h2>
            <Link href="/projects" className="text-xs text-accent hover:underline">すべて見る →</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.slice(0, 3).map((r) => (
              <Link key={r.p.id} href={`/projects/${r.p.id}`} className="rounded-lg border bg-white p-3 transition hover:border-accent">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">{r.p.name || r.tplLabel || "支出案件"}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{APP_STATUS_LABEL[r.p.appStatus ?? "considering"]}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-gray-500">{r.p.location || r.p.store || ""}{r.match.total > 0 ? `／候補 ${r.match.total}件` : ""}</div>
                <div className={`mt-1 text-xs font-medium ${r.tone === "red" ? "text-red-600" : r.tone === "amber" ? "text-amber-700" : r.tone === "green" ? "text-green-700" : "text-blue-700"}`}>{r.headline}</div>
                <div className="mt-1 text-[11px] text-gray-500">申請準備：{r.done}/{PROJECT_CHECKLIST.length} 完了{r.tasks[0] ? `　次：${r.tasks[0].action}` : ""}</div>
                <div className="mt-1 text-[11px] text-violet-600">🤖 この案件を自分のAIに相談する →</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <FooterLinks />
    </div>
  );
}

function ConclusionBlock({ c }: { c: Conclusion }) {
  const map: Record<Conclusion["tone"], string> = {
    red: "border-red-300 bg-red-50 text-red-800",
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    blue: "border-sky-300 bg-sky-50 text-sky-900",
    green: "border-green-300 bg-green-50 text-green-800",
  };
  const btn: Record<Conclusion["tone"], string> = {
    red: "bg-red-600 hover:bg-red-700",
    amber: "bg-amber-600 hover:bg-amber-700",
    blue: "bg-sky-600 hover:bg-sky-700",
    green: "bg-green-600 hover:bg-green-700",
  };
  return (
    <div className={`mb-5 rounded-xl border-2 p-4 ${map[c.tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">今の結論</p>
      <p className="mt-0.5 text-base font-bold">{c.title}</p>
      <p className="mt-1 text-sm leading-relaxed">{c.text}</p>
      <Link href={c.cta.href} className={`mt-3 inline-block rounded-md px-4 py-2 text-sm font-semibold text-white ${btn[c.tone]}`}>
        {c.cta.label} →
      </Link>
    </div>
  );
}

// トップのヒーロー：このサイトが何かと、最初に押す場所を明確にする
function Hero() {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border bg-gradient-to-br from-violet-50 via-sky-50 to-emerald-50 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-5 sm:items-center">
        <div className="sm:col-span-3">
          <h1 className="text-2xl font-bold leading-tight text-ink sm:text-3xl">発注前に、補助金の見逃しを防ぐ</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            これから使うお金に、補助金が使える可能性があるかをチェックします。発注前の注意・今日やる申請準備・まず確認すべき定番制度を整理します。
          </p>
          <p className="mt-1.5 text-xs font-medium text-violet-700">🤖 ChatGPT・Claude・Geminiに貼って相談できる文章も作れます。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/projects/new" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90">支出を登録してチェックする</Link>
            <Link href="/start" className="rounded-lg border border-accent/40 bg-white px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/5">▶ スタートナビ</Link>
            <Link href="/guide" className="rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">使い方を見る</Link>
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="grid gap-2">
            {[
              { n: "1", t: "支出を登録", b: "例：空調・看板・広告・EC・AI・採用" },
              { n: "2", t: "補助金と注意がわかる", b: "使える可能性のある制度と発注前の注意" },
              { n: "3", t: "今日やる準備が出る", b: "見積・公式確認など、進めることが分かる" },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-2 rounded-lg border border-white/70 bg-white/70 p-2.5 backdrop-blur">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{s.n}</span>
                <span>
                  <span className="block text-xs font-bold text-ink">{s.t}</span>
                  <span className="block text-[11px] leading-snug text-gray-600">{s.b}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// トップで「自分のAIに相談する」を軽く紹介（主戦場は案件詳細）
function AiPromoCard() {
  return (
    <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <h2 className="text-base font-bold text-violet-900">🤖 自分のAIに相談する文章も作れます</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-700">
        案件情報を整理して、ChatGPT・Claude・Geminiにそのまま貼れる相談文を作ります。公募要領の読み取り、見積書チェック、申請書メモ作成にも使えます。
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["補助金についてAIに聞く", "公式要領を読ませる", "見積書をチェックしてもらう"].map((c) => (
          <span key={c} className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] text-violet-700">{c}</span>
        ))}
      </div>
      <Link href="/projects" className="mt-3 inline-block rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90">案件詳細でAI相談文を作る →</Link>
      <p className="mt-1.5 text-[10px] text-gray-400">AIの回答は申請可否を保証しません。最終判断は公式要領・窓口・専門家に確認してください。</p>
    </div>
  );
}

function SummaryCard({ n, label, sub, tone, href }: { n: number; label: string; sub: string; tone: string; href: string }) {
  const map: Record<string, string> = {
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-green-200 bg-green-50 text-green-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <Link href={href} className={`rounded-lg border p-3 transition hover:shadow-sm ${map[tone]}`}>
      <div className="text-2xl font-bold leading-none">{n}</div>
      <div className="mt-1 text-xs font-semibold text-ink">{label}</div>
      <div className="mt-0.5 text-[10px] leading-snug text-gray-500">{sub}</div>
    </Link>
  );
}

function FooterLinks() {
  return (
    <div className="mt-8 border-t pt-4">
      <p className="mb-2 text-xs text-gray-400">補助金そのものを見る</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/calendar" className="rounded-md border px-3 py-1.5 text-gray-600 hover:bg-gray-50">🗓 締切カレンダー</Link>
        <Link href="/new-and-standard" className="rounded-md border px-3 py-1.5 text-gray-600 hover:bg-gray-50">🆕 新着・定番</Link>
        <Link href="/discovery" className="rounded-md border px-3 py-1.5 text-gray-600 hover:bg-gray-50">🛠 管理者画面</Link>
      </div>
    </div>
  );
}
