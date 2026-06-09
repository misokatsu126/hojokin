"use client";

import { useEffect, useState } from "react";
import {
  fetchProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  fetchWatchConditions,
  upsertWatchCondition,
} from "@/lib/supabase";
import type { BusinessProfile, BusinessProfileInput, WatchCondition } from "@/lib/types";
import {
  ENTITY_TYPES,
  REGIONS,
  INDUSTRIES,
  PURPOSES,
  EXPENSE_CATEGORIES,
  RECRUITMENT_STATUSES,
} from "@/lib/constants";
import { CheckboxGroup, TextField, SelectField, TextArea, CommaField } from "@/components/Form";
import { Tag } from "@/components/Badges";
import { SAMPLE_PROFILES } from "@/lib/samples";

const blank: BusinessProfileInput = {
  name: "",
  entity_type: "",
  location: "",
  regions: [],
  industries: [],
  description: "",
  purposes: [],
  expenses: [],
  keywords: [],
  exclude_keywords: [],
  desired_amount: null,
  notes: "",
};

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [watch, setWatch] = useState<WatchCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<BusinessProfileInput>(blank);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [p, w] = await Promise.all([fetchProfiles(), fetchWatchConditions()]);
    setProfiles(p);
    setWatch(w);
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof BusinessProfileInput, v: any) => setForm((p) => ({ ...p, [k]: v }));

  function startNew() {
    setEditing(null);
    setForm(blank);
    setShowForm(true);
  }

  function startEdit(p: BusinessProfile) {
    setEditing(p.id);
    setForm({
      name: p.name,
      entity_type: p.entity_type ?? "",
      location: p.location ?? "",
      regions: p.regions,
      industries: p.industries,
      description: p.description ?? "",
      purposes: p.purposes,
      expenses: p.expenses,
      keywords: p.keywords,
      exclude_keywords: p.exclude_keywords,
      desired_amount: p.desired_amount,
      notes: p.notes ?? "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!form.name.trim()) {
      alert("事業名を入力してください。");
      return;
    }
    setBusy(true);
    try {
      if (editing) await updateProfile(editing, form);
      else await createProfile(form);
      setShowForm(false);
      setForm(blank);
      setEditing(null);
      await load();
    } catch (e: any) {
      alert(`保存に失敗しました: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("この事業プロフィールを削除しますか？関連する判定結果も無効になります。")) return;
    try {
      await deleteProfile(id);
      await load();
    } catch (e: any) {
      alert(`削除に失敗しました: ${e.message}`);
    }
  }

  async function seedSamples() {
    if (!confirm("サンプル事業プロフィール5件を登録しますか？")) return;
    setBusy(true);
    try {
      for (const s of SAMPLE_PROFILES) await createProfile(s);
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
        <h1 className="text-xl font-bold text-ink">事業プロフィール管理</h1>
        <div className="flex gap-2">
          {profiles.length === 0 && (
            <button onClick={seedSamples} disabled={busy} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              サンプル5件を登録
            </button>
          )}
          <button onClick={startNew} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
            ＋ 新規登録
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">{editing ? "プロフィールを編集" : "新規プロフィール"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="事業名" value={form.name} onChange={(v) => set("name", v)} required />
            <SelectField label="法人種別" value={form.entity_type ?? ""} onChange={(v) => set("entity_type", v)} options={ENTITY_TYPES} />
            <TextField label="所在地" value={form.location ?? ""} onChange={(v) => set("location", v)} placeholder="例：名古屋市中区" />
            <TextField label="補助上限額の希望（万円）" type="number" value={form.desired_amount ? form.desired_amount / 10000 : ""} onChange={(v) => set("desired_amount", v ? Number(v) * 10000 : null)} />
          </div>

          <Group label="対象地域">
            <CheckboxGroup options={REGIONS} selected={form.regions} onChange={(v) => set("regions", v)} />
          </Group>
          <Group label="業種">
            <CheckboxGroup options={INDUSTRIES} selected={form.industries} onChange={(v) => set("industries", v)} />
          </Group>
          <Group label="目的">
            <CheckboxGroup options={PURPOSES} selected={form.purposes} onChange={(v) => set("purposes", v)} />
          </Group>
          <Group label="使いたい経費">
            <CheckboxGroup options={EXPENSE_CATEGORIES} selected={form.expenses} onChange={(v) => set("expenses", v)} />
          </Group>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <CommaField label="キーワード（、区切り）" value={form.keywords} onChange={(v) => set("keywords", v)} placeholder="トレカ、カードショップ" />
            <CommaField label="除外キーワード（、区切り）" value={form.exclude_keywords} onChange={(v) => set("exclude_keywords", v)} placeholder="農業、漁業" />
          </div>
          <div className="mt-4">
            <TextArea label="事業内容" value={form.description ?? ""} onChange={(v) => set("description", v)} />
          </div>
          <div className="mt-4">
            <TextArea label="メモ" value={form.notes ?? ""} onChange={(v) => set("notes", v)} rows={2} />
          </div>

          <p className="mt-3 text-xs text-gray-400">
            ここで設定した地域・業種・目的・経費・キーワードが、そのまま補助金の監視条件として照合に使われます。
          </p>

          <div className="mt-5 flex gap-2">
            <button onClick={save} disabled={busy} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "保存中…" : "保存"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {profiles.length === 0 ? (
        <p className="rounded-lg border bg-white p-8 text-center text-gray-400">
          事業プロフィールがまだありません。「サンプル5件を登録」または「新規登録」から追加してください。
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {profiles.map((p) => (
            <div key={p.id} className="rounded-lg border bg-white p-4">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-ink">{p.name}</h3>
                  <p className="text-xs text-gray-400">{p.entity_type || "法人種別未設定"}{p.location ? ` / ${p.location}` : ""}</p>
                </div>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => startEdit(p)} className="text-accent hover:underline">編集</button>
                  <button onClick={() => remove(p.id)} className="text-red-500 hover:underline">削除</button>
                </div>
              </div>
              {p.description && <p className="mb-2 text-sm text-gray-600">{p.description}</p>}
              <Row label="地域" items={p.regions} />
              <Row label="業種" items={p.industries} />
              <Row label="目的" items={p.purposes} />
              <Row label="経費" items={p.expenses} />
              {p.keywords.length > 0 && <Row label="キーワード" items={p.keywords} />}
            </div>
          ))}
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

function Row({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-gray-400">{label}：</span>
      {items.map((i) => (
        <Tag key={i}>{i}</Tag>
      ))}
    </div>
  );
}
