import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function StorefrontFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <Link
          href="/"
          className="footer-logo"
          aria-label="Calvin Aatamaker home"
        >
          <Image
            src="/images/calvin-aatamaker-logo.png"
            alt="Calvin Aatamaker"
            width={150}
            height={65}
          />
        </Link>

        <p>
          Fresh flour feels like home.
          <br />A more thoughtful way to mill every day.
        </p>

        <nav className="footer-nav" aria-label="Footer navigation">
          <Link href="/products">Shop Aatamakers</Link>
          <Link href="/#why-calvin">Our approach</Link>
          <Link href="/#personalise">Personalise</Link>
          <Link href="/#help">Help &amp; support</Link>
        </nav>
      </div>

      <div className="footer-bottom">
        <span>© {year} Calvin Aatamaker. All rights reserved.</span>

        <span className="demo-notice">
          Website preview · Product prices and contact details are subject to
          confirmation.
        </span>

        <Link href="/admin">
          Admin panel <ArrowRight size={13} />
        </Link>
      </div>
    </footer>
  );
}
