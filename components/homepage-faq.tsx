"use client";

import { useState } from "react";
import { Plus, Minus, ArrowRight } from "lucide-react";
import Link from "next/link";
import styles from "./homepage-faq.module.css";

const faqs = [
  {
    question: "How do I choose the right Aatamaker?",
    answer:
      "Explore the collection and compare the available product details, dimensions and specifications before choosing a model for your home.",
  },
  {
    question: "Where can I find product specifications?",
    answer:
      "Open a product detail page to view its available images, specifications, dimensions and listed price.",
  },
  {
    question: "How can I check delivery availability?",
    answer:
      "Delivery availability, charges and estimated dates should be confirmed once the store's shipping rules are configured.",
  },
  {
    question: "Can I personalise my Aatamaker?",
    answer:
      "The personalisation experience is currently in development. Custom artwork ordering is not available yet.",
  },
  {
    question: "Which payment methods can I use?",
    answer:
      "Online payment integration is planned for a later stage. This website is currently being prepared as a development preview.",
  },
];

export default function HomepageFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-heading">
      <div className={styles.container}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Help & support</p>

          <h2 id="faq-heading" className={styles.heading}>
            Questions,
            <br />
            <span>answered.</span>
          </h2>

          <p className={styles.description}>
            Everything you need to know before choosing your Aatamaker. Find
            product information and answers to common questions below.
          </p>

          <Link href="/products" className={styles.link}>
            Explore products
            <ArrowRight size={17} />
          </Link>
        </div>

        <div className={styles.faqList}>
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const answerId = `faq-answer-${index}`;

            return (
              <article
                key={faq.question}
                className={`${styles.item} ${isOpen ? styles.itemOpen : ""}`}
              >
                <button
                  type="button"
                  className={styles.question}
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                >
                  <span>{faq.question}</span>
                  <span className={styles.toggle}>
                    {isOpen ? <Minus size={17} /> : <Plus size={17} />}
                  </span>
                </button>

                {isOpen && (
                  <div id={answerId} className={styles.answer}>
                    <p>{faq.answer}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
