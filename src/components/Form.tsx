"use client";

export function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              on ? "border-accent bg-accent text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string | number | "";
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  allowEmpty?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      >
        {allowEmpty && <option value="">指定なし</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

// "a, b, c" 形式の文字列 ↔ 配列 の補助
export function CommaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      <input
        type="text"
        value={value.join("、")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(/[、,]/)
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
    </label>
  );
}
