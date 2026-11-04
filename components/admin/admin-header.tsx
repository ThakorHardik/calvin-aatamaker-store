import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export function AdminHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: AdminHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-5">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-xs text-stone-500">
            <Link href="/admin" className="hover:text-stone-900 transition-colors">
              Admin
            </Link>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.label}>
                <ChevronRight size={13} className="text-stone-400 shrink-0" />
                {crumb.href && idx < breadcrumbs.length - 1 ? (
                  <Link href={crumb.href} className="hover:text-stone-900 transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-stone-900">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

