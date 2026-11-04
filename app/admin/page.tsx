"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useAdminLayout } from "./admin-context";
import {
  AlertCircle,
  ArrowRight,
  Boxes,

  Clock,



  IndianRupee,
  Layers,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,

} from "lucide-react";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminHeader } from "@/components/admin/admin-header";

type OrderSummary = {
  id: string;
  order_number: string;
  customer_name: string;
  email: string;
  total_amount: number;
  order_status: string;
  payment_status: string;
  created_at: string;
};

type ProductSummary = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock_quantity: number;
  is_active: boolean;
};

type DashboardMetrics = {
  totalOrders: number;
  paidRevenue: number;
  pendingOrders: number;
  activeProducts: number;
  lowStockProducts: number;
  activeBanners: number;
  recentOrders: OrderSummary[];
  recentProducts: ProductSummary[];
};

const emptyMetrics: DashboardMetrics = {
  totalOrders: 0,
  paidRevenue: 0,
  pendingOrders: 0,
  activeProducts: 0,
  lowStockProducts: 0,
  activeBanners: 0,
  recentOrders: [],
  recentProducts: [],
};

type ViewState = "checking" | "signed-out" | "denied" | "ready" | "error";

export default function AdminPage() {
  const { setIsAdminAuthenticated } = useAdminLayout();
  const [view, setView] = useState<ViewState>("checking");
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [adminEmail, setAdminEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDashboard = useCallback(async (userId: string) => {
    setView("checking");
    setNotice("");

    // 1. Verify user profile and administrator role
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

    // 2. Load genuine store metrics across all modules
    const [
      ordersCountRes,
      paidOrdersRes,
      pendingOrdersRes,
      productsCountRes,
      lowStockRes,
      bannersRes,
      recentOrdersRes,
      recentProductsRes,
    ] = await Promise.all([
      // Total orders
      supabase.from("orders").select("id", { count: "exact", head: true }),
      // Revenue from paid orders only
      supabase.from("orders").select("total_amount").eq("payment_status", "paid"),
      // Pending orders
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("order_status", "pending"),
      // Active products
      supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      // Low stock products (5 units or fewer)
      supabase.from("products").select("id", { count: "exact", head: true }).lte("stock_quantity", 5),
      // Active banners
      supabase.from("banners").select("id", { count: "exact", head: true }).eq("is_active", true),
      // Recent 5 orders
      supabase
        .from("orders")
        .select("id, order_number, customer_name, email, total_amount, order_status, payment_status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      // Recent 5 products
      supabase
        .from("products")
        .select("id, name, sku, price, stock_quantity, is_active")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const error =
      ordersCountRes.error ||
      paidOrdersRes.error ||
      pendingOrdersRes.error ||
      productsCountRes.error;

    if (error) {
      setView("error");
      setNotice(`Could not load dashboard statistics: ${error.message}`);
      return;
    }

    // Calculate actual collected revenue from confirmed paid orders
    const paidRevenue = (paidOrdersRes.data || []).reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0
    );

    setMetrics({
      totalOrders: ordersCountRes.count ?? 0,
      paidRevenue,
      pendingOrders: pendingOrdersRes.count ?? 0,
      activeProducts: productsCountRes.count ?? 0,
      lowStockProducts: lowStockRes.count ?? 0,
      activeBanners: bannersRes.count ?? 0,
      recentOrders: (recentOrdersRes.data as OrderSummary[]) || [],
      recentProducts: (recentProductsRes.data as ProductSummary[]) || [],
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
        setMetrics(emptyMetrics);
        return;
      }
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

  useEffect(() => {
    if (view === "ready") {
      setIsAdminAuthenticated(true);
    } else if (view === "signed-out" || view === "denied") {
      setIsAdminAuthenticated(false);
    }
  }, [view, setIsAdminAuthenticated]);

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
    } else if (data.session) {
      await loadDashboard(data.session.user.id);
    } else {
      setView("signed-out");
    }
    setBusy(false);
  }

  if (view === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-stone-500">
        <LoaderCircle size={18} className="mr-2 animate-spin text-[#bf1e2e]" /> Checking
        administrator access…
      </div>
    );
  }

  if (view === "signed-out") {
    return (
      <div className="flex min-h-screen items-center justify-center p-5 bg-[#f7f7f5]">
        <form
          onSubmit={signIn}
          className="w-full max-w-md space-y-5 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <LockKeyhole size={22} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#bf1e2e]">
              CALVIN AATAMAKER
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
              Administrator sign in
            </h1>
            <p className="mt-1.5 text-xs text-stone-500 leading-relaxed">
              Sign in with your authorized store administrator credentials.
            </p>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
            Email address
            <input
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#bf1e2e] focus:ring-2 focus:ring-[#bf1e2e]/10 transition"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
            Password
            <input
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#bf1e2e] focus:ring-2 focus:ring-[#bf1e2e]/10 transition"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {notice && (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
              {notice}
            </p>
          )}
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#bf1e2e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#a01824] transition disabled:opacity-50"
          >
            <LogIn size={16} />
            {busy ? "Signing in…" : "Sign in to Dashboard"}
          </button>
          <div className="pt-2 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 transition"
            >
              ← Return to storefront
            </Link>
          </div>
        </form>
      </div>
    );
  }

  if (view === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center p-5 bg-[#f7f7f5]">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <ShieldCheck size={32} className="text-amber-700" />
          <h1 className="mt-4 text-2xl font-bold text-stone-900">
            Administrator Access Required
          </h1>
          <p className="mt-2 text-xs text-stone-600 leading-relaxed">
            This account does not have administrator privileges. Sign out and sign in with the designated store administrator profile.
          </p>
          <button
            onClick={() => void signOut()}
            className="mt-5 w-full rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-stone-800 transition"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (view === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-5 bg-[#f7f7f5]">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
          <AlertCircle size={28} className="text-rose-700" />
          <h1 className="mt-3 text-xl font-bold text-stone-900">Dashboard Unavailable</h1>
          <p className="mt-2 text-xs text-stone-600">{notice}</p>
          <button
            onClick={() => void refresh()}
            className="mt-5 w-full rounded-xl bg-[#bf1e2e] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#a01824] transition"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1600px] mx-auto w-full">
      <AdminHeader
        title="Store Dashboard"
        subtitle={`Welcome back, ${adminEmail || "Store Administrator"}. Real-time commercial analytics.`}
        actions={
          <>
            <button
              onClick={() => void refresh()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50 transition"
            >
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
              Refresh Data
            </button>
            <Link
              href="/admin/products"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#bf1e2e] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#a01824] transition"
            >
              <Plus size={14} />
              Add Product
            </Link>
          </>
        }
      />

      {/* Primary KPI Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <AdminStatCard
          title="Total Orders"
          value={metrics.totalOrders}
          subtitle="All-time store orders"
          icon={ShoppingBag}
          badge={{ text: "Live", variant: "neutral" }}
        />

        <AdminStatCard
          title="Collected Revenue"
          value={`₹${metrics.paidRevenue.toLocaleString("en-IN")}`}
          subtitle="From confirmed paid orders"
          icon={IndianRupee}
          badge={{ text: "Paid only", variant: "positive" }}
        />

        <AdminStatCard
          title="Pending Fulfilment"
          value={metrics.pendingOrders}
          subtitle="Orders awaiting processing"
          icon={Clock}
          badge={{
            text: metrics.pendingOrders > 0 ? "Action Needed" : "All Clear",
            variant: metrics.pendingOrders > 0 ? "warning" : "positive",
          }}
        />

        <AdminStatCard
          title="Active Products"
          value={metrics.activeProducts}
          subtitle={`${metrics.lowStockProducts} products low on stock`}
          icon={Package}
          badge={{
            text: metrics.lowStockProducts > 0 ? `${metrics.lowStockProducts} low stock` : "Optimal",
            variant: metrics.lowStockProducts > 0 ? "danger" : "positive",
          }}
        />
      </div>

      {/* Quick Access Module Hub */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500 mb-3">
          Quick Management
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/admin/products"
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-stone-200/80 bg-white hover:border-[#bf1e2e]/40 hover:shadow-xs transition group text-center"
          >
            <div className="p-2.5 rounded-lg bg-stone-100 text-stone-700 group-hover:bg-red-50 group-hover:text-[#bf1e2e] transition mb-2">
              <Package size={20} />
            </div>
            <span className="text-xs font-bold text-stone-800">Products</span>
            <span className="text-[10px] text-stone-400">Manage catalog</span>
          </Link>

          <Link
            href="/admin/categories"
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-stone-200/80 bg-white hover:border-[#bf1e2e]/40 hover:shadow-xs transition group text-center"
          >
            <div className="p-2.5 rounded-lg bg-stone-100 text-stone-700 group-hover:bg-red-50 group-hover:text-[#bf1e2e] transition mb-2">
              <Layers size={20} />
            </div>
            <span className="text-xs font-bold text-stone-800">Categories</span>
            <span className="text-[10px] text-stone-400">Organize store</span>
          </Link>

          <Link
            href="/admin/orders"
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-stone-200/80 bg-white hover:border-[#bf1e2e]/40 hover:shadow-xs transition group text-center"
          >
            <div className="p-2.5 rounded-lg bg-stone-100 text-stone-700 group-hover:bg-red-50 group-hover:text-[#bf1e2e] transition mb-2">
              <ShoppingBag size={20} />
            </div>
            <span className="text-xs font-bold text-stone-800">Orders</span>
            <span className="text-[10px] text-stone-400">View orders</span>
          </Link>

          <Link
            href="/admin/homepage"
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-stone-200/80 bg-white hover:border-[#bf1e2e]/40 hover:shadow-xs transition group text-center"
          >
            <div className="p-2.5 rounded-lg bg-stone-100 text-stone-700 group-hover:bg-red-50 group-hover:text-[#bf1e2e] transition mb-2">
              <Boxes size={20} />
            </div>
            <span className="text-xs font-bold text-stone-800">Homepage CMS</span>
            <span className="text-[10px] text-stone-400">Edit storefront</span>
          </Link>
        </div>
      </section>

      {/* Two Column Layout: Recent Orders & Catalog Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders Panel */}
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Recent Customer Orders</h2>
              <p className="text-xs text-stone-500">Latest activity from public.orders</p>
            </div>
            <Link
              href="/admin/orders"
              className="text-xs font-semibold text-[#bf1e2e] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight size={13} />
            </Link>
          </div>

          <div className="mt-4 flex-1">
            {metrics.recentOrders.length === 0 ? (
              <div className="py-10 text-center text-xs text-stone-400">
                No orders recorded in database yet.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {metrics.recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-stone-900">{order.order_number}</p>
                      <p className="text-stone-500">{order.customer_name} · {order.email}</p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-stone-900">
                        ₹{Number(order.total_amount).toLocaleString("en-IN")}
                      </p>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          order.order_status === "delivered"
                            ? "bg-emerald-50 text-emerald-700"
                            : order.order_status === "cancelled"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {order.order_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Catalog Overview Panel */}
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Catalog Inventory</h2>
              <p className="text-xs text-stone-500">Active commercial units & stock levels</p>
            </div>
            <Link
              href="/admin/products"
              className="text-xs font-semibold text-[#bf1e2e] hover:underline flex items-center gap-1"
            >
              Manage <ArrowRight size={13} />
            </Link>
          </div>

          <div className="mt-4 flex-1">
            {metrics.recentProducts.length === 0 ? (
              <div className="py-10 text-center text-xs text-stone-400">
                No active products in catalog.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {metrics.recentProducts.map((p) => (
                  <div
                    key={p.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 truncate">{p.name}</p>
                      <p className="text-stone-500">
                        SKU: {p.sku || "N/A"} · ₹{Number(p.price).toLocaleString("en-IN")}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          p.stock_quantity <= 5
                            ? "bg-rose-50 text-rose-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {p.stock_quantity} in stock
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
