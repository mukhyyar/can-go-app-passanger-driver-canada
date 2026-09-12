import Link from 'next/link';
import { BrandLogo } from './brand-logo';

const TRAVELERS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#classes', label: 'Vehicle classes' },
  { href: '/book', label: 'Get offers' },
  { href: '/rides', label: 'My trips' },
  { href: '/#reviews', label: 'Reviews' },
  { href: '/destinations', label: 'Destinations' },
];

const PARTNERS = [
  { href: '/drivers', label: 'For drivers' },
  { href: '/business', label: 'For business' },
  { href: '/agents', label: 'For agents' },
  { href: '/feedback', label: 'Feedback' },
];

const COMPANY = [
  { href: '/support', label: 'Support' },
  { href: '/faq', label: 'FAQ' },
  { href: '/blog', label: 'Blog' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Service Agreement' },
];

const TRUST = ['Compare bids', 'See the car first', 'Pay after you choose'];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" id="support">
      <div className="footer-inner">
        <div className="footer-cta">
          <div className="footer-cta-copy">
            <p className="footer-cta-kicker">Marketplace transfers</p>
            <h2>Ready for your next trip?</h2>
            <p>Open a tender, compare driver bids, and book the offer that fits.</p>
          </div>
          <div className="footer-cta-actions">
            <Link href="/book" className="footer-cta-btn">
              Get offers
            </Link>
            <Link href="/#how" className="footer-cta-link">
              How it works
            </Link>
          </div>
        </div>

        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="brand-lockup invert" aria-label="CAN-RIDE home">
              <BrandLogo size={52} variant="lockup" invert />
            </Link>
            <p className="footer-lead">
              Marketplace transfers you compare and trust. Drivers bid. You choose the
              car and the fare.
            </p>
            <ul className="footer-trust" aria-label="Why travelers choose CAN-RIDE">
              {TRUST.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <nav className="footer-col" aria-label="Travelers">
            <h3>Travelers</h3>
            {TRAVELERS.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>

          <nav className="footer-col" aria-label="Partners">
            <h3>Partners</h3>
            {PARTNERS.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>

          <nav className="footer-col" aria-label="Company">
            <h3>Company</h3>
            {COMPANY.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="footer-col footer-contact">
            <h3>Contact</h3>
            <p>Trip help, payments, and account access.</p>
            <a className="footer-email" href="mailto:support@can-go.ca">
              support@can-go.ca
            </a>
            <Link href="/support" className="footer-contact-link">
              Visit support center
            </Link>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="copy">© {year} CAN-RIDE. All rights reserved.</p>
          <div className="footer-legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/faq">FAQ</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
