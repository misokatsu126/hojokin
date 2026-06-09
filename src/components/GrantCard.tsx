import Link from "next/link";
import type { Grant, GrantMatch } from "@/lib/types";
import { formatAmount } from "@/lib/utils";
import { DeadlineBadge, ScoreBadge, Tag } from "./Badges";

export function GrantCard({
  grant,
  bestMatch,
}: {
  grant: Grant;
  bestMatch?: GrantMatch | null;
}) {
  return (
    <Link
      href={`/grants/${grant.id}`}
      className="block rounded-lg border bg-white p-4 transition hover:border-accent hover:shadow-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {grant.grant_type && <Tag>{grant.grant_type}</Tag>}
        {grant.recruitment_status && <Tag>{grant.recruitment_status}</Tag>}
        <DeadlineBadge deadline={grant.application_deadline} />
        {grant.pre_application_ng && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            着手NG注意
          </span>
        )}
        {grant.requires_professional && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            士業確認推奨
          </span>
        )}
      </div>

      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug text-ink">{grant.name}</h3>
        {bestMatch && (
          <div className="shrink-0">
            <ScoreBadge score={bestMatch.match_score} recommendation={bestMatch.recommendation} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
        <div><span className="text-gray-400">実施主体：</span>{grant.organization ?? "—"}</div>
        <div><span className="text-gray-400">上限額：</span>{formatAmount(grant.max_amount)}</div>
        <div><span className="text-gray-400">対象地域：</span>{grant.regions.slice(0, 2).join("・") || "—"}{grant.regions.length > 2 && " ほか"}</div>
        <div><span className="text-gray-400">対象業種：</span>{grant.industries.slice(0, 2).join("・") || "—"}{grant.industries.length > 2 && " ほか"}</div>
      </div>
    </Link>
  );
}
