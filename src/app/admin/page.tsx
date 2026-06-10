"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  fetchGrants,
  fetchGrant,
  createGrant,
  updateGrant,
  deleteGrant,
} from "@/lib/supabase";
import type { Grant, GrantInput } from "@/lib/types";
import {
  GRANT_TYPES,
  ORG_TYPES,
  REGIONS,
  INDUSTRIES,
  ENTITY_TYPES,
  PURPOSES,
  EXPENSE_CATEGORIES,
  RECRUITMENT_STATUSES,
  DIFFICULTIES,
  SELECTION_TYPES,
} from "@/lib/constants";
import { CheckboxGroup, TextField, SelectField, TextArea, Toggle, CommaField } from "@/components/Form";
import { DeadlineBadge, Tag } from "@/components/Badges";
import { SAMPLE_GRANTS } from "@/lib/samples";
import { sampleButtonsVisible } from "@/lib/sampleFilter";

const blank: GrantInput = {
  name: "",
  grant_type: "補助金",
  organization: "",
  org_type: "",
  regions: [],
  industries: [],
  entity_types: [],
  target_audience: "",
  expense_categories: [],
  subsidy_rate: "",
  min_amount: null,
  max_amount: null,
  application_start: null,
  application_deadline: null,
  recruitment_status: "募集中",
  application_method: "",
  required_documents: "",
  official_url: "",
  guideline_pdf_url: "",
  notes: "",
  pre_application_ng: false,
  requires_professional: false,
  keywords: [],
  purposes: [],
  exclusion_conditions: "",
  early_termination_risk: false,
  selection_type: "不明",
  difficulty: "不明",
  source: "手動登録",
  fetched_at: null,
};

function AdminInner() {
  const params = useSearchParams();
  const router = useRouter();
  const editId = params.get("edit");

  const [grants, setGrants] = useState<Grant[]>([]);
  const [form, setForm] = useState<GrantInput>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setGrants(await fetchGrants());
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!editId) return;
    fetchGrant(editId).then((g) => {
      if (g) {
        loadIntoForm(g);
        setShowForm(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  function loadIntoForm(g: Grant) {
    setEditing(g.id);
    const { id, created_at, updated_at, ...rest } = g;
    setForm(rest);
  }

  const set = (k: keyof GrantInput, v: any) => setForm((p) => ({ ...p, [k]: v }));

  function startNew() {
    setEditing(null);
    setForm(blank);
    setShowForm(true);
    setMsg(null);
  }

  function startEdit(g: Grant) {
    loadIntoForm(g);
    setShowForm(true);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function runRematch(grantId: string, isNew: boolean) {
    try {
      const r = await fetch("/api/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_id: grantId, is_new: isNew }),
      });
      const data = await r.json();
      return data.high_match_count as number;
    } catch {
      return null;
    }
  }

  async function save() {
    if (!form.name.trim()) {
      alert("名称を入力してください。");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // 空文字の日付は null に
      const payload: GrantInput = {
        ...form,
        application_start: form.application_start || null,
        application_deadline: form.application_deadline || null,
      };
      let grantId: string;
      const isNew = !editing;
      if (editing) {
        const g = await updateGrant(editing, payload);
        grantId = g.id;
      } else {
        const g = await createGrant(payload);
        grantId = g.id;
      }
      const high = await runRematch(grantId, isNew);
      setMsg(
        high == null
          ? "保存しました（自動照合は確認できませんでした）。"
          : `保存し、全事業と自動照合しました。高相性：${high}件。`
      );
      setShowForm(false);
      setEditing(null);
      setForm(blank);
      if (editId) router.replace("/admin");
      await load();
    } catch (e: any) {
      alert(`保存に失敗しました: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("この補助金を削除しますか？関連する判定・アラートも削除されます。")) return;
    try {
      await deleteGrant(id);
      await load();
    } catch (e: any) {
      alert(`削除に失敗しました: ${e.message}`);
    }
  }

  async function seedSamples() {
    if (!confirm("サンプル補助金6件を登録し、全事業と自動照合しますか？")) return;
    setBusy(true);
    setMsg(null);
    try {
      let high = 0;
      for (const s of SAMPLE_GRANTS) {
        const g = await createGrant(s);
        const h = await runRematch(g.id, true);
        if (h) high += h;
      }
      setMsg(`サンプル6件を登録し、自動照合しました。高相性アラート合計：${high}件。`);
      await load();
    } catch (e: any) {
      alert(`サンプル登録に失敗しました: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">補助金・助成金 登録／管理</h1>
        <div className="flex gap-2">
          {sampleButtonsVisible() && (
            <button onClick={seedSamples} disabled={busy} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              サンプル6件を登録
            </button>
          )}
          <button onClick={startNew} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
            ＋ 新規登録
          </button>
        </div>
      </div>

      {msg && <p className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</p>}

      {showForm && (
        <div className="mb-6 rounded-lg border bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">{editing ? "補助金を編集" : "新規補助金"}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField label="名称" value={form.name} onChange={(v) => set("name", v)} required />
            </div>
            <SelectField label="種別" value={form.grant_type ?? ""} onChange={(v) => set("grant_type", v)} options={GRANT_TYPES} allowEmpty={false} />
            <SelectField label="実施主体の区分" value={form.org_type ?? ""} onChange={(v) => set("org_type", v)} options={ORG_TYPES} />
            <TextField label="実施主体" value={form.organization ?? ""} onChange={(v) => set("organization", v)} />
            <TextField label="対象者" value={form.target_audience ?? ""} onChange={(v) => set("target_audience", v)} />
            <SelectField label="募集状態" value={form.recruitment_status ?? ""} onChange={(v) => set("recruitment_status", v)} options={RECRUITMENT_STATUSES} allowEmpty={false} />
            <TextField label="補助率" value={form.subsidy_rate ?? ""} onChange={(v) => set("subsidy_rate", v)} placeholder="例：2/3" />
            <TextField label="最小補助額（円）" type="number" value={form.min_amount ?? ""} onChange={(v) => set("min_amount", v ? Number(v) : null)} />
            <TextField label="補助上限額（円）" type="number" value={form.max_amount ?? ""} onChange={(v) => set("max_amount", v ? Number(v) : null)} />
            <TextField label="募集開始日" type="date" value={form.application_start ?? ""} onChange={(v) => set("application_start", v)} />
            <TextField label="締切日" type="date" value={form.application_deadline ?? ""} onChange={(v) => set("application_deadline", v)} />
            <SelectField label="採択制／条件達成型" value={form.selection_type ?? ""} onChange={(v) => set("selection_type", v)} options={SELECTION_TYPES} />
            <SelectField label="難易度" value={form.difficulty ?? ""} onChange={(v) => set("difficulty", v)} options={DIFFICULTIES} />
          </div>

          <Group label="対象地域"><CheckboxGroup options={REGIONS} selected={form.regions} onChange={(v) => set("regions", v)} /></Group>
          <Group label="対象業種"><CheckboxGroup options={INDUSTRIES} selected={form.industries} onChange={(v) => set("industries", v)} /></Group>
          <Group label="対象法人種別（空欄＝指定なし）"><CheckboxGroup options={ENTITY_TYPES} selected={form.entity_types} onChange={(v) => set("entity_types", v)} /></Group>
          <Group label="目的カテゴリ"><CheckboxGroup options={PURPOSES} selected={form.purposes} onChange={(v) => set("purposes", v)} /></Group>
          <Group label="対象経費カテゴリ"><CheckboxGroup options={EXPENSE_CATEGORIES} selected={form.expense_categories} onChange={(v) => set("expense_categories", v)} /></Group>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField label="公式URL" value={form.official_url ?? ""} onChange={(v) => set("official_url", v)} placeholder="https://" />
            <TextField label="公募要領PDF URL" value={form.guideline_pdf_url ?? ""} onChange={(v) => set("guideline_pdf_url", v)} placeholder="https://" />
            <TextField label="申請方法" value={form.application_method ?? ""} onChange={(v) => set("application_method", v)} />
            <CommaField label="キーワード（、区切り）" value={form.keywords} onChange={(v) => set("keywords", v)} />
          </div>

          <div className="mt-4 space-y-4">
            <TextArea label="必要書類" value={form.required_documents ?? ""} onChange={(v) => set("required_documents", v)} rows={2} />
            <TextArea label="注意点" value={form.notes ?? ""} onChange={(v) => set("notes", v)} rows={2} />
            <TextArea label="対象外条件" value={form.exclusion_conditions ?? ""} onChange={(v) => set("exclusion_conditions", v)} rows={2} />
          </div>

          <div className="mt-4 flex flex-wrap gap-6 rounded-md bg-slate-50 p-3">
            <Toggle label="申請前着手NGの可能性あり" checked={form.pre_application_ng} onChange={(v) => set("pre_application_ng", v)} />
            <Toggle label="士業確認推奨" checked={form.requires_professional} onChange={(v) => set("requires_professional", v)} />
            <Toggle label="予算上限・早期終了の可能性あり" checked={form.early_termination_risk} onChange={(v) => set("early_termination_risk", v)} />
          </div>

          <p className="mt-3 text-xs text-gray-400">
            保存すると、登録済みの全事業プロフィールと自動照合し、高相性・要確認・締切間近・新着アラートを作成します。
          </p>

          <div className="mt-5 flex gap-2">
            <button onClick={save} disabled={busy} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "保存・照合中…" : "保存して自動照合"}
            </button>
            <button onClick={() => { setShowForm(false); if (editId) router.replace("/admin"); }} className="rounded-md border px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {grants.length === 0 ? (
        <p className="rounded-lg border bg-white p-8 text-center text-gray-400">
          補助金がまだありません。「サンプル6件を登録」または「新規登録」から追加してください。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">種別</th>
                <th className="px-3 py-2">締切</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/grants/${g.id}`} className="font-medium text-ink hover:text-accent hover:underline">{g.name}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {g.pre_application_ng && <Tag>着手NG注意</Tag>}
                      {g.requires_professional && <Tag>士業確認</Tag>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{g.grant_type}</td>
                  <td className="px-3 py-2"><DeadlineBadge deadline={g.application_deadline} /></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => startEdit(g)} className="mr-3 text-accent hover:underline">編集</button>
                    <button onClick={() => remove(g.id)} className="text-red-500 hover:underline">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <span className="mb-1.5 block text-xs text-gray-500">{label}</span>
      {children}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-gray-400">読み込み中…</p>}>
      <AdminInner />
    </Suspense>
  );
}
