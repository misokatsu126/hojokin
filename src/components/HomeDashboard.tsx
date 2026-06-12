"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import {
  loadProjects, syncProjectsFromSupabase, classifyForProject, projectTasks, orderAdvice, getTemplate, templateExamples, PROJECT_TEMPLATE_GROUPS, PROJECT_CHECKLIST, APP_STATUS_LABEL, APP_STATUS_ORDER,
  type SpendingProject, type ProjectMatch, type ProjectTask,
} from "@/lib/projects";

type Row = {
  p: SpendingProject;
  match: ProjectMatch;
  tasks: ProjectTask[];
  preOrderRisk: boolean; // 発注前確認が必要
  orderedRisk: boolean; // すでに発注済み（対象外の恐れ）
  headline: string;
  topTaskKey: string | null;
  tone: "red" | "amber" | "blue" | "green";
  nextActions: string[];
  done: number;
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
    syncProjectsFromSupabase().catch(() => {}); // クラウドと最新化（完了時 projects-changed で反映）
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoaded(true));
    return () => window.removeEventListener("projects-changed", onChange);
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
      const deadlineNear = (match.top?.r.lc.deadlineDays ?? 999) <= 14;
      const rank = orderedRisk || preOrderRisk ? 0 : deadlineNear ? 1 : tasks.length ? 2 : 3;
      return { p, match, tasks, preOrderRisk, orderedRisk, headline, topTaskKey: tasks[0]?.taskKey ?? null, tone, nextActions, done, rank };
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
        text: `「${r.p.name || "（名称未設定）"}」は契約・注文のあとなので、その費用は補助金の対象外になることがあります。別の費用や次回の募集で使えないか確認しましょう。`,
        cta: { href: `/projects/${r.p.id}`, label: "対象外か確認する" },
      };
    }
    const deadlineRow = rows.find((r) => { const d = r.match.top?.r.lc.deadlineDays ?? 999; return d >= 0 && d <= 14; });
    if (deadlineRow) {
      const dd = deadlineRow.match.top?.r.lc.deadlineDays ?? 0;
      return {
        tone: "amber", title: "締切が近い補助金があります",
        text: `「${deadlineRow.p.name || "（名称未設定）"}」に、あと${dd}日でしめ切られる候補があります。まず公式サイトで、締切と「対象になる費用」を確認しましょう。`,
        cta: { href: `/projects/${deadlineRow.p.id}`, label: "締切を確認する" },
      };
    }
    const preRow = rows.find((r) => r.preOrderRisk);
    if (preRow) {
      return {
        tone: "amber", title: `発注の前に確認したい案件が${counts.preOrder}件あります`,
        text: `まず急ぐのは「${preRow.p.name || "（名称未設定）"}」。契約・注文する前に、補助金が使えるか公式サイトで条件を確認しましょう。発注のあとだと対象外になることがあります。`,
        cta: { href: `/projects/${preRow.p.id}`, label: "この補助金チェックを見る" },
      };
    }
    if (allTopTasks.length > 0) {
      const t = allTopTasks[0];
      return {
        tone: "blue", title: `今日やる申請準備が${allTopTasks.length}件あります`,
        text: `支出そのものではなく、補助金を申請するための準備です。まずは「${t.action}」（${t.projectName}）から進めましょう。`,
        cta: { href: `/projects/${t.projectId}?task=${t.taskKey}`, label: "今すぐ進める" },
      };
    }
    return {
      tone: "green", title: "いま急いで対応することはありません",
      text: total > 0 ? "登録した案件は確認が進んでいます。新しい支出が出たら追加して、契約・注文の前に補助金が使えるかチェックしましょう。" : "補助金を使えるか確認したい支出を選んで、チェックを始めましょう。",
      cta: { href: "/projects/new", label: "補助金チェックを追加する" },
    };
  }, [rows, counts, allTopTasks, anyOrdered]);

  // 進行状況の内訳（検討中→入金）
  const statusCounts = useMemo(() => {
    const m: Partial<Record<string, number>> = {};
    for (const r of rows) { const s = r.p.appStatus ?? "considering"; m[s] = (m[s] ?? 0) + 1; }
    return m;
  }, [rows]);

  // ---- 空状態：テンプレート入口 ----
  if (loaded && projects.length === 0) {
    return (
      <div>
        <Title />
        <IntroSteps />
        <div className="rounded-xl border bg-white p-6">
          <p className="mb-1 text-base font-semibold text-ink">まずは、補助金を確認したい支出を選びましょう</p>
          <p className="mb-3 text-sm text-gray-500">ここで選ぶのは「今日やること」ではなく、補助金を使えるか確認したい<strong>支出の内容</strong>です（例：看板を作りたい）。</p>
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
            <Link href="/projects/new" className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">支出を選んで始める</Link>
            <Link href="/projects/new" className="rounded-md border px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50">業種から選ぶ</Link>
            <Link href="/search" className="rounded-md border px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50">相談しながら探す</Link>
            <Link href="/guide" className="rounded-md border px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50">使い方を見る</Link>
          </div>
        </div>
        <FooterLinks />
      </div>
    );
  }

  return (
    <div>
      {/* 1. 今の結論 */}
      <ConclusionBlock c={conclusion} />

      {/* 2. タイトル */}
      <Title />

      {/* 3. サマリーカード */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard n={counts.preOrder} label="発注前確認が必要" tone="red" href="/projects" />
        <SummaryCard n={counts.todo} label="今日やる申請準備" tone="blue" href="/projects" />
        <SummaryCard n={counts.usable} label="使える可能性が高い" tone="green" href="/projects" />
        <SummaryCard n={counts.missed} label="見逃し注意" tone="orange" href="/projects" />
        <SummaryCard n={counts.next} label="次回狙い" tone="purple" href="/projects" />
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

      {/* 4. 今日やること */}
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
                    <span className="mt-0.5 block text-xs text-gray-500">{t.projectName}　／　{t.reason}</span>
                  </span>
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

      {/* 5. メインCTA */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link href="/projects/new" className="rounded-xl bg-accent px-5 py-4 text-center text-base font-semibold text-white hover:opacity-90">＋ 補助金チェックを作る</Link>
        <Link href="/search" className="rounded-xl border-2 border-accent px-5 py-4 text-center text-base font-semibold text-accent hover:bg-accent/5">💬 相談して探す</Link>
      </div>

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
                  <span className="truncate text-sm font-semibold text-ink">{r.p.name || "（名称未設定）"}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{APP_STATUS_LABEL[r.p.appStatus ?? "considering"]}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-gray-500">{r.p.location || r.p.store || ""}{r.match.total > 0 ? `／候補 ${r.match.total}件` : ""}</div>
                <div className={`mt-1 text-xs font-medium ${r.tone === "red" ? "text-red-600" : r.tone === "amber" ? "text-amber-700" : r.tone === "green" ? "text-green-700" : "text-blue-700"}`}>{r.headline}</div>
                <div className="mt-1 text-[11px] text-gray-500">申請準備：{r.done}/{PROJECT_CHECKLIST.length} 完了{r.tasks[0] ? `　次：${r.tasks[0].action}` : ""}</div>
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

function Title() {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">あなたの補助金チェック</h1>
        <Link href="/guide" className="shrink-0 rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">❓ はじめての方へ（使い方）</Link>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        これからの支出に使える補助金がないかを確認するツールです。補助金の多くは契約・注文の前に申請が必要なので、発注の前にチェックしましょう。
      </p>
    </div>
  );
}

// 初めての人向け：このツールは何か・まず何をするか（空状態の先頭に置く）
function IntroSteps() {
  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <p className="text-sm font-bold text-sky-900">このツールでできること</p>
      <p className="mt-1 text-xs leading-relaxed text-sky-800">
        お店や会社の「これからの支出」に、使える補助金がないかを判定します。大事なのは順番。多くの補助金は<strong>契約・注文する前</strong>に申請が必要だからです。
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          { n: "1", t: "支出を登録", b: "例：看板を作りたい／空調を入れ替えたい" },
          { n: "2", t: "補助金と注意がわかる", b: "使える可能性のある制度と、発注前の注意" },
          { n: "3", t: "やることが出る", b: "見積・公式サイトの確認など、今日やる準備" },
        ].map((s) => (
          <div key={s.n} className="rounded-lg border border-sky-100 bg-white p-2.5">
            <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">{s.n}</div>
            <p className="mt-1 text-xs font-bold text-ink">{s.t}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">{s.b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ n, label, tone, href }: { n: number; label: string; tone: string; href: string }) {
  const map: Record<string, string> = {
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-green-200 bg-green-50 text-green-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    purple: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <Link href={href} className={`rounded-lg border p-3 text-center transition hover:shadow-sm ${map[tone]}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="mt-0.5 text-[11px] font-medium text-gray-600">{label}</div>
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
