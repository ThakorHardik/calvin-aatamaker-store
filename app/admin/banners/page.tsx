"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { supabase } from "@/lib/supabase/client";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  media_type: "image" | "video";
  media_path: string;
  alt_text: string | null;
  button_label: string | null;
  button_href: string | null;
  sort_order: number;
  display_seconds: number;
  is_active: boolean;
  created_at: string;
};
type FormState = {
  title: string;
  subtitle: string;
  media_type: "image" | "video";
  alt_text: string;
  button_label: string;
  button_href: string;
  sort_order: number;
  display_seconds: number;
  is_active: boolean;
};
const blankForm: FormState = {
  title: "",
  subtitle: "",
  media_type: "image",
  alt_text: "",
  button_label: "",
  button_href: "/products",
  sort_order: 0,
  display_seconds: 5,
  is_active: false,
};
const fieldClass =
  "mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100";

export default function BannerManagerPage() {
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [banners, setBanners] = useState<Banner[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [currentMediaPath, setCurrentMediaPath] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!mediaFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  const loadBanners = useCallback(async () => {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) {
      setMessage(`Could not load banners: ${error.message}`);
      return;
    }
    setBanners((data ?? []) as Banner[]);
  }, []);

  const verifyAdmin = useCallback(
    async (id: string, userEmail = "") => {
      setUserId(id);

      const { data, error } = await supabase
        .from("profiles")
        .select("role, email")
        .eq("id", id)
        .maybeSingle();

      if (error || data?.role !== "admin") {
        setIsAdmin(false);
        setMessage(
          error?.message ?? "This account does not have administrator access.",
        );
        setChecking(false);
        return;
      }

      setEmail(data.email ?? userEmail);
      setIsAdmin(true);
      setMessage("");

      // Stop showing the administrator-checking screen.
      setChecking(false);

      // Fetch banners independently.
      void loadBanners();
    },
    [loadBanners],
  );

  useEffect(() => {
    let mounted = true;
    async function initialise() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        setMessage(error.message);
        setChecking(false);
        return;
      }
      if (data.session)
        await verifyAdmin(data.session.user.id, data.session.user.email ?? "");
      else setChecking(false);
    }
    void initialise();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !session) {
        setUserId("");
        setIsAdmin(false);
        setBanners([]);
        setChecking(false);
        return;
      }
      // Avoid Supabase calls inside the auth callback; schedule only after sign-in.
      if (event === "SIGNED_IN") {
        window.setTimeout(() => {
          if (mounted)
            void verifyAdmin(session.user.id, session.user.email ?? "");
        }, 0);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [verifyAdmin]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    setPassword("");
    if (error) setMessage(error.message);
    // The SIGNED_IN listener runs verifyAdmin after the auth callback returns.
  }
  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
  }
  function chooseMedia(file: File | null) {
    if (!file) return;
    const supported = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "video/mp4",
      "video/webm",
    ];
    if (!supported.includes(file.type)) {
      setMessage("Choose a JPG, PNG, WebP, AVIF, MP4 or WebM file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("Banner files must be 10 MB or smaller on this form.");
      return;
    }
    setMediaFile(file);
    setForm((current) => ({
      ...current,
      media_type: file.type.startsWith("video/") ? "video" : "image",
    }));
    setMessage("");
  }
  function resetForm() {
    setEditingId(null);
    setMediaFile(null);
    setCurrentMediaPath("");
    setForm({ ...blankForm, sort_order: banners.length });
    setMessage("");
  }
  function startEditing(banner: Banner) {
    setEditingId(banner.id);
    setMediaFile(null);
    setCurrentMediaPath(banner.media_path);
    setForm({
      title: banner.title,
      subtitle: banner.subtitle ?? "",
      media_type: banner.media_type,
      alt_text: banner.alt_text ?? "",
      button_label: banner.button_label ?? "",
      button_href: banner.button_href ?? "",
      sort_order: banner.sort_order,
      display_seconds: banner.display_seconds,
      is_active: banner.is_active,
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function publicMediaUrl(path: string) {
    return supabase.storage.from("banner-media").getPublicUrl(path).data
      .publicUrl;
  }

  async function saveBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      setMessage("Please sign in again.");
      return;
    }
    if (!mediaFile && !currentMediaPath) {
      setMessage("Choose an image or video for this banner.");
      return;
    }
    if (form.display_seconds < 2 || form.display_seconds > 30) {
      setMessage("Display duration must be between 2 and 30 seconds.");
      return;
    }
    setBusy(true);
    setMessage("");
    let uploadedPath = "";
    try {
      let mediaPath = currentMediaPath;
      if (mediaFile) {
        const ext = mediaFile.name.split(".").pop()?.toLowerCase() || "bin";
        uploadedPath = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("banner-media")
          .upload(uploadedPath, mediaFile, {
            contentType: mediaFile.type,
            upsert: false,
          });
        if (error) throw error;
        mediaPath = uploadedPath;
      }
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        media_type: form.media_type,
        media_path: mediaPath,
        alt_text: form.alt_text.trim() || null,
        button_label: form.button_label.trim() || null,
        button_href: form.button_href.trim() || null,
        sort_order: Number(form.sort_order),
        display_seconds: Number(form.display_seconds),
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };
      const result = editingId
        ? await supabase.from("banners").update(payload).eq("id", editingId)
        : await supabase
            .from("banners")
            .insert({ ...payload, created_by: userId });
      if (result.error) throw result.error;
      const successMessage = editingId
        ? "Banner updated successfully."
        : "Banner created successfully.";
      resetForm();
      setMessage(successMessage);
      await loadBanners();
    } catch (error) {
      if (uploadedPath)
        await supabase.storage.from("banner-media").remove([uploadedPath]);
      setMessage(
        error instanceof Error ? error.message : "Unable to save the banner.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteBanner(banner: Banner) {
    if (!window.confirm(`Delete “${banner.title}”? This cannot be undone.`))
      return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("banners")
      .delete()
      .eq("id", banner.id);
    if (error) setMessage(error.message);
    else {
      await supabase.storage.from("banner-media").remove([banner.media_path]);
      if (editingId === banner.id) resetForm();
      setMessage("Banner deleted.");
      await loadBanners();
    }
    setBusy(false);
  }

  if (checking)
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-stone-500">
        <LoaderCircle className="mr-2 animate-spin" size={18} /> Checking
        administrator access…
      </div>
    );
  if (!isAdmin)
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-5">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md space-y-5 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
            Calvin Aatamaker
          </p>
          <h1 className="text-2xl font-bold">Admin sign in</h1>
          <p className="text-sm text-stone-500">
            Sign in with the authorised administrator account.
          </p>
          <label className="block text-sm font-medium">
            Email
            <input
              className={fieldClass}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className={fieldClass}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && (
            <p role="alert" className="break-words text-sm text-red-700">
              {message}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );

  return (
    <main className="min-h-screen bg-[#f7f7f5]">
      <header className="border-b border-stone-200 bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
              Store content
            </p>
            <h1 className="mt-1 text-2xl font-bold">Homepage banners</h1>
            <p className="mt-1 text-sm text-stone-500">
              Manage the images, videos and messages visitors see first.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void loadBanners()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold"
            >
              <RefreshCw size={15} /> Refresh
            </button>
            <button
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus size={16} /> New banner
            </button>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1500px] gap-6 p-5 lg:grid-cols-[420px_1fr] sm:p-8">
        <section className="h-fit rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-bold">
              {editingId ? "Edit banner" : "Create a banner"}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Add a message, choose media and control the rotation.
            </p>
          </div>
          <form onSubmit={saveBanner} className="space-y-4">
            <label className="block text-sm font-medium">
              Banner title *
              <input
                className={fieldClass}
                required
                maxLength={150}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Subtitle / description
              <textarea
                className={fieldClass}
                rows={3}
                maxLength={500}
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              />
            </label>
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
                e.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                chooseMedia(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`rounded-2xl border-2 border-dashed p-5 transition ${isDragging ? "border-red-600 bg-red-50" : "border-stone-300 bg-stone-50 hover:border-red-400"}`}
            >
              <label className="flex cursor-pointer flex-col items-center text-center">
                <Upload size={24} className="text-red-700" />
                <span className="mt-2 text-sm font-semibold">
                  {isDragging
                    ? "Drop media here"
                    : mediaFile
                      ? mediaFile.name
                      : currentMediaPath
                        ? "Replace current media or keep it"
                        : "Drag an image or video here"}
                </span>
                <span className="mt-1 text-xs text-stone-500">
                  Or browse · JPG, PNG, WebP, AVIF, MP4, WebM · 10 MB max
                </span>
                <input
                  type="file"
                  className="sr-only"
                  accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    chooseMedia(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              {previewUrl && (
                <div className="mt-4 border-t border-stone-200 pt-4">
                  {form.media_type === "video" ? (
                    <video
                      src={previewUrl}
                      controls
                      className="max-h-56 w-full rounded-xl bg-stone-900 object-contain"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Selected banner preview"
                      className="max-h-56 w-full rounded-xl object-contain"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setMediaFile(null)}
                    className="mt-2 text-sm font-semibold text-red-700"
                  >
                    Remove selected file
                  </button>
                </div>
              )}
              {!previewUrl && currentMediaPath && (
                <div className="mt-4 border-t border-stone-200 pt-4">
                  {form.media_type === "video" ? (
                    <video
                      src={publicMediaUrl(currentMediaPath)}
                      controls
                      className="max-h-56 w-full rounded-xl bg-stone-900 object-contain"
                    />
                  ) : (
                    <img
                      src={publicMediaUrl(currentMediaPath)}
                      alt={form.alt_text || form.title}
                      className="max-h-56 w-full rounded-xl object-contain"
                    />
                  )}
                </div>
              )}
            </div>
            <label className="block text-sm font-medium">
              Image description (alt text)
              <input
                className={fieldClass}
                value={form.alt_text}
                onChange={(e) => setForm({ ...form, alt_text: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Button label
                <input
                  className={fieldClass}
                  value={form.button_label}
                  onChange={(e) =>
                    setForm({ ...form, button_label: e.target.value })
                  }
                  placeholder="Shop now"
                />
              </label>
              <label className="block text-sm font-medium">
                Button destination
                <input
                  className={fieldClass}
                  value={form.button_href}
                  onChange={(e) =>
                    setForm({ ...form, button_href: e.target.value })
                  }
                  placeholder="/products"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Display order
                <input
                  className={fieldClass}
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number(e.target.value) })
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                Seconds per banner
                <input
                  className={fieldClass}
                  type="number"
                  min="2"
                  max="30"
                  value={form.display_seconds}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      display_seconds: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-stone-50 p-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
                className="h-4 w-4 accent-red-700"
              />{" "}
              Publish on public homepage
            </label>
            {message && (
              <p role="status" className="break-words text-sm text-red-700">
                {message}
              </p>
            )}
            <div className="flex gap-2">
              <button
                disabled={busy}
                className="flex-1 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Create banner"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Your banners</h2>
              <p className="mt-1 text-sm text-stone-500">
                {banners.length} saved ·{" "}
                {banners.filter((b) => b.is_active).length} enabled · ordered by
                display order
              </p>
            </div>
            <button
              onClick={() => void loadBanners()}
              disabled={busy}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold"
            >
              Refresh list
            </button>
          </div>
          {banners.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
              <ImagePlus size={32} className="mx-auto text-stone-300" />
              <h3 className="mt-3 font-semibold">No banners yet</h3>
              <p className="mt-1 text-sm text-stone-500">
                Create your first homepage banner using the form.
              </p>
            </div>
          ) : (
            banners.map((banner) => (
              <article
                key={banner.id}
                className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
              >
                <div className="grid md:grid-cols-[230px_1fr]">
                  <div className="bg-stone-100">
                    {banner.media_type === "video" ? (
                      <video
                        src={publicMediaUrl(banner.media_path)}
                        controls
                        className="h-full max-h-56 min-h-40 w-full object-contain"
                      />
                    ) : (
                      <img
                        src={publicMediaUrl(banner.media_path)}
                        alt={banner.alt_text ?? banner.title}
                        className="h-full max-h-56 min-h-40 w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{banner.title}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${banner.is_active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}
                        >
                          {banner.is_active ? "Published" : "Draft"}
                        </span>
                      </div>
                      {banner.subtitle && (
                        <p className="mt-2 text-sm leading-6 text-stone-600">
                          {banner.subtitle}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-stone-500">
                        Order {banner.sort_order} · {banner.display_seconds}s ·{" "}
                        {banner.media_type}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditing(banner)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void deleteBanner(banner)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
