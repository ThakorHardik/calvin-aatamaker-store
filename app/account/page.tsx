import { redirect } from "next/navigation";
import Link from "next/link";
import {
  User,
  ShoppingBag,
  Calendar,
  LogOut,
  ArrowRight,
  ShieldCheck,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Eye,
  HelpCircle,
  IndianRupee,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  order_number: string;
  total_amount: number;
  currency: string;
  order_status: string;
  payment_status: string;
  created_at: string;
};

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getOrderStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "delivered":
      return {
        label: "Delivered",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
        icon: CheckCircle2,
      };
    case "shipped":
      return {
        label: "Shipped",
        classes: "bg-cyan-50 text-cyan-800 border-cyan-200",
        icon: Truck,
      };
    case "processing":
      return {
        label: "Processing",
        classes: "bg-indigo-50 text-indigo-800 border-indigo-200",
        icon: Clock,
      };
    case "confirmed":
      return {
        label: "Confirmed",
        classes: "bg-blue-50 text-blue-800 border-blue-200",
        icon: CheckCircle2,
      };
    case "pending":
      return {
        label: "Pending",
        classes: "bg-amber-50 text-amber-800 border-amber-200",
        icon: Clock,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        classes: "bg-stone-100 text-stone-700 border-stone-200",
        icon: AlertCircle,
      };
    case "refunded":
      return {
        label: "Refunded",
        classes: "bg-purple-50 text-purple-800 border-purple-200",
        icon: AlertCircle,
      };
    default:
      return {
        label: status || "Unknown",
        classes: "bg-stone-100 text-stone-800 border-stone-200",
        icon: Clock,
      };
  }
}

function getPaymentStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
      return {
        label: "Paid",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    case "authorized":
      return {
        label: "Authorized",
        classes: "bg-blue-50 text-blue-800 border-blue-200",
      };
    case "pending":
      return {
        label: "Payment Pending",
        classes: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "failed":
      return {
        label: "Payment Failed",
        classes: "bg-red-50 text-red-800 border-red-200",
      };
    case "refunded":
      return {
        label: "Refunded",
        classes: "bg-purple-50 text-purple-800 border-purple-200",
      };
    default:
      return {
        label: status || "Pending",
        classes: "bg-stone-100 text-stone-700 border-stone-200",
      };
  }
}

export default async function AccountPage() {
  const supabase = await createClient();

  // 1. Verify authenticated user identity server-side
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?next=/account");
  }

  // 2. Fetch customer profile record
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  // 3. Fetch customer orders using authenticated client (RLS enforced + explicit customer_id scope)
  const { data: rawOrders } = await supabase
    .from("orders")
    .select(
      "id, order_number, total_amount, currency, order_status, payment_status, created_at"
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const orders: OrderRow[] = rawOrders ?? [];

  // Metrics calculated from actual records
  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum, order) => {
    // Only tally non-cancelled orders for total spent
    if (order.order_status?.toLowerCase() === "cancelled") {
      return sum;
    }
    return sum + (Number(order.total_amount) || 0);
  }, 0);

  const customerName =
    profile?.full_name?.trim() ||
    (user.user_metadata?.full_name as string)?.trim() ||
    "Valued Customer";

  const memberSince = (profile?.created_at || user.created_at)
    ? new Date(profile?.created_at || user.created_at).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      })
    : "Recently joined";

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
      <StorefrontHeader />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Top Greeting & Sign-Out Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Verified Customer Account</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              Hello, {customerName}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Signed in as <span className="font-medium text-stone-900">{user.email}</span>
            </p>
          </div>

          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-red-50 hover:text-red-700 hover:border-red-200 focus:outline-none focus:ring-2 focus:ring-red-100"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </form>
        </div>

        {/* Overview Stat Cards */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Total Orders
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700">
                <ShoppingBag className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-stone-900 font-display">
              {totalOrders}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {totalOrders === 1 ? "1 completed order" : `${totalOrders} orders on record`}
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Total Spent
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <IndianRupee className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-stone-900 font-display">
              {formatINR(totalSpent)}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Across active orders
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Member Since
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-lg font-bold tracking-tight text-stone-900 font-display truncate">
              {memberSince}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Calvin customer
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Account Status
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-lg font-bold tracking-tight text-stone-900 font-display">
              Active
            </p>
            <p className="mt-1 text-xs text-emerald-700 font-medium">
              Verified customer session
            </p>
          </div>
        </div>

        {/* Main Content: Orders (Left 2/3) + Profile Details (Right 1/3) */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Order History Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-stone-100 px-6 py-5">
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Order History
                </h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Track your domestic flour mill purchases and delivery status
                </p>
              </div>

              {orders.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                    <Package className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-stone-900">
                    No orders placed yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-stone-600 leading-relaxed">
                    Fresh, natural flour starts with Calvin. Explore our compact domestic
                    aatamaker models and place your first order.
                  </p>
                  <div className="mt-6">
                    <Link
                      href="/products"
                      className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-stone-900"
                    >
                      <span>Explore Aatamakers</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {orders.map((order) => {
                    const orderStatus = getOrderStatusBadge(order.order_status);
                    const paymentStatus = getPaymentStatusBadge(order.payment_status);
                    const StatusIcon = orderStatus.icon;

                    return (
                      <div
                        key={order.id}
                        className="p-5 sm:p-6 transition hover:bg-stone-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display font-bold text-stone-900 text-sm sm:text-base">
                              #{order.order_number}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${orderStatus.classes}`}
                            >
                              <StatusIcon className="h-3 w-3" />
                              <span>{orderStatus.label}</span>
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${paymentStatus.classes}`}
                            >
                              {paymentStatus.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-stone-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-stone-400" />
                              {formatDate(order.created_at)}
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-stone-900 text-sm">
                              {formatINR(Number(order.total_amount))}
                            </span>
                          </div>
                        </div>

                        <div>
                          <Link
                            href={`/account/orders/${order.id}`}
                            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 shadow-sm transition hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                          >
                            <Eye className="h-3.5 w-3.5 text-stone-500" />
                            <span>View Order</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Account Information & Help Column */}
          <div className="space-y-6">
            {/* Account Information Card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-stone-900">
                    Account Profile
                  </h3>
                  <p className="text-xs text-stone-500">Your registered identity</p>
                </div>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <div>
                  <span className="block font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                    Full Name
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-stone-900">
                    {customerName}
                  </span>
                </div>

                <div>
                  <span className="block font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                    Email Address
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-stone-900">
                    {user.email}
                  </span>
                </div>

                <div>
                  <span className="block font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                    Account Role
                  </span>
                  <span className="mt-0.5 inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                    Customer
                  </span>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-600">
                  Profile records are protected by database Row-Level Security. Name
                  or email modifications are verified through official support channels.
                </div>
              </div>
            </div>

            {/* Calvin Customer Care Card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-stone-900">
                    Help &amp; Support
                  </h3>
                  <p className="text-xs text-stone-500">Assistance with your flour mill</p>
                </div>
              </div>

              <p className="mt-4 text-xs text-stone-600 leading-relaxed">
                Have questions about your order, delivery timeline, or mill operation?
                Our customer support team is here to assist you.
              </p>

              <div className="mt-4 space-y-2 text-xs">
                <Link
                  href="/#help"
                  className="inline-flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 font-medium text-stone-800 hover:bg-stone-100 transition"
                >
                  <span>Frequently Asked Questions</span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                </Link>

                <Link
                  href="/products"
                  className="inline-flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 font-medium text-stone-800 hover:bg-stone-100 transition"
                >
                  <span>Browse Product Catalogue</span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <StorefrontFooter />
    </div>
  );
}
