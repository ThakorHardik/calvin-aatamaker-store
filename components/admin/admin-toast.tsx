import React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

interface AdminToastProps {
  message: string;
  variant?: ToastVariant;
  onDismiss?: () => void;
  className?: string;
}

export function AdminToast({
  message,
  variant = "info",
  onDismiss,
  className = "",
}: AdminToastProps) {
  if (!message) return null;

  const styles = {
    success: {
      bg: "bg-emerald-50 text-emerald-800 border-emerald-200",
      icon: CheckCircle2,
      iconColor: "text-emerald-600",
    },
    error: {
      bg: "bg-rose-50 text-rose-800 border-rose-200",
      icon: AlertCircle,
      iconColor: "text-rose-600",
    },
    info: {
      bg: "bg-stone-50 text-stone-800 border-stone-200",
      icon: Info,
      iconColor: "text-stone-600",
    },
  }[variant];

  const IconComponent = styles.icon;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm shadow-xs transition ${styles.bg} ${className}`}
    >
      <IconComponent size={18} className={`shrink-0 mt-0.5 ${styles.iconColor}`} />
      <div className="flex-1 text-xs sm:text-sm font-medium leading-relaxed">
        {message}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 transition"
          aria-label="Dismiss notification"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

