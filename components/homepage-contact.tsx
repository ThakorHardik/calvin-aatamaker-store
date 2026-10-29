import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import styles from "./homepage-contact.module.css";

export default function HomepageContact() {
  return (
    <section
      id="help"
      className={styles.section}
      aria-labelledby="homepage-contact-heading"
    >
      <div className={styles.container}>
        <div className={styles.content}>
          <p className={styles.eyebrow}>Here to help</p>

          <h2 id="homepage-contact-heading" className={styles.heading}>
            Finding the right
            <br />
            <span>Aatamaker starts here.</span>
          </h2>

          <p className={styles.description}>
            Have questions about our products? Explore the collection to review
            the available models, product details and specifications.
          </p>

          <div className={styles.actions}>
            <Link href="/products" className={styles.primaryButton}>
              Explore products
              <ArrowRight size={17} />
            </Link>

            <a
              href="mailto:hello@calvinaatamaker.example?subject=Calvin%20Aatamaker%20enquiry"
              className={styles.secondaryButton}
            >
              <Mail size={17} />
              Send an enquiry
            </a>
          </div>
        </div>

        <div className={styles.supportPanel}>
          <div className={styles.supportIcon}>
            <Mail size={23} strokeWidth={1.6} />
          </div>

          <h3>Need a little guidance?</h3>

          <p>
            Get in touch with the team for help choosing a product for your
            home.
          </p>

          <a
            href="mailto:hello@calvinaatamaker.example?subject=Calvin%20Aatamaker%20enquiry"
            className={styles.supportLink}
          >
            Contact us
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}
