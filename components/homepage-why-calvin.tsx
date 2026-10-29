import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./homepage-why-calvin.module.css";

const benefits = [
  {
    title: "Understand the product",
    description:
      "Explore product photos, dimensions and specifications before deciding which model suits your kitchen.",
  },
  {
    title: "Choose with clarity",
    description:
      "Review available models, compare listed prices and check stock information in one place.",
  },
  {
    title: "A straightforward shopping experience",
    description:
      "Keep your selection together and review your delivery details as you move through checkout.",
  },
];

export default function HomepageWhyCalvin() {
  return (
    <section
      id="why-calvin"
      className={styles.section}
      aria-labelledby="why-calvin-heading"
    >
      <div className={styles.container}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Why Calvin</p>

          <h2 id="why-calvin-heading" className={styles.heading}>
            A better fit for
            <br />
            <span>your everyday kitchen.</span>
          </h2>

          <p className={styles.description}>
            Choosing an Aatamaker starts with knowing what matters to you.
            Explore the details, understand your options and find a product that
            feels right for your home.
          </p>

          <Link href="/products" className={styles.cta}>
            Explore Aatamakers
            <ArrowRight size={18} />
          </Link>
        </div>

        <div className={styles.benefits}>
          {benefits.map((benefit) => (
            <article key={benefit.title} className={styles.benefit}>
              <div className={styles.benefitContent}>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </div>

              <ArrowRight
                className={styles.benefitArrow}
                size={19}
                aria-hidden="true"
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
