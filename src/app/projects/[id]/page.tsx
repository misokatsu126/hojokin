"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchDiscoveredItems } from "@/lib/supabase";
import type { DiscoveredItem } from "@/lib/types";
import {
  getProject, upsertProject, deleteProject, classifyForProject, orderAdvice,
  ORDER_STATUS_LABEL, PROJECT_CHECKLIST, type SpendingProject,
} from "@/lib/projects";
import { TRIAGE_META, TRIAGE_ORDER, type TriageKey, type TriageResult } from "@/lib/triage";
import { formatAmount, formatDate, daysUntil } from "@/lib/utils";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<SpendingProject | null>(null);
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const p = getProject(id);
    if (!p) { setNotFound(true); setLoading(false); return; }
    setProject(p);
    fetchDiscoveredItems().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, [id]);

  const match = useMemo(() => (project ? classifyForProject(project, items) : null), [project, items]);

  function toggleCheck(key: string) {
    if (!project) return;
    const next = { ...project, checklist: { ...project.checklist, [key]: !project.checklist[key] } };
    setProject(upsertProject(next));
  }
  function remove() {
    if (!project) return;
    if (!confirm("この支出案件を削除しますか？")) return;
    deleteProject(project.id);
    router.push("/projects");
  }

  if (notFound) return (
    <div className="py-12 text-center text-gray-500">
      <p className="mb-3">支出案件が見つかりませんでした。</p>
      <Link href="/projects" className="text-accent hover:underline">支出案件の一覧へ</Link>
    </div>
  );
  if (!project) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  const adv = orderAdvice(project.orderStatus);
  const doneCount = PROJECT_CHECKLIST.filter((c) => project.checklist[c.key]).length;

  return (
    <div>
      <div className="mb-2 text-xs text-gray-400"><Link href="/projects" className="hover:underline">支出案件</Link> ／ 詳細</div>

      {/* ヘッダー */}
      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-ink">{project.name}</h1>
          <div className="flex gap-2">
            <Link href={`/projects/new?name=${encodeURIComponent(project.name)}`} className="hidden" />
            <button onClick={remove} className="rounded-md border px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">削除</button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {project.store && <span>🏬{project.store}</span>}
          {project.location && <span>📍{project.location}</span>}
          {project.entity && <span>🏢{project.entity}</span>}
          {project.industry && <span>{project.industry}</span>}
          {project.employees != null && <span>👥{project.employees}人</span>}
          {project.budget != null && <span>💰{formatAmount(project.budget)}</span>}
          {project.schedule && <span>🗓{project.schedule}</span>}
          <span>発注状況：{ORDER_STATUS_LABEL[project.orderStatus]}</span>
        </div>
        {project.memo && <p className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm text-gray-600">{project.memo}</p>}
      </div>

      {/* 発注してよいか / 待つべきか */}
      <div className={`mt-4 rounded-lg border-2 p-4 ${adv.tone}`}>
        <p className="text-sm font-bold">{adv.wait ? "🟢" : "⚠️"} {adv.title}</p>
        <p className="mt-1 text-xs leading-relaxed">{adv.text}</p>
      </div>

      {/* この支出で使えそうな補助金 */}
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold text-ink">この支出で使えそうな補助金</h2>
        {loading ? (
          <p className="rounded-lg border bg-white p-5 text-sm text-gray-400">補助金候補を読み込み中…</p>
        ) : !match || match.total === 0 ? (
          <div className="rounded-lg border bg-white p-5 text-sm text-gray-600">
            <p className="font-semibold text-ink">この支出に強く一致する補助金は、まだ見つかっていません。</p>
            <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed">
              <li>案件に「所在地・業種・用途」を足すと、見つかりやすくなります。</li>
              <li>一般的な定番補助金（IT導入・持続化・ものづくり等）も確認する価値があります。</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/search" className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90">相談して探す</Link>
              <Link href="/new-and-standard" className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">定番補助金を見る</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {TRIAGE_ORDER.filter((k) => (match.grouped.get(k)?.length ?? 0) > 0).map((k) => (
              <div key={k}>
                <h3 className="mb-2 text-sm font-bold text-ink">{TRIAGE_META[k].icon} {TRIAGE_META[k].label}（{match.grouped.get(k)!.length}件）</h3>
                <div className="space-y-2">
                  {match.grouped.get(k)!.slice(0, 5).map(({ item, r }) => (
                    <CandidateCard key={item.id} item={item} r={r} catKey={k} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 申請準備チェックリスト */}
      <section className="mt-6">
        <h2 className="mb-1 text-lg font-bold text-ink">申請準備チェックリスト</h2>
        <p className="mb-2 text-xs text-gray-500">この案件で確認すべきこと（{doneCount}/{PROJECT_CHECKLIST.length} 完了）。{prepHint(project, doneCount)}</p>
        <div className="grid gap-1.5 rounded-lg border bg-white p-4 sm:grid-cols-2">
          {PROJECT_CHECKLIST.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={!!project.checklist[c.key]} onChange={() => toggleCheck(c.key)} className="h-4 w-4" />
              <span className={project.checklist[c.key] ? "text-gray-400 line-through" : "text-ink"}>{c.label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

// 次に何をすべきかの一言
function prepHint(p: SpendingProject, done: number): string {
  if (!p.checklist["pre_order"]) return "まず発注前か確認してください。";
  if (!p.checklist["guideline"]) return "次に公式の公募要領を確認してください。";
  if (!p.checklist["estimate"]) return "見積取得の前に対象経費を確認しましょう。";
  if (done >= PROJECT_CHECKLIST.length) return "準備完了です。締切前に申請しましょう。";
  return "残りの確認を進めましょう。";
}

function CandidateCard({ item, r, catKey }: { item: DiscoveredItem; r: TriageResult; catKey: TriageKey }) {
  const m = TRIAGE_META[catKey];
  const dd = daysUntil(r.deadline);
  return (
    <div className={`rounded-lg border p-3 ${m.tone}`}>
      <p className="text-sm font-bold text-ink">結論：{r.conclusion}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-ink">{item.title}</span>
        {r.score > 0 && <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-ink">合いそう {r.score}</span>}
        {r.officialConfirmed ? <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-emerald-700">公式確認済み</span> : <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-gray-600">公式未確認</span>}
        {r.deadline && <span className={`rounded bg-white/70 px-1.5 py-0.5 text-[10px] ${dd != null && dd <= 14 ? "font-semibold text-red-600" : "text-gray-600"}`}>締切 {formatDate(r.deadline)}{dd != null && dd >= 0 ? `（あと${dd}日）` : ""}</span>}
      </div>
      {r.killers.length > 0 && <p className="mt-1 text-xs text-red-700">注意：{r.killers.join(" / ")}</p>}
      {r.nextActions.length > 0 && <p className="mt-1 text-xs text-orange-700">今やること：{r.nextActions.slice(0, 3).join(" → ")}</p>}
      {(item.official_url || item.url) && (
        <a href={item.official_url ?? item.url ?? "#"} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">🔗 公式ページを見る ↗</a>
      )}
    </div>
  );
}
