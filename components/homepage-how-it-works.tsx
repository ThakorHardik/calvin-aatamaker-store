import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
} from "lucide-react";

const steps = [
  {
    number: "01",
    icon: ClipboardList,
    title: "Explore the collection",
    description:
      "Compare the available Aatamaker models and review their features, dimensions and product details.",
  },
  {
    number: "02",
    icon: CheckCircle2,
    title: "Choose what suits your home",
    description:
      "Review the available options, check stock and select the product that fits your needs.",
  },
  {
    number: "03",
    icon: PackageCheck,
    title: "Continue to checkout",
    description:
      "Review your selection and enter your delivery details before placing your order.",
  },
];

export default function HomepageHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden bg-[#f5efe5] px-5 py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-[#b91f32]">
              <span className="h-px w-8 bg-[#b91f32]" />
              SIMPLE BY DESIGN
            </div>

            <h2 className="mt-5 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-[#241e1d] sm:text-4xl lg:text-5xl">
              Your next kitchen essential,
              <span className="text-[#b91f32]"> made simple.</span>
            </h2>

            <p className="mt-5 max-w-lg text-sm leading-7 text-stone-600 sm:text-base">
              From exploring the collection to reviewing your order, find the
              product information you need at every step.
            </p>

            <Link
              href="/products"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#b91f32] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#991b2b]"
            >
              Explore Aatamakers
              <ArrowRight size={17} />
            </Link>
          </div>

          <div className="border-t border-stone-300">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <article
                  key={step.number}
                  className="grid grid-cols-[42px_1fr] gap-4 border-b border-stone-300 py-6 sm:grid-cols-[52px_1fr] sm:gap-5 sm:py-7"
                >
                  <span className="pt-1 text-xs font-bold tracking-widest text-[#b91f32]">
                    {step.number}
                  </span>

                  <div className="flex gap-4 sm:gap-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-[#faf8f4] text-[#b91f32] sm:h-12 sm:w-12">
                      <Icon size={20} strokeWidth={1.7} />
                    </span>

                    <div className="flex-1">
                      <h3 className="text-lg font-semibold tracking-tight text-[#241e1d] sm:text-xl">
                        {step.title}
                      </h3>

                      <p className="mt-2 max-w-lg text-sm leading-6 text-stone-600">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-stone-300 pt-5 text-xs text-stone-500">
          <span>CALVIN AATAMAKER · MADE FOR HOME</span>
          <a
            href="#top"
            className="font-semibold transition hover:text-[#b91f32]"
          >
            Back to the top ↑
          </a>
        </div>
      </div>
    </section>
  );
}
