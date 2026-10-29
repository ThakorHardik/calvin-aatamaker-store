"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";

type Stats = { banners: number; publishedBanners: number; customers: number };
type View = "checking" | "signed-out" | "denied" | "ready" | "error";
const emptyStats: Stats = { banners: 0, publishedBanners: 0, customers: 0 };

export default function AdminPage() {
  const [view, setView] = useState<View>("checking");
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [adminEmail, setAdminEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDashboard = useCallback(async (userId: string) => {
    setView("checking");
    setNotice("");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, email")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      setView("error");
      setNotice(`Could not verify your account: ${profileError.message}`);
      return;
    }
    if (profile?.role !== "admin") {
      setView("denied");
      return;
    }
    setAdminEmail(profile.email ?? "");
    setView("ready");
    const [allBanners, publishedBanners, customers] = await Promise.all([
      supabase.from("banners").select("id", { count: "exact", head: true }),
      supabase
        .from("banners")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "customer"),
    ]);
    const error = allBanners.error || publishedBanners.error || customers.error;
    if (error) {
      setView("error");
      setNotice(`Could not load dashboard statistics: ${error.message}`);
      return;
    }
    setStats({
      banners: allBanners.count ?? 0,
      publishedBanners: publishedBanners.count ?? 0,
      customers: customers.count ?? 0,
    });
    setView("ready");
  }, []);

  useEffect(() => {
    let mounted = true;
    async function initialise() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        setView("error");
        setNotice(error.message);
        return;
      }
      if (data.session) await loadDashboard(data.session.user.id);
      else setView("signed-out");
    }
    void initialise();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !session) {
        setView("signed-out");
        setAdminEmail("");
        setStats(emptyStats);
        return;
      }
      // Supabase calls are deliberately scheduled outside the auth callback to avoid callback deadlocks.
      if (event === "SIGNED_IN") {
        window.setTimeout(() => {
          if (mounted) void loadDashboard(session.user.id);
        }, 0);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadDashboard]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    setPassword("");
    if (error) setNotice(error.message);
    // Successful sign-in is handled by the SIGNED_IN listener.
  }
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(error.message);
  }
  async function refresh() {
    setBusy(true);
    setNotice("");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setView("error");
      setNotice(error.message);
    } else if (data.session) await loadDashboard(data.session.user.id);
    else setView("signed-out");
    setBusy(false);
  }

  if (view === "checking")
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-stone-500">
        <LoaderCircle size={18} className="mr-2 animate-spin" /> Checking
        administrator access…
      </div>
    );
  if (view === "signed-out")
    return (
      <div className="flex min-h-[75vh] items-center justify-center p-5">
        <form
          onSubmit={signIn}
          className="w-full max-w-md space-y-5 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <LockKeyhole size={23} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
              Calvin Aatamaker
            </p>
            <h1 className="mt-2 text-2xl font-bold">Administrator sign in</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Sign in with the admin account created in Supabase.
            </p>
          </div>
          <label className="block text-sm font-medium">
            Email address
            <input
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-red-700"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-red-700"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {notice && (
            <p role="alert" className="break-words text-sm text-red-700">
              {notice}
            </p>
          )}
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            <LogIn size={17} />
            {busy ? "Signing in…" : "Sign in to dashboard"}
          </button>
        </form>
      </div>
    );
  if (view === "denied")
    return (
      <div className="mx-auto max-w-xl p-6 pt-16">
        <div className="rounded-2xl border border-amber-200 bg-white p-8">
          <ShieldCheck size={30} className="text-amber-700" />
          <h1 className="mt-4 text-2xl font-bold">
            Administrator access required
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            This account does not have the admin role. Sign out and use the
            authorised administrator account.
          </p>
          <button
            onClick={() => void signOut()}
            className="mt-5 rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  if (view === "error")
    return (
      <div className="mx-auto max-w-2xl p-6 pt-12">
        <div className="rounded-2xl border border-red-200 bg-white p-6">
          <AlertCircle size={24} className="text-red-700" />
          <h1 className="mt-3 text-xl font-bold">Dashboard could not load</h1>
          <p className="mt-2 break-words text-sm text-stone-600">{notice}</p>
          <button
            onClick={() => void refresh()}
            className="mt-5 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );

  return (
    <main className="min-h-screen bg-[#f7f7f5]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white px-6 py-5 lg:px-10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-700">
            Store overview
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Welcome back{adminEmail ? `, ${adminEmail}` : ""}. Here&apos;s your
            store at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void refresh()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold"
          >
            <RefreshCw size={15} /> Refresh data
          </button>
          <button
            onClick={() => void signOut()}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold"
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] space-y-7 p-5 sm:p-7 lg:p-10">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 size={19} className="shrink-0 text-emerald-700" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              Admin account verified
            </p>
            <p className="mt-0.5 text-xs text-emerald-800">
              Current metrics are loaded from Supabase. Product and order
              metrics will be available when those modules are connected.
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
            Connected
          </span>
        </div>
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold">Store activity</h2>
            <p className="mt-1 text-sm text-stone-500">
              Live counts from the tables currently configured.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="All banners"
              value={stats.banners}
              detail="Saved in your banner library"
              icon={ImageIcon}
              iconClass="bg-red-50 text-red-700"
            />
            <Metric
              title="Published banners"
              value={stats.publishedBanners}
              detail="Enabled for homepage display"
              icon={Activity}
              iconClass="bg-emerald-50 text-emerald-700"
            />
            <Metric
              title="Customer profiles"
              value={stats.customers}
              detail="Registered customer profiles"
              icon={Users}
              iconClass="bg-blue-50 text-blue-700"
            />
            <Metric
              title="Products & orders"
              value="Next"
              detail="Modules are being connected"
              icon={Boxes}
              iconClass="bg-amber-50 text-amber-700"
            />
          </div>
        </section>
        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold">Store management</h2>
            <p className="mt-1 text-sm text-stone-500">
              Open a section to manage the store.
            </p>
            <div className="mt-4 divide-y divide-stone-100">
              <Action
                href="/admin/banners"
                icon={ImageIcon}
                title="Homepage banners"
                detail={`${stats.banners} saved · ${stats.publishedBanners} published`}
                action="Manage banners"
              />
              <Action
                href="/admin/products"
                icon={Package}
                title="Products & categories"
                detail="Pricing, images, stock and categories"
                action="Manage products"
              />
              <Action
                href={null}
                icon={ShoppingBag}
                title="Orders & fulfilment"
                detail="Orders, payments and delivery details"
                action="Coming next"
              />
              <Action
                href={null}
                icon={Users}
                title="Customer accounts"
                detail="Profiles and account management"
                action="Coming next"
              />
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700">
                  <ShieldCheck size={20} />
                </span>
                <div>
                  <h2 className="font-bold">Access & security</h2>
                  <p className="text-xs text-stone-500">
                    Administrator session
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <SafetyCheck label="Signed in with Supabase Auth" />
                <SafetyCheck label="Admin role verified" />
                <SafetyCheck label="Database row policies enabled" />
              </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                  <Activity size={20} />
                </span>
                <h2 className="font-bold">Development milestones</h2>
              </div>
              <ol className="mt-5 space-y-4">
                <Milestone number="01" title="Banner management" done />
                <Milestone number="02" title="Products & categories" />
                <Milestone number="03" title="Cart, checkout and orders" />
                <Milestone number="04" title="Photo customisation studio" />
                <Milestone number="05" title="3D product preview" />
              </ol>
            </div>
          </div>
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 py-4 text-xs text-stone-500">
          <span>Calvin Aatamaker · Store administration</span>
          <span>Only connected modules contribute to live metrics.</span>
        </footer>
      </div>
    </main>
  );
}

function Metric({
  title,
  value,
  detail,
  icon: Icon,
  iconClass,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof ImageIcon;
  iconClass: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-stone-500">{title}</p>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon size={19} />
        </span>
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-stone-900">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-stone-500">{detail}</p>
    </div>
  );
}
function Action({
  href,
  icon: Icon,
  title,
  detail,
  action,
}: {
  href: string | null;
  icon: typeof ImageIcon;
  title: string;
  detail: string;
  action: string;
}) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold text-stone-900">
          {title}
        </strong>
        <span className="mt-1 block text-xs leading-5 text-stone-500">
          {detail}
        </span>
      </span>
      <span
        className={`shrink-0 text-xs font-semibold ${href ? "text-red-700" : "text-stone-400"}`}
      >
        {action}
      </span>
      {href && <ArrowRight size={16} className="shrink-0 text-red-700" />}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-2 py-4 transition hover:bg-stone-50"
    >
      {content}
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-2 py-4 opacity-70">
      {content}
    </div>
  );
}
function SafetyCheck({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-stone-600">
      <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
      <span>{label}</span>
    </div>
  );
}
function Milestone({
  number,
  title,
  done = false,
}: {
  number: string;
  title: string;
  done?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
      >
        {done ? <CheckCircle2 size={16} /> : number}
      </span>
      <span
        className={`text-sm ${done ? "font-semibold text-stone-800" : "text-stone-500"}`}
      >
        {title}
      </span>
      {done && (
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-emerald-700">
          Ready
        </span>
      )}
    </li>
  );
}
