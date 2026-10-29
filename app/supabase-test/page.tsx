"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function SupabaseTestPage() {
  const [status, setStatus] = useState("Checking database connection...");

  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      const { data, error } = await supabase
        .from("banners")
        .select("id")
        .limit(1);

      if (cancelled) return;

      if (error) {
        setStatus(`Connection failed: ${error.message}`);
      } else {
        setStatus(
          `Connected successfully! Query completed. Rows returned: ${
            data?.length ?? 0
          }`,
        );
      }
    }

    checkConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 p-10 text-stone-900">
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Supabase Connection Test</h1>
        <p className="mt-4">{status}</p>
      </div>
    </main>
  );
}
