import type { MatchResult } from "@/lib/types";
import { ScoreBadge, MatchStatusBadge } from "./Badges";

export function MatchResultCard({
  result,
  engine,
}: {
  result: MatchResult;
  engine?: "ai" | "rule";
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ScoreBadge score={result.match_score} recommendation={result.recommendation} />
        <MatchStatusBadge status={result.status} />
        {engine && (
          <span className="ml-auto text-xs text-gray-400">
            {engine === "ai" ? "AI判定" : "ルールベース判定"}
          </span>
        )}
      </div>

      <p className="mb-3 text-sm leading-relaxed text-gray-700">{result.summary}</p>

      {result.deadline_warning && (
        <p className="mb-2 rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-800">
          ⏰ {result.deadline_warning}
        </p>
      )}
      {result.pre_application_warning && (
        <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          ⚠ {result.pre_application_warning}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="対象になりそうな理由" items={result.matched_reasons} tone="green" />
        <Section title="使えそうな用途" items={result.possible_uses} tone="green" />
        <Section title="補助金の対象になりそうな費用" items={result.eligible_expenses} tone="green" />
        <Section title="対象外になる可能性" items={result.exclusion_risks} tone="red" />
      </div>

      {result.next_actions.length > 0 && (
        <div className="mt-3 rounded-md bg-slate-50 p-3">
          <h4 className="mb-1.5 text-sm font-semibold text-ink">次にやること</h4>
          <ol className="list-inside list-decimal space-y-1 text-sm text-gray-600">
            {result.next_actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </div>
      )}

      {result.professional_consultation_needed && (
        <p className="mt-3 text-xs text-amber-700">
          ※ 行政書士・社会保険労務士・認定支援機関などの専門家への確認をおすすめします。
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "red" | "green";
}) {
  if (!items.length) return null;
  const dot = tone === "red" ? "text-red-400" : "text-accent";
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-ink">{title}</h4>
      <ul className="space-y-0.5 text-sm text-gray-600">
        {items.map((item, i) => (
          <li key={i}>
            <span className={`mr-1.5 ${dot}`}>•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
