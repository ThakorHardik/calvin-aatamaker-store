import React from "react";
import { type LucideIcon } from "lucide-react";

interface AdminStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  badge?: {
    text: string;
    variant: "positive" | "warning" | "neutral" | "danger";
  };
  onClick?: () => void;
}

export function AdminStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
  onClick,
}: AdminStatCardProps) {
  const badgeStyles = {
    positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    neutral: "bg-stone-100 text-stone-700 border-stone-200",
  };

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs transition hover:border-stone-300 hover:shadow-sm ${
        onClick ? "cursor-pointer text-left" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          {title}
        </span>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
          {Icon ? <Icon size={18} strokeWidth={2} /> : null}
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-stone-900">{value}</span>
        {badge && (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeStyles[badge.variant]}`}
          >
            {badge.text}
          </span>
        )}
      </div>

      {subtitle && <p className="mt-1 text-xs text-stone-400">{subtitle}</p>}
    </Wrapper>
  );
}

