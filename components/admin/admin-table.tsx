import React from "react";
import { Search, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

interface AdminTableProps<T> {
  columns: {
    header: string;
    accessorKey?: keyof T | string;
    className?: string;
    cell?: (item: T, index: number) => React.ReactNode;
  }[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  filters?: React.ReactNode;
}

export function AdminTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = "No items found",
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  page = 1,
  pageSize = 10,
  totalCount,
  onPageChange,
  filters,
}: AdminTableProps<T>) {
  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1;

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white shadow-xs overflow-hidden">
      {/* Controls Bar: Search & Filters */}
      {(onSearchChange || filters) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-b border-stone-100 bg-stone-50/50">
          {onSearchChange && (
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                value={searchValue || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3.5 py-2 text-xs sm:text-sm outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50"
              />
            </div>
          )}

          {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
        </div>
      )}

      {/* Table Surface */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-stone-50/80 border-b border-stone-100 text-[11px] font-bold uppercase tracking-wider text-stone-500">
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} className={`px-4 py-3.5 ${col.className || ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 text-stone-700">
            {loading ? (
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`} className="animate-pulse">
                  {columns.map((_, cIdx) => (
                    <td key={`skeleton-td-${cIdx}`} className="px-4 py-3.5">
                      <div className="h-4 rounded bg-stone-100 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-stone-400">
                  <div className="flex flex-col items-center justify-center">
                    <Inbox size={32} className="text-stone-300 mb-2 stroke-[1.5]" />
                    <p className="text-sm font-medium text-stone-500">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr
                  key={keyExtractor(item, idx)}
                  className="hover:bg-stone-50/60 transition-colors"
                >
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className={`px-4 py-3.5 align-middle ${col.className || ""}`}>
                      {col.cell
                        ? col.cell(item, idx)
                        : col.accessorKey
                        ? String((item as Record<string, unknown>)[col.accessorKey as string] ?? "")
                        : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalCount !== undefined && totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100 bg-stone-50/50 text-xs text-stone-500">
          <span>
            Showing {(page - 1) * pageSize + 1} to{" "}
            {Math.min(page * pageSize, totalCount)} of {totalCount} entries
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="px-2 font-medium text-stone-700">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

