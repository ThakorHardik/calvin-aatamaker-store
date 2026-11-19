import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  Wheat,
} from "lucide-react";

interface HomepageHowItWorksProps {
  content?: Record<string, unknown>;
}

const defaultSteps = [
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

export default function HomepageHowItWorks({ content }: HomepageHowItWorksProps = {}) {
  const icons = [Wheat, ClipboardList, CheckCircle2, PackageCheck];
  const customSteps: Array<{ number: string; icon: typeof ClipboardList; title: string; description: string }> = [];

  if (content) {
    for (let i = 1; i <= 4; i++) {
      const t = content[`step${i}_title`];
      const d = content[`step${i}_desc`];
      if (typeof t === "string" && t.trim().length > 0) {
        customSteps.push({
          number: `0${i}`,
          icon: icons[(i - 1) % icons.length],
          title: t.trim(),
          description: typeof d === "string" ? d.trim() : "",
        });
      }
    }
  }

  const steps = customSteps.length > 0 ? customSteps : defaultSteps;

  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden border-b border-[#EAE3D8] bg-[#FAF7F2] px-5 py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-[#BD2031]">
              <span className="h-px w-8 bg-[#BD2031]" />
              SIMPLE BY DESIGN
            </div>

            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.03em] text-[#141211] sm:text-4xl lg:text-5xl">
              Your next kitchen essential,
              <br />
              <span className="font-normal italic text-[#BD2031]">made simple.</span>
            </h2>

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-[#5E5854] sm:text-base">
              From exploring the collection to reviewing your order, find the
              product information you need at every step.
            </p>

            <Link
              href="/products"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#141211] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#BD2031]"
            >
              <span>Explore Aatamakers</span>
              <ArrowRight size={17} />
            </Link>
          </div>

          <div className="border-t border-[#EAE3D8]">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <article
                  key={step.number}
                  className="grid grid-cols-[48px_1fr] gap-4 border-b border-[#EAE3D8] py-6 sm:grid-cols-[56px_1fr] sm:gap-5 sm:py-7"
                >
                  <div className="pt-1">
                    <span className="inline-block rounded-md bg-[#141211] px-2 py-0.5 text-[11px] font-bold tracking-wider text-[#D9B88F]">
                      {step.number}
                    </span>
                  </div>

                  <div className="flex gap-4 sm:gap-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#EAE3D8] bg-white text-[#BD2031] shadow-[0_1px_3px_rgba(20,18,17,0.04)] sm:h-12 sm:w-12">
                      <Icon size={20} strokeWidth={1.7} />
                    </span>

                    <div className="flex-1">
                      <h3 className="font-display text-base font-bold tracking-tight text-[#141211] sm:text-lg">
                        {step.title}
                      </h3>

                      <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-[#5E5854] sm:text-sm">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#EAE3D8] pt-5 text-xs text-[#8A827D]">
          <span className="font-medium tracking-wide">CALVIN AATAMAKER · DESIGNED FOR EVERYDAY KITCHENS</span>
          <a
            href="#top"
            className="font-semibold text-[#141211] transition-colors hover:text-[#BD2031]"
          >
            Back to the top ↑
          </a>
        </div>
      </div>
    </section>
  );
}
