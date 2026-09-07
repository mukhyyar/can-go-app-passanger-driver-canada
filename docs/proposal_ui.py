# -*- coding: utf-8 -*-
"""
CAN-GO high-fidelity UI library for the development proposal.
Covers passenger (P-*), driver (D-*), and admin (A-*) inventory screens.
"""
from __future__ import annotations

MAPLE = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{w}" height="{h}" aria-label="CAN-GO">
  <path fill="#C8102E" d="M32 6l3 9 9-3-3 9 9 4-10 2 4 10-9-5-2 12-2-12-9 5 4-10-10-2 9-4-3-9 9 3 3-9z"/>
  <rect x="30" y="48" width="4" height="10" fill="#C8102E"/>
</svg>'''


def sb(city: str = "Toronto") -> str:
    return f'<div class="sb"><span>9:41</span><span>{city} · 5G ▮▮▮</span></div>'


def tabs(active: str, kind: str = "p") -> str:
    if kind == "d":
        items = [("Requests", "Requests"), ("Bookings", "Bookings"), ("Earn", "Earn"), ("Profile", "Profile")]
    else:
        items = [("Home", "Home"), ("Bookings", "Bookings"), ("Inbox", "Inbox"), ("Profile", "Profile")]
    return '<div class="tabs">' + "".join(
        f'<span class="{"on" if a == active else ""}">{l}</span>' for a, l in items
    ) + "</div>"


def phone(inner: str, caption: str) -> str:
    return f"""
<div class="viz-item">
  <div class="hf-phone"><div class="hf-screen">{inner}</div><div class="hf-home"></div></div>
  <div class="hf-caption">{caption}</div>
</div>"""


def browser(title: str, pill: str, body: str, caption: str, active: str = "Dashboard") -> str:
    items = [
        "Dashboard", "Customers", "Drivers", "Vehicles", "Requests", "Offers",
        "Bookings", "Finance", "Disputes", "Support", "Settings",
    ]
    # Keep sidebar readable — show core + mark active
    core = ["Dashboard", "Customers", "Drivers", "Requests", "Bookings", "Finance", "Settings"]
    if active not in core:
        core = core[:-1] + [active, "Settings"]
    nav = "".join(f'<div class="nav {"on" if n == active else ""}">{n}</div>' for n in core)
    return f"""
<div class="viz-item viz-admin">
  <div class="browser">
    <div class="bbar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <div class="url">admin.can-go.app · {pill}</div></div>
    <div class="bbody">
      <div class="aside"><div style="font-weight:900;color:#C8102E;margin-bottom:14px;letter-spacing:.04em;">CAN-GO</div>{nav}</div>
      <div class="main"><h2>{title}</h2><div class="sub"><span class="id-pill">{pill}</span> High-fidelity design</div>{body}</div>
    </div>
  </div>
  <div class="hf-caption" style="max-width:680px;">{caption}</div>
</div>"""


def form_phone(
    meta: str,
    title: str,
    fields: list[tuple[str, str]],
    cta: str,
    caption: str,
    chips: str = "",
    extra: str = "",
    show_tabs: str | None = None,
) -> str:
    fh = "".join(f'<div class="field"><strong>{k}</strong>{v}</div>' for k, v in fields)
    tab = tabs(show_tabs) if show_tabs else ""
    return phone(
        sb()
        + f'<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">{meta}</span></div>'
        + f'<div style="padding:14px 16px;text-align:left;flex:1;overflow:hidden;">{chips}'
        + f'<div style="font-size:18px;font-weight:900;margin-bottom:4px;">{title}</div>{fh}{extra}'
        + (f'<div class="btn">{cta}</div>' if cta else "")
        + "</div>"
        + tab,
        caption,
    )


def list_phone(
    meta: str,
    title: str,
    cards: list[str],
    caption: str,
    cta: str = "",
    show_tabs: str | None = None,
    kind: str = "p",
) -> str:
    tab = tabs(show_tabs, kind) if show_tabs else ""
    return phone(
        sb()
        + f'<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">{meta}</span></div>'
        + f'<div style="padding:12px 14px;text-align:left;flex:1;overflow:hidden;">'
        + f'<div style="font-size:17px;font-weight:900;margin-bottom:8px;">{title}</div>'
        + "".join(cards)
        + (f'<div class="btn">{cta}</div>' if cta else "")
        + "</div>"
        + tab,
        caption,
    )


def viz_strip(title: str, screens_html: str, note: str = "") -> str:
    n = f'<p class="viz-note">{note}</p>' if note else ""
    return f"""
<div class="viz-strip">
  <div class="viz-head"><span class="tag">UI DESIGN</span> <b>{title}</b></div>
  {n}
  <div class="viz-row">{screens_html}</div>
</div>"""


def build_screens() -> dict[str, str]:
    """Full inventory of high-fidelity CAN-GO screens keyed for appendix injection."""
    s: dict[str, str] = {}

    # ── Passenger ──────────────────────────────────────────────
    s["p01"] = phone(
        sb()
        + f"""
<div class="splash">
  {MAPLE.format(w=88, h=88)}
  <div class="brand">CAN-GO</div>
  <div class="tagline">Your next transfer starts here</div>
  <div style="width:100%;margin-top:36px;">
    <div class="btn">Get started</div>
    <div class="btn-out">I have an account</div>
  </div>
</div>""",
        "<b>P-01 Splash</b> — Brand first open",
    )

    s["p02"] = form_phone(
        "Locale",
        "Language & country",
        [
            ("COUNTRY", "🇨🇦 Canada"),
            ("LANGUAGE", "English"),
            ("CURRENCY", "CAD $"),
        ],
        "Continue",
        "<b>P-02 Locale</b> — Country / language",
    )

    s["p03"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Onboarding</span></div>
<div style="padding:20px 16px;text-align:left;flex:1;">
  <div style="font-size:20px;font-weight:900;margin-bottom:10px;">How CAN-GO works</div>
  <div class="card"><b>1. Request</b><br><span style="font-size:11px;color:#5C5C5C;">Tell us where &amp; when</span></div>
  <div class="card"><b>2. Compare offers</b><br><span style="font-size:11px;color:#5C5C5C;">Drivers bid with real cars &amp; prices</span></div>
  <div class="card"><b>3. Pay &amp; ride</b><br><span style="font-size:11px;color:#5C5C5C;">Choose once — then track live</span></div>
  <div class="btn">Got it — continue</div>
</div>""",
        "<b>P-03 Onboarding</b> — Tender model explained",
    )

    s["p04"] = form_phone(
        "Login",
        "Welcome back",
        [("EMAIL OR PHONE", "+1 (416) 555-0142"), ("PASSWORD", "••••••••")],
        "Log in",
        "<b>P-04 Login</b>",
        extra='<p style="font-size:12px;color:#C8102E;font-weight:800;margin-top:12px;">Forgot password?</p>',
    )

    s["p05"] = form_phone(
        "Sign up",
        "Create account",
        [
            ("FULL NAME", "Priya Patel"),
            ("EMAIL", "priya@email.com"),
            ("PHONE", "+1 (416) 555-0142"),
            ("PASSWORD", "••••••••"),
        ],
        "Create account",
        "<b>P-05 Sign up</b>",
    )

    s["p06"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Verify</span></div>
<div style="padding:22px 16px;text-align:left;flex:1;">
  <div style="font-size:22px;font-weight:900;margin-bottom:6px;">Verify your phone</div>
  <p style="font-size:12px;color:#5C5C5C;margin:0 0 18px;">Code sent to +1 (416) •••• 4821</p>
  <div style="display:flex;gap:8px;justify-content:center;margin:18px 0 8px;">
"""
        + "".join(
            f'<div style="width:38px;height:48px;border:1.5px solid #C8102E;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;background:#FDECEF;">{c}</div>'
            for c in "4 8 2 1 · ·".split()
        )
        + """
  </div>
  <div class="btn">Verify &amp; continue</div>
  <p style="text-align:center;font-size:12px;color:#C8102E;margin-top:14px;font-weight:800;">Resend · 0:28</p>
</div>""",
        "<b>P-06 OTP</b>",
    )

    s["p07"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Passenger</span></div>
<div class="map">
  <div class="road-h"></div><div class="road-v"></div>
  <div class="pin" style="top:42%;left:38%;"></div>
  <div class="search-pill"><strong>WHERE TO?</strong>YYZ Airport · Terminal 1</div>
</div>
<div class="sheet">
  <span class="chip">Tender marketplace</span>
  <h3 style="margin-top:8px;">Plan your transfer</h3>
  <p>Create a request — drivers send priced offers with real vehicle photos before you pay.</p>
  <div class="btn">Create transfer request</div>
</div>
"""
        + tabs("Home"),
        "<b>P-07 Home</b> — Map + book",
    )

    s["p08"] = list_phone(
        "Service",
        "Choose service type",
        [
            '<div class="card sel"><b>Airport transfer</b><br><span style="font-size:11px;color:#5C5C5C;">Flight · meet &amp; greet</span></div>',
            '<div class="card"><b>One-way city</b><br><span style="font-size:11px;color:#5C5C5C;">Point to point</span></div>',
            '<div class="card"><b>Hourly chauffeur</b><br><span style="font-size:11px;color:#5C5C5C;">By the hour</span></div>',
            '<div class="card"><b>Return trip</b><br><span style="font-size:11px;color:#5C5C5C;">Outbound + return</span></div>',
        ],
        "<b>P-08 Service type</b>",
        "Continue",
    )

    s["p09"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Pickup</span></div>
<div class="map" style="flex:1;">
  <div class="road-h"></div><div class="road-v"></div>
  <div class="pin" style="top:48%;left:40%;"></div>
  <div class="search-pill"><strong>PICKUP</strong>YYZ Terminal 1 · Arrivals</div>
</div>
<div class="sheet"><h3>Confirm pickup</h3><p>Drag the pin or search an address.</p><div class="btn">Confirm pickup</div></div>""",
        "<b>P-09 Pickup map</b>",
    )

    s["p10"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Drop-off</span></div>
<div class="map" style="flex:1;">
  <div class="road-h"></div><div class="road-v"></div>
  <div class="pin" style="top:35%;left:62%;"></div>
  <div class="search-pill"><strong>DROPOFF</strong>King St W · Downtown Toronto</div>
</div>
<div class="sheet"><h3>Confirm destination</h3><p>~28 km · ~35 min typical</p><div class="btn">Confirm drop-off</div></div>""",
        "<b>P-10 Destination</b>",
    )

    s["p11"] = form_phone(
        "Schedule",
        "Date & time",
        [("DATE", "Fri, Sep 12, 2026"), ("TIME", "14:30 EDT"), ("TIMEZONE", "America/Toronto")],
        "Continue",
        "<b>P-11 Date/time</b>",
    )

    s["p12"] = form_phone(
        "Capacity",
        "Passengers & luggage",
        [("ADULTS", "2"), ("CHILDREN", "0"), ("LUGGAGE", "2 large · 1 cabin"), ("CHILD SEAT", "Optional")],
        "Continue",
        "<b>P-12 Pax / luggage</b>",
    )

    s["p13"] = form_phone(
        "Options",
        "Airport & extras",
        [
            ("FLIGHT", "AC123 · YYZ"),
            ("MEET & GREET", "Yes · name board: Patel"),
            ("WAIT TIME", "60 min included preferred"),
            ("NOTES", "Prefer quiet ride"),
        ],
        "Continue",
        "<b>P-13 Options</b>",
    )

    s["p14"] = form_phone(
        "Review",
        "Airport transfer",
        [
            ("PICKUP", "YYZ Terminal 1 · Arrivals"),
            ("DROPOFF", "Downtown Toronto · King St W"),
            ("WHEN", "Sep 12 · 14:30 EDT · AC123"),
            ("PASSENGERS / LUGGAGE", "2 adults · 2 bags · Meet & greet"),
            ("NOTES", "Child seat optional · Name board: Patel"),
        ],
        "Submit request",
        "<b>P-14 Request review</b>",
    )

    s["p15"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Waiting</span></div>
<div style="padding:16px;text-align:left;flex:1;">
  <div style="background:#FDECEF;border-radius:14px;padding:14px;margin-bottom:12px;">
    <div style="font-weight:800;font-size:14px;color:#C8102E;">Waiting for driver offers</div>
    <div style="font-size:11px;color:#5C5C5C;margin-top:6px;">We notified eligible drivers near your route. First offers usually arrive in a few minutes.</div>
  </div>
  <div class="card"><div class="mini"><span>Request</span><span>CG-R-9021</span></div>
  <div class="mini"><span>Status</span><span class="pill-warn">Open</span></div>
  <div class="mini"><span>Offers so far</span><span><b>0</b></span></div></div>
  <div class="btn-out">Edit request</div>
</div>""",
        "<b>P-15 Waiting</b>",
    )

    s["p16"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Live · 3 offers</span></div>
<div style="padding:14px;text-align:left;flex:1;">
  <div style="background:#FDECEF;border-radius:14px;padding:12px;margin-bottom:10px;">
    <div style="font-weight:800;font-size:13px;color:#C8102E;">Drivers are bidding on your trip</div>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:8px;">
    <span class="chip">Recommended</span>
    <span class="chip" style="background:#F0F0F0;color:#666;">Lowest $</span>
    <span class="chip" style="background:#F0F0F0;color:#666;">Top rated</span>
  </div>
  <div class="card sel"><div class="row"><div class="avatar">MK</div>
    <div style="flex:1;"><b>Marco K. · 4.94★</b><br><span style="font-size:11px;color:#5C5C5C;">Mercedes V-Class · 412 trips</span></div>
    <div style="font-weight:900;font-size:16px;">$86</div></div></div>
  <div class="card"><div class="row"><div class="avatar">AL</div>
    <div style="flex:1;"><b>Ana L. · 4.82★</b><br><span style="font-size:11px;color:#5C5C5C;">Toyota Highlander · 128 trips</span></div>
    <div style="font-weight:900;font-size:16px;">$74</div></div></div>
  <div class="btn">Compare &amp; select</div>
</div>""",
        "<b>P-16 Offer list</b>",
    )

    s["p17"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Offer detail</span></div>
<div style="padding:14px;text-align:left;flex:1;overflow:hidden;">
  <div class="row"><div class="avatar">MK</div>
    <div><b>Marco K.</b><div class="stars">★★★★★</div>
    <span style="font-size:11px;color:#5C5C5C;">4.94 · 412 trips · EN/FR</span></div></div>
  <div class="photo-strip"><div class="photo">Exterior</div><div class="photo">Interior</div><div class="photo">Trunk</div></div>
  <div class="price">CAD $86.00</div>
  <p style="font-size:11px;color:#5C5C5C;margin:0;">Includes 60 min wait · tolls · meet &amp; greet</p>
  <div class="mini"><span>Driver offer</span><span>$78.00</span></div>
  <div class="mini"><span>Platform fee + tax</span><span>$8.00</span></div>
  <div class="mini"><span><b>Total</b></span><span><b>$86.00</b></span></div>
  <div class="btn">Select offer &amp; pay</div>
</div>""",
        "<b>P-17 Offer detail</b>",
    )

    s["p18"] = form_phone(
        "Payment",
        "Pay securely",
        [
            ("CARD", "Visa ·••• 4242"),
            ("BILLING", "Toronto, ON"),
            ("TOTAL", "CAD $86.00"),
        ],
        "Pay now",
        "<b>P-18 Payment</b>",
        extra='<p style="font-size:11px;color:#5C5C5C;margin-top:8px;">Booking confirms only after successful payment.</p>',
    )

    s["p19"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Confirmed</span></div>
<div style="padding:28px 16px;text-align:center;flex:1;">
  <div style="width:64px;height:64px;border-radius:50%;background:#E8F8EF;color:#1B7A45;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;margin:0 auto 14px;">✓</div>
  <div style="font-size:20px;font-weight:900;">Booking confirmed</div>
  <p style="font-size:12px;color:#5C5C5C;">CG-10428 · Marco K. · Sep 12 · 14:30</p>
  <div class="card" style="text-align:left;"><div class="mini"><span>Vehicle</span><span>V-Class · AB-4821</span></div>
  <div class="mini"><span>Pickup</span><span>YYZ T1</span></div></div>
  <div class="btn">View booking</div>
</div>""",
        "<b>P-19 Confirmed</b>",
    )

    s["p20"] = list_phone(
        "Bookings",
        "Your transfers",
        [
            '<div style="display:flex;gap:6px;margin-bottom:8px;"><span class="chip">Upcoming</span><span class="chip" style="background:#F0F0F0;color:#666;">Past</span></div>',
            '<div class="card sel"><b>YYZ → King St</b><br><span style="font-size:11px;color:#5C5C5C;">Sep 12 · 14:30 · Confirmed</span></div>',
            '<div class="card"><b>Union → Pearson</b><br><span style="font-size:11px;color:#5C5C5C;">Aug 2 · Completed</span></div>',
        ],
        "<b>P-20 Bookings list</b>",
        show_tabs="Bookings",
    )

    s["p21"] = form_phone(
        "Booking",
        "CG-10428",
        [
            ("STATUS", "Confirmed · Sep 12"),
            ("DRIVER", "Marco K. · 4.94★"),
            ("VEHICLE", "Mercedes V-Class · AB-4821"),
            ("CANCEL BY", "Sep 11 · 14:30 free"),
        ],
        "Contact driver",
        "<b>P-21 Booking detail</b>",
        extra='<div class="btn-out">Cancel booking</div>',
    )

    s["p22"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Live trip</span></div>
<div class="map" style="flex:1;">
  <div class="road-h"></div><div class="road-v"></div>
  <div class="pin" style="top:30%;left:28%;"></div>
  <div class="car" style="top:55%;left:50%;">▶</div>
  <div style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:7px 14px;border-radius:999px;font-size:11px;font-weight:800;">ETA 7 min · GPS live</div>
</div>
<div class="sheet">
  <div class="row"><div class="avatar">MK</div>
    <div style="flex:1;text-align:left;"><b>Marco is heading to you</b><br>
    <span style="font-size:11px;color:#5C5C5C;">Mercedes V-Class · AB-4821</span></div></div>
  <div style="display:flex;gap:8px;margin-top:10px;">
    <div class="btn-out" style="flex:1;margin:0;">Chat</div>
    <div class="btn" style="flex:1;margin:0;">Share trip</div>
  </div>
</div>""",
        "<b>P-22 Live trip</b>",
    )

    s["p23"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Chat</span></div>
<div style="padding:12px;flex:1;display:flex;flex-direction:column;text-align:left;">
  <div style="background:#F0F0F0;border-radius:14px 14px 14px 4px;padding:10px;max-width:80%;font-size:12px;margin-bottom:8px;">I'll be at Arrivals door C with a name board.</div>
  <div style="background:#C8102E;color:#fff;border-radius:14px 14px 4px 14px;padding:10px;max-width:80%;font-size:12px;margin-left:auto;margin-bottom:8px;">Perfect — landing in 20 min.</div>
  <div style="margin-top:auto;display:flex;gap:8px;"><div style="flex:1;background:#F7F7F8;border-radius:999px;padding:10px 14px;font-size:12px;color:#999;">Message…</div>
  <div style="background:#C8102E;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-weight:900;">↑</div></div>
</div>""",
        "<b>P-23 Chat</b>",
    )

    s["p24"] = list_phone(
        "Inbox",
        "Notifications",
        [
            '<div class="card"><b>New offer · $74</b><br><span style="font-size:11px;color:#5C5C5C;">Ana L. bid on your YYZ trip · 2m ago</span></div>',
            '<div class="card"><b>Booking confirmed</b><br><span style="font-size:11px;color:#5C5C5C;">CG-10428 · payment received</span></div>',
            '<div class="card"><b>Driver en route</b><br><span style="font-size:11px;color:#5C5C5C;">ETA 7 min</span></div>',
        ],
        "<b>P-24 Notifications</b>",
        show_tabs="Inbox",
    )

    s["p25"] = list_phone(
        "Profile",
        "Priya Patel",
        [
            '<div class="card"><div class="mini"><span>Payment methods</span><span>›</span></div><div class="mini"><span>Saved addresses</span><span>›</span></div><div class="mini"><span>Support</span><span>›</span></div><div class="mini"><span>Legal</span><span>›</span></div><div class="mini"><span>Delete account</span><span>›</span></div></div>',
        ],
        "<b>P-25 Profile</b>",
        show_tabs="Profile",
    )

    s["p26"] = form_phone(
        "Cards",
        "Payment methods",
        [("DEFAULT", "Visa ·••• 4242"), ("ADD", "Apple Pay / new card")],
        "Add card",
        "<b>P-26 Payment methods</b>",
    )

    s["p27"] = list_phone(
        "Places",
        "Saved addresses",
        [
            '<div class="card"><b>Home</b><br><span style="font-size:11px;color:#5C5C5C;">King St W, Toronto</span></div>',
            '<div class="card"><b>YYZ Arrivals</b><br><span style="font-size:11px;color:#5C5C5C;">Terminal 1</span></div>',
        ],
        "<b>P-27 Addresses</b>",
        "Add address",
    )

    s["p28"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Feedback</span></div>
<div style="padding:24px 16px;text-align:center;flex:1;">
  <div class="avatar" style="margin:0 auto 12px;width:64px;height:64px;font-size:22px;">MK</div>
  <div style="font-size:18px;font-weight:900;">How was your transfer?</div>
  <div class="stars" style="font-size:28px;margin:12px 0;">★★★★★</div>
  <div class="field" style="text-align:left;"><strong>REVIEW</strong>On-time, clean van, clear name board at YYZ.</div>
  <div class="btn">Submit review</div>
</div>""",
        "<b>P-28 Rate trip</b>",
    )

    s["p29"] = form_phone(
        "Support",
        "Help center",
        [("TOPIC", "Booking issue"), ("BOOKING", "CG-10428"), ("MESSAGE", "Need receipt PDF…")],
        "Submit ticket",
        "<b>P-29 Support</b>",
    )

    s["p30"] = form_phone(
        "Legal",
        "Terms & privacy",
        [("TERMS", "Accepted · v2.1"), ("PRIVACY", "Accepted · v1.4"), ("MARKETING", "Email opt-in off")],
        "Save preferences",
        "<b>P-30 Legal</b>",
    )

    s["p31"] = form_phone(
        "GDPR",
        "Delete account",
        [("REASON", "No longer needed"), ("NOTE", "Export my data first")],
        "Request deletion",
        "<b>P-31 Account delete</b>",
        extra='<p style="font-size:11px;color:#B86E00;margin-top:8px;">Irreversible after cooling-off. Active bookings must be closed.</p>',
    )

    # Aliases used by front matter
    s["splash"] = s["p01"]
    s["otp"] = s["p06"]
    s["home"] = s["p07"]
    s["request"] = s["p14"]
    s["waiting"] = s["p16"]
    s["offer"] = s["p17"]
    s["live"] = s["p22"]
    s["rate"] = s["p28"]

    # ── Driver ─────────────────────────────────────────────────
    s["d01"] = phone(
        sb()
        + f"""
<div class="splash">
  {MAPLE.format(w=72, h=72)}
  <div class="brand">CAN-GO</div>
  <div class="tagline">Driver · Earn on your terms</div>
  <div style="width:100%;margin-top:36px;"><div class="btn">Driver login</div></div>
</div>""",
        "<b>D-01 Splash</b>",
    )

    s["d02"] = form_phone(
        "Driver auth",
        "Driver login",
        [("PHONE", "+1 (647) 555-0199"), ("OTP", "••••••")],
        "Continue",
        "<b>D-02 Login / OTP</b>",
    )

    s["d03"] = form_phone(
        "Profile",
        "Driver onboarding",
        [
            ("LEGAL NAME", "Marco Kovacs"),
            ("CITY", "Toronto, ON"),
            ("LANGUAGES", "EN · FR"),
            ("EXPERIENCE", "Airport specialist"),
        ],
        "Save & continue",
        "<b>D-03 Profile setup</b>",
    )

    s["d04"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Documents</span></div>
<div style="padding:16px;text-align:left;flex:1;">
  <div style="font-size:18px;font-weight:900;">Verification</div>
  <p style="font-size:12px;color:#5C5C5C;">Upload once — Admin reviews before marketplace access.</p>
  <div class="card"><div class="mini"><span>Driver licence</span><span class="pill-ok">Approved</span></div></div>
  <div class="card"><div class="mini"><span>Insurance</span><span class="pill-warn">Expiring</span></div></div>
  <div class="card"><div class="mini"><span>Vehicle photos (8)</span><span class="pill-ok">Approved</span></div></div>
  <div class="card"><div class="mini"><span>Background check</span><span class="pill-warn">Pending</span></div></div>
  <div class="btn">Upload / replace</div>
</div>""",
        "<b>D-04 Documents</b>",
    )
    s["d_kyc"] = s["d04"]

    s["d05"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Pending</span></div>
<div style="padding:28px 16px;text-align:center;flex:1;">
  <div style="font-size:18px;font-weight:900;">Under review</div>
  <p style="font-size:12px;color:#5C5C5C;">Ops is verifying your documents. You'll get a push when approved — then you can bid.</p>
  <div class="card" style="text-align:left;"><div class="mini"><span>Submitted</span><span>Sep 1</span></div>
  <div class="mini"><span>ETA review</span><span>1–2 business days</span></div></div>
  <div class="btn-out">Contact support</div>
</div>""",
        "<b>D-05 Pending approval</b>",
    )

    s["d06"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Requests</span></div>
<div style="padding:12px 14px;text-align:left;flex:1;">
  <span class="chip">Near your area</span>
  <div class="card">
    <div class="row" style="justify-content:space-between;"><b>YYZ → Downtown</b><span class="pill-warn">3h left</span></div>
    <div style="font-size:11px;color:#5C5C5C;margin-top:6px;">Sep 12 · 14:30 · 2 pax · 2 bags · Van preferred</div>
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between;"><b>Union → Pearson</b><span class="pill-ok">New</span></div>
    <div style="font-size:11px;color:#5C5C5C;margin-top:6px;">Tomorrow 07:00 · 1 pax · Comfort</div>
  </div>
  <div class="btn">Open request &amp; bid</div>
</div>
"""
        + tabs("Requests", "d"),
        "<b>D-06 Requests feed</b>",
    )
    s["d_feed"] = s["d06"]

    s["d07"] = form_phone(
        "Request",
        "YYZ → Downtown",
        [
            ("WHEN", "Sep 12 · 14:30 · AC123"),
            ("PAX / BAGS", "2 · 2 · Meet & greet"),
            ("DISTANCE", "~28 km"),
            ("PHONE", "Hidden until booked"),
        ],
        "Make offer",
        "<b>D-07 Request detail</b>",
    )

    s["d08"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Submit bid</span></div>
<div style="padding:14px;text-align:left;flex:1;">
  <div style="font-size:18px;font-weight:900;">Your offer</div>
  <div class="field"><strong>VEHICLE</strong>Mercedes V-Class 2022 · Approved</div>
  <div class="field"><strong>YOUR PRICE (CAD)</strong>$78.00 · Suggested $72–$90</div>
  <div class="field"><strong>INCLUDES</strong>Meet &amp; greet · 60 min wait · Tolls</div>
  <div class="field"><strong>NOTE</strong>Name board · flight tracking ready</div>
  <div style="background:#FDECEF;border-radius:12px;padding:10px;margin-top:10px;font-size:12px;">
    <b>Commission preview:</b> ~18% → est. net <b>$63.96</b>
  </div>
  <div class="btn">Submit offer</div>
</div>""",
        "<b>D-08 Create offer</b>",
    )
    s["d_offer"] = s["d08"]

    s["d09"] = list_phone(
        "My offers",
        "Offers sent",
        [
            '<div class="card"><div class="mini"><span>YYZ → King · $78</span><span class="pill-warn">Pending</span></div></div>',
            '<div class="card"><div class="mini"><span>Union → YYZ · $55</span><span class="pill-ok">Won</span></div></div>',
            '<div class="card"><div class="mini"><span>Mississauga · $90</span><span style="color:#999;">Expired</span></div></div>',
        ],
        "<b>D-09 My offers</b>",
    )

    s["d10"] = list_phone(
        "Bookings",
        "Driver bookings",
        [
            '<div class="card sel"><b>CG-10428 · YYZ</b><br><span style="font-size:11px;color:#5C5C5C;">Today 14:30 · Confirmed</span></div>',
            '<div class="card"><b>CG-10390</b><br><span style="font-size:11px;color:#5C5C5C;">Yesterday · Completed</span></div>',
        ],
        "<b>D-10 Bookings</b>",
        show_tabs="Bookings",
        kind="d",
    )

    s["d11"] = form_phone(
        "Booking",
        "CG-10428",
        [
            ("PASSENGER", "Priya P. · after confirm"),
            ("PICKUP", "YYZ T1 Arrivals"),
            ("STATUS", "Confirmed"),
        ],
        "Start navigation",
        "<b>D-11 Booking detail</b>",
        extra='<div class="btn-out">Mark heading to pickup</div>',
    )

    s["d12"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Active trip</span></div>
<div class="map" style="flex:1;"><div class="road-h"></div><div class="car" style="top:50%;left:42%;">▶</div>
<div style="position:absolute;top:12px;left:12px;right:12px;background:#fff;border-radius:12px;padding:10px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);"><b>Status:</b> Heading to pickup · ETA 7 min</div></div>
<div class="sheet">
  <div style="display:flex;gap:6px;flex-wrap:wrap;">
    <span class="chip">Arrived</span><span class="chip" style="background:#F0F0F0;color:#666;">Onboard</span>
    <span class="chip" style="background:#F0F0F0;color:#666;">Complete</span>
  </div>
  <div class="btn">Update status</div>
</div>""",
        "<b>D-12 Active trip</b>",
    )

    s["d13"] = form_phone(
        "Navigate",
        "Open maps",
        [("DESTINATION", "YYZ Terminal 1 Arrivals"), ("APP", "Google Maps / Apple Maps")],
        "Open in Maps",
        "<b>D-13 Navigation handoff</b>",
    )

    s["d14"] = s["p23"].replace("P-23 Chat", "D-14 Chat").replace("Chat</span>", "Driver chat</span>")

    s["d15"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Earnings</span></div>
<div style="padding:16px;text-align:left;flex:1;">
  <div style="font-size:11px;color:#5C5C5C;font-weight:700;">AVAILABLE BALANCE</div>
  <div class="earn">CAD $1,240.00</div>
  <div class="statg">
    <div class="stat"><b>$320</b><span>Pending hold</span></div>
    <div class="stat"><b>$4.8k</b><span>Month GMV</span></div>
  </div>
  <div class="card">
    <div class="mini"><span>Trip CG-10428</span><span style="color:#1B7A45;font-weight:800;">+$63.96</span></div>
    <div class="mini"><span>Payout #882</span><span class="pill-ok">Paid</span></div>
  </div>
  <div class="btn">Request payout</div>
</div>
"""
        + tabs("Earn", "d"),
        "<b>D-15 Earnings</b>",
    )
    s["d_earn"] = s["d15"]

    s["d16"] = list_phone(
        "Ledger",
        "Wallet ledger",
        [
            '<div class="card"><div class="mini"><span>Sep 12 · Trip credit</span><span style="color:#1B7A45;">+$63.96</span></div><div class="mini"><span>Sep 10 · Payout</span><span>−$400.00</span></div><div class="mini"><span>Sep 8 · Hold release</span><span style="color:#1B7A45;">+$55.00</span></div></div>',
        ],
        "<b>D-16 Wallet ledger</b>",
        show_tabs="Earn",
        kind="d",
    )

    s["d17"] = form_phone(
        "Payout",
        "Payout methods",
        [("BANK", "TD ·••• 8821"), ("CURRENCY", "CAD"), ("SCHEDULE", "Manual request")],
        "Save method",
        "<b>D-17 Payout methods</b>",
    )

    s["d18"] = list_phone(
        "Vehicles",
        "My fleet",
        [
            '<div class="card sel"><b>Mercedes V-Class 2022</b><br><span style="font-size:11px;color:#5C5C5C;">Van · Approved</span></div>',
            '<div class="card"><b>Toyota Camry 2021</b><br><span style="font-size:11px;color:#5C5C5C;">Comfort · Approved</span></div>',
        ],
        "<b>D-18 Vehicles</b>",
        "Add vehicle",
    )

    s["d19"] = form_phone(
        "Vehicle",
        "Edit vehicle",
        [
            ("MAKE / MODEL", "Mercedes V-Class"),
            ("YEAR / PLATE", "2022 · AB-4821"),
            ("CLASS", "Van / XL"),
            ("COLOR", "Black"),
        ],
        "Save vehicle",
        "<b>D-19 Vehicle editor</b>",
    )

    s["d20"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Photos</span></div>
<div style="padding:14px;text-align:left;flex:1;">
  <div style="font-size:17px;font-weight:900;">Vehicle photos</div>
  <div class="photo-strip" style="flex-wrap:wrap;height:auto;">
    <div class="photo" style="min-width:70px;height:70px;">Front</div>
    <div class="photo" style="min-width:70px;height:70px;">Side</div>
    <div class="photo" style="min-width:70px;height:70px;">Interior</div>
    <div class="photo" style="min-width:70px;height:70px;">Trunk</div>
  </div>
  <p style="font-size:11px;color:#5C5C5C;">8 photos required · real vehicle, not stock</p>
  <div class="btn">Upload photos</div>
</div>""",
        "<b>D-20 Vehicle photos</b>",
    )

    s["d21"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Driver</span></div>
<div class="map"><div class="road-h"></div><div class="car" style="top:48%;left:44%;">▶</div></div>
<div class="sheet">
  <div class="row" style="justify-content:space-between;">
    <div><div style="font-size:10px;color:#5C5C5C;font-weight:700;">STATUS</div>
    <div style="font-weight:900;font-size:20px;color:#1B7A45;">Online</div></div>
    <div class="toggle"></div>
  </div>
  <p style="margin-top:8px;">Toronto zone · Van eligible · Receiving marketplace requests</p>
  <div class="statg">
    <div class="stat"><b>$186</b><span>Today</span></div>
    <div class="stat"><b>3</b><span>Active offers</span></div>
  </div>
</div>""",
        "<b>D-21 / D-23 Availability</b>",
    )
    s["d_online"] = s["d21"]
    s["d23"] = s["d21"]

    s["d22"] = phone(
        sb()
        + """
<div class="topbar"><span class="brand-word">CAN-GO</span><span class="top-meta">Service area</span></div>
<div class="map" style="flex:1;">
  <div style="position:absolute;inset:18% 12%;border:3px solid rgba(200,16,46,.55);border-radius:50%;background:rgba(200,16,46,.12);"></div>
  <div class="car" style="top:48%;left:44%;">▶</div>
</div>
<div class="sheet"><h3>Service area</h3><p>Radius 40 km · GTA</p><div class="btn">Save area</div></div>""",
        "<b>D-22 Service area</b>",
    )

    s["d24"] = list_phone(
        "Settings",
        "Driver profile",
        [
            '<div class="card"><div class="mini"><span>Documents</span><span>›</span></div><div class="mini"><span>Vehicles</span><span>›</span></div><div class="mini"><span>Availability</span><span>›</span></div><div class="mini"><span>Notifications</span><span>›</span></div></div>',
        ],
        "<b>D-24 Profile</b>",
        show_tabs="Profile",
        kind="d",
    )

    s["d25"] = list_phone(
        "Alerts",
        "Driver notifications",
        [
            '<div class="card"><b>New request near you</b><br><span style="font-size:11px;color:#5C5C5C;">YYZ → Downtown · 3h left</span></div>',
            '<div class="card"><b>Offer accepted</b><br><span style="font-size:11px;color:#5C5C5C;">CG-10428 · passenger paid</span></div>',
        ],
        "<b>D-25 Notifications</b>",
    )

    # ── Admin ──────────────────────────────────────────────────
    def a_table(headers, rows):
        th = "".join(f"<th>{h}</th>" for h in headers)
        tr = "".join(
            "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows
        )
        return f'<table class="tmini"><tr>{th}</tr>{tr}</table>'

    s["a01"] = browser(
        "Operations dashboard",
        "A-01",
        """
<div class="statg">
  <div class="stat"><b>86</b><span>Open requests</span></div>
  <div class="stat"><b>214</b><span>Active offers</span></div>
  <div class="stat"><b>$48k</b><span>GMV (7d)</span></div>
  <div class="stat"><b>91%</b><span>Completion</span></div>
</div>
"""
        + a_table(
            ["Booking", "Route", "Status"],
            [
                ["CG-10428", "YYZ → King St", '<span class="badge">Confirmed</span>'],
                ["CG-10429", "Union → Pearson", '<span class="badge warn">Awaiting offers</span>'],
                ["CG-10430", "Mississauga → YYZ", '<span class="badge">In trip</span>'],
            ],
        ),
        "<b>A-01 Dashboard</b>",
    )
    s["a_dash"] = s["a01"]

    s["a02"] = browser(
        "Customers",
        "A-02",
        a_table(
            ["Customer", "Trips", "Status"],
            [
                ["Priya Patel", "12", '<span class="badge">Active</span>'],
                ["James Chen", "3", '<span class="badge">Active</span>'],
                ["Guest · flagged", "1", '<span class="badge warn">Review</span>'],
            ],
        ),
        "<b>A-02 Customers</b>",
        "Customers",
    )

    s["a03"] = browser(
        "Driver verification queue",
        "A-03",
        """
<div class="statg">
  <div class="stat"><b>12</b><span>Pending KYC</span></div>
  <div class="stat"><b>4</b><span>Vehicles review</span></div>
  <div class="stat"><b>2</b><span>Doc expiry ≤7d</span></div>
</div>
"""
        + a_table(
            ["Driver", "Vehicle", "Action"],
            [
                ["Marco K.", "V-Class · photos OK", '<span class="badge warn">Review</span>'],
                ["Ana L.", "Insurance expiring", '<span class="badge">Request docs</span>'],
            ],
        ),
        "<b>A-03 Drivers / KYC</b>",
        "Drivers",
    )
    s["a_kyc"] = s["a03"]

    s["a04"] = browser(
        "Vehicle verification",
        "A-04",
        a_table(
            ["Vehicle", "Driver", "Photos", "Status"],
            [
                ["V-Class AB-4821", "Marco K.", "8/8", '<span class="badge">Approved</span>'],
                ["Camry XY-2211", "Ana L.", "6/8", '<span class="badge warn">Need more</span>'],
            ],
        ),
        "<b>A-04 Vehicles</b>",
        "Drivers",
    )

    s["a05"] = browser(
        "Open requests",
        "A-05",
        a_table(
            ["Request", "Route", "Offers", "Window"],
            [
                ["CG-R-9021", "YYZ → King", "3", "2h left"],
                ["CG-R-9022", "Union → YYZ", "0", "New"],
            ],
        ),
        "<b>A-05 Requests</b>",
        "Requests",
    )

    s["a06"] = browser(
        "Offers monitor",
        "A-06",
        a_table(
            ["Offer", "Driver", "Price", "State"],
            [
                ["O-441", "Marco", "$78", '<span class="badge">Active</span>'],
                ["O-442", "Ana", "$74", '<span class="badge">Active</span>'],
                ["O-430", "Lee", "$90", '<span class="badge warn">Expired</span>'],
            ],
        ),
        "<b>A-06 Offers</b>",
        "Requests",
    )

    s["a07"] = browser(
        "Booking timeline",
        "A-07",
        a_table(
            ["Time", "Event", "Actor"],
            [
                ["09:02", "Request created", "Passenger"],
                ["09:18", "3 offers received", "Drivers"],
                ["09:40", "Offer accepted · paid", "System"],
                ["14:10", "Heading to pickup", "Driver"],
                ["14:55", "Completed · wallet", "System"],
            ],
        )
        + '<p style="font-size:12px;margin-top:10px;color:#5C5C5C;">Cancel / refund / note — permissioned + audited.</p>',
        "<b>A-07 Bookings</b>",
        "Bookings",
    )
    s["a_book"] = s["a07"]

    s["a08"] = browser(
        "Live trips map",
        "A-08",
        """
<div class="amap">
  <div class="car" style="top:28%;left:36%;">▶</div>
  <div class="car" style="top:52%;left:58%;">▶</div>
  <div class="car" style="top:60%;left:30%;">▶</div>
  <div style="position:absolute;top:10px;left:10px;background:#fff;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:800;border:1px solid #E6E6E6;">Active trips · Toronto</div>
</div>
<div class="statg" style="margin-top:12px;">
  <div class="stat"><b>18</b><span>Online</span></div>
  <div class="stat"><b>7</b><span>On trip</span></div>
  <div class="stat"><b>3</b><span>To pickup</span></div>
</div>""",
        "<b>A-08 Live map</b>",
        "Bookings",
    )
    s["a_live"] = s["a08"]

    s["a09"] = browser(
        "Payments",
        "A-09",
        a_table(
            ["Payment", "Booking", "Amount", "Status"],
            [
                ["pay_8821", "CG-10428", "$86.00", '<span class="badge">Captured</span>'],
                ["pay_8820", "CG-10420", "$55.00", '<span class="badge warn">Refunded</span>'],
            ],
        ),
        "<b>A-09 Payments</b>",
        "Finance",
    )

    s["a10"] = browser(
        "Payouts",
        "A-10",
        a_table(
            ["Payout", "Driver", "Amount", "Status"],
            [
                ["#882", "Marco K.", "$400.00", '<span class="badge">Paid</span>'],
                ["#883", "Ana L.", "$220.00", '<span class="badge warn">Pending</span>'],
            ],
        ),
        "<b>A-10 Payouts</b>",
        "Finance",
    )

    s["a11"] = browser(
        "Refunds",
        "A-11",
        a_table(
            ["Refund", "Reason", "Amount", "By"],
            [
                ["RF-12", "Passenger cancel", "$86.00", "Support"],
                ["RF-11", "No-show dispute", "$40.00", "Finance"],
            ],
        ),
        "<b>A-11 Refunds</b>",
        "Finance",
    )

    s["a12"] = browser(
        "Disputes",
        "A-12",
        a_table(
            ["Case", "Booking", "Issue", "State"],
            [
                ["D-90", "CG-10410", "No-show claim", '<span class="badge warn">Open</span>'],
                ["D-88", "CG-10399", "Damage report", '<span class="badge">Closed</span>'],
            ],
        ),
        "<b>A-12 Disputes</b>",
        "Finance",
    )

    s["a13"] = browser(
        "Support tickets",
        "A-13",
        a_table(
            ["Ticket", "User", "Topic", "SLA"],
            [
                ["T-501", "Priya", "Receipt PDF", '<span class="badge">Ok</span>'],
                ["T-500", "Marco", "Payout delay", '<span class="badge warn">Due</span>'],
            ],
        ),
        "<b>A-13 Support</b>",
        "Settings",
    )

    s["a14"] = browser(
        "Promotions",
        "A-14",
        a_table(
            ["Code", "Type", "Uses", "Status"],
            [
                ["WELCOME10", "% off fee", "84", '<span class="badge">Live</span>'],
                ["YUL50", "Fixed CAD", "12", '<span class="badge warn">Paused</span>'],
            ],
        ),
        "<b>A-14 Promotions</b>",
        "Settings",
    )

    s["a15"] = browser(
        "Reviews moderation",
        "A-15",
        a_table(
            ["Review", "Rating", "Flag", "Action"],
            [
                ["Marco · YYZ", "5★", "—", '<span class="badge">Publish</span>'],
                ["Anon · rude", "1★", "Abuse", '<span class="badge warn">Hide</span>'],
            ],
        ),
        "<b>A-15 Reviews</b>",
        "Settings",
    )

    s["a16"] = browser(
        "Zones & locations",
        "A-16",
        """
<div class="amap"><div style="position:absolute;inset:20% 15%;border:2px dashed #C8102E;border-radius:12px;background:rgba(200,16,46,.08);"></div>
<div style="position:absolute;top:10px;left:10px;background:#fff;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:800;">GTA service zone</div></div>
<p style="font-size:12px;margin-top:10px;color:#5C5C5C;">Airports, cities, surge polygons, blackout zones.</p>""",
        "<b>A-16 Locations / zones</b>",
        "Settings",
    )

    s["a17"] = browser(
        "Service categories",
        "A-17",
        a_table(
            ["Category", "Vehicles", "Active"],
            [
                ["Airport", "Van / Comfort / Luxury", "Yes"],
                ["Hourly", "Chauffeur classes", "Yes"],
                ["Courier", "Phase 2", "No"],
            ],
        ),
        "<b>A-17 Categories</b>",
        "Settings",
    )

    s["a18"] = browser(
        "Reports",
        "A-18",
        """
<div class="statg">
  <div class="stat"><b>$48k</b><span>GMV 7d</span></div>
  <div class="stat"><b>18%</b><span>Take rate</span></div>
  <div class="stat"><b>4.9</b><span>Avg rating</span></div>
  <div class="stat"><b>6%</b><span>Cancel rate</span></div>
</div>
<p style="font-size:12px;color:#5C5C5C;">Export CSV · date range · city filter.</p>""",
        "<b>A-18 Reports</b>",
        "Finance",
    )

    s["a19"] = browser(
        "Notification templates",
        "A-19",
        a_table(
            ["Event", "Push", "Email", "SMS"],
            [
                ["Offer received", "On", "Off", "Off"],
                ["Booking confirmed", "On", "On", "On"],
                ["Driver en route", "On", "Off", "On"],
            ],
        ),
        "<b>A-19 Notification templates</b>",
        "Settings",
    )

    s["a20"] = browser(
        "CMS · FAQ",
        "A-20",
        a_table(
            ["Article", "Locale", "Status"],
            [
                ["How offers work", "EN", '<span class="badge">Published</span>'],
                ["Airport meet & greet", "EN/FR", '<span class="badge">Published</span>'],
            ],
        ),
        "<b>A-20 CMS FAQ</b>",
        "Settings",
    )

    s["a21"] = browser(
        "Platform settings",
        "A-21",
        a_table(
            ["Setting", "Value"],
            [
                ["Default commission", "18%"],
                ["Offer window", "4 hours"],
                ["Currency", "CAD"],
                ["Maps", "Google Maps"],
            ],
        ),
        "<b>A-21 Settings</b>",
        "Settings",
    )

    s["a22"] = browser(
        "Audit logs",
        "A-22",
        a_table(
            ["When", "Actor", "Action"],
            [
                ["14:02", "ops@can-go", "Approved driver Marco"],
                ["13:40", "finance@", "Refund RF-12"],
                ["12:11", "system", "Webhook payment.captured"],
            ],
        ),
        "<b>A-22 Audit logs</b>",
        "Settings",
    )

    s["a23"] = browser(
        "Roles & permissions",
        "A-23",
        a_table(
            ["Role", "Refund", "KYC", "Payout"],
            [
                ["Super admin", "Yes", "Yes", "Yes"],
                ["Ops", "Limited", "Yes", "No"],
                ["Support", "No", "View", "No"],
                ["Finance", "Yes", "View", "Yes"],
            ],
        ),
        "<b>A-23 Roles</b>",
        "Settings",
    )

    # Architecture mini visual (not a phone)
    s["arch"] = """
<div class="viz-item viz-admin">
  <div style="background:#FDECEF;border-radius:14px;padding:18px;border:1px solid #E6E6E6;">
    <div class="arch-row"><span class="arch-box">Flutter Passenger</span><span class="arch-box">Flutter Driver</span><span class="arch-box">Next.js Admin</span></div>
    <div class="arch-arrow">↓ HTTPS / WSS ↓</div>
    <div class="arch-row"><span class="arch-box">NestJS API</span><span class="arch-box">Workers</span></div>
    <div class="arch-arrow">↓</div>
    <div class="arch-row"><span class="arch-box soft">Postgres+PostGIS</span><span class="arch-box soft">Redis</span><span class="arch-box soft">S3 · Stripe · Maps</span></div>
  </div>
  <div class="hf-caption"><b>Architecture</b> — Modular monolith</div>
</div>"""

    s["stateflow"] = """
<div class="viz-item viz-admin">
  <div class="state-flow">REQUEST → OFFERS → ACCEPT+PAY → BOOKING → HEADING → ARRIVED → IN PROGRESS → COMPLETED → WALLET + REVIEW</div>
  <div class="hf-caption"><b>Lifecycle</b> — Marketplace state flow</div>
</div>"""

    return s


def join_screens(sc: dict[str, str], keys: list[str]) -> str:
    return "".join(sc[k] for k in keys if k in sc)


# Heading substring (lowercase) → screen keys. Matched against h2/h3 text.
# Order matters: first match wins for a heading.
DOC_VISUAL_RULES: dict[str, list[tuple[str, list[str]]]] = {
    "00-executive-summary.md": [
        ("_intro", ["p01", "p07", "p16", "a01"]),
        ("product summary", ["p03", "p07", "d06"]),
        ("recommended architecture", ["arch", "a01"]),
        ("mvp scope", ["p14", "p16", "d08", "a03"]),
        ("architecture diagram", ["arch", "stateflow"]),
        ("screen count", ["p07", "d06", "a01"]),
        ("development sequence", ["p14", "p18", "d15", "a07"]),
        ("product improvements", ["p17", "d08", "a08"]),
    ],
    "01-reference-app-analysis.md": [
        ("_intro", ["p03", "p16", "d06"]),
        ("passenger app", ["p07", "p16", "p22"]),
        ("driver app", ["d06", "d08", "d15"]),
        ("ux / product", ["p17", "d04", "a03"]),
        ("mapping reference", ["p14", "d08", "a07"]),
        ("summary verdict", ["p01", "home", "a01"]),
    ],
    "02-business-model.md": [
        ("_intro", ["p16", "p17", "a18"]),
        ("positioning", ["p03", "p07"]),
        ("revenue", ["p18", "d15", "a09"]),
        ("marketplace lifecycle", ["stateflow", "p16", "d08"]),
        ("service catalog", ["p08", "a17"]),
        ("pricing", ["p17", "d08"]),
        ("trust", ["p28", "d04", "a15"]),
        ("cancellation", ["p21", "a11"]),
        ("success metrics", ["a01", "a18"]),
    ],
    "03-passenger-app-requirements.md": [
        ("_intro", ["p01", "p07", "p16"]),
        ("authentication", ["p04", "p05", "p06"]),
        ("navigation", ["p07", "p20", "p25"]),
        ("home", ["p07", "p08"]),
        ("one-way", ["p09", "p10", "p14"]),
        ("return", ["p08", "p14"]),
        ("airport", ["p13", "p14"]),
        ("hourly", ["p08", "p11"]),
        ("location & map", ["p09", "p10"]),
        ("after request", ["p15", "p16"]),
        ("offer comparison", ["p16", "p17"]),
        ("payment", ["p18", "p19"]),
        ("booking management", ["p20", "p21"]),
        ("live trip", ["p22", "p23"]),
        ("chat", ["p23", "p29"]),
        ("ratings", ["p28"]),
        ("profile", ["p25", "p26", "p27"]),
        ("web booking", ["p07", "p14"]),
    ],
    "04-driver-app-requirements.md": [
        ("_intro", ["d01", "d06", "d15"]),
        ("navigation", ["d06", "d10", "d15"]),
        ("onboarding", ["d02", "d03", "d05"]),
        ("document", ["d04", "d05"]),
        ("vehicle", ["d18", "d19", "d20"]),
        ("availability", ["d21", "d22"]),
        ("request marketplace", ["d06", "d07"]),
        ("offer management", ["d08", "d09"]),
        ("urgent", ["d06", "d07"]),
        ("booking workflow", ["d10", "d11"]),
        ("live trip", ["d12", "d13"]),
        ("earnings", ["d15", "d16", "d17"]),
        ("chat", ["d14"]),
        ("ratings", ["p28", "d24"]),
        ("profile", ["d24", "d25"]),
    ],
    "05-admin-portal-requirements.md": [
        ("_intro", ["a01", "a03", "a08"]),
        ("information architecture", ["a01", "a21"]),
        ("dashboard", ["a01"]),
        ("customer", ["a02"]),
        ("driver management", ["a03", "a04"]),
        ("vehicle", ["a04"]),
        ("booking operations", ["a07", "a08"]),
        ("finance", ["a09", "a10", "a11"]),
        ("disputes", ["a12"]),
        ("support", ["a13"]),
        ("promotions", ["a14"]),
        ("catalog", ["a16", "a17"]),
        ("reviews", ["a15"]),
        ("notifications / cms", ["a19", "a20"]),
        ("security", ["a22", "a23"]),
    ],
    "06-booking-marketplace-workflow.md": [
        ("_intro", ["stateflow", "p14", "d08"]),
        ("overview", ["stateflow", "p16"]),
        ("phase a", ["p08", "p14"]),
        ("phase b", ["d06", "p16"]),
        ("phase c", ["p17", "p18", "p19"]),
        ("phase d", ["p21", "d11"]),
        ("phase e", ["p22", "d12"]),
        ("phase f", ["p28", "d15"]),
        ("cancellation", ["p21", "a11"]),
        ("notifications", ["p24", "d25"]),
    ],
    "07-driver-bidding-engine.md": [
        ("_intro", ["d06", "d08", "p16"]),
        ("driver flow", ["d06", "d07", "d08"]),
        ("pricing", ["d08", "p17"]),
        ("expiration", ["d09", "p15"]),
        ("offer ranking", ["p16", "p17"]),
        ("fraud", ["a06", "a03"]),
        ("passenger actions", ["p16", "p17", "p18"]),
        ("state machine", ["d09", "stateflow"]),
    ],
    "08-payment-wallet-payouts.md": [
        ("_intro", ["p18", "d15", "a09"]),
        ("payment methods", ["p18", "p26"]),
        ("payment flow", ["p18", "p19", "a09"]),
        ("price breakdown", ["p17"]),
        ("commission", ["d08", "a21"]),
        ("cancellation", ["a11", "p21"]),
        ("driver wallet", ["d15", "d16"]),
        ("payouts", ["d17", "a10"]),
        ("promo", ["a14"]),
    ],
    "09-system-architecture.md": [
        ("_intro", ["arch", "p07", "d06", "a01"]),
        ("technology", ["arch"]),
        ("module", ["arch", "a01"]),
        ("api style", ["p16", "d08"]),
        ("observability", ["a01", "a22"]),
    ],
    "10-database-schema.md": [
        ("_intro", ["arch", "a07"]),
        ("identity", ["p04", "a02", "a23"]),
        ("driver & vehicles", ["d18", "a03", "a04"]),
        ("marketplace", ["p14", "d08", "a05"]),
        ("booking & trip", ["p22", "a07"]),
        ("payments", ["p18", "d15", "a09"]),
        ("comms", ["p23", "p24"]),
        ("geo", ["p09", "a16"]),
    ],
    "11-api-specification.md": [
        ("_intro", ["p07", "d06", "a01"]),
        ("auth", ["p04", "p06", "d02"]),
        ("passenger", ["p07", "p20"]),
        ("driver", ["d06", "d15"]),
        ("requests", ["p14", "a05"]),
        ("offers", ["p16", "d08", "a06"]),
        ("bookings", ["p21", "d11", "a07"]),
        ("trips", ["p22", "d12"]),
        ("payments", ["p18", "a09"]),
        ("wallet", ["d15", "a10"]),
        ("chat", ["p23"]),
        ("notifications", ["p24", "a19"]),
        ("support", ["p29", "a13"]),
        ("admin", ["a01", "a23"]),
    ],
    "12-realtime-location-architecture.md": [
        ("_intro", ["p22", "d12", "a08"]),
        ("passenger map", ["p09", "p22"]),
        ("driver location", ["d12", "d21"]),
        ("websockets", ["p16", "p22"]),
        ("eta", ["p22"]),
        ("geofence", ["d22", "a16"]),
        ("matching geo", ["d06", "a16"]),
        ("offline", ["p15", "d21"]),
    ],
    "13-notifications-chat.md": [
        ("_intro", ["p24", "p23", "a19"]),
        ("channels", ["p24", "d25"]),
        ("event", ["p24", "a19"]),
        ("push", ["p24", "d25"]),
        ("chat", ["p23", "d14"]),
        ("masked", ["p21", "d11"]),
    ],
    "14-security-compliance.md": [
        ("_intro", ["p06", "a22", "a23"]),
        ("authentication", ["p04", "p06"]),
        ("authorization", ["a23"]),
        ("data protection", ["p31", "a22"]),
        ("fraud", ["a03", "a12"]),
        ("audit", ["a22"]),
        ("account deletion", ["p31"]),
        ("compliance", ["p30", "a21"]),
    ],
    "15-roles-permissions.md": [
        ("_intro", ["a23", "a22"]),
        ("role catalog", ["a23"]),
        ("permission matrix", ["a23", "a11"]),
        ("marketplace actor", ["p21", "d11", "a07"]),
        ("audit", ["a22"]),
    ],
    "16-state-machines.md": [
        ("_intro", ["stateflow", "p15", "d09"]),
        ("ride request", ["p14", "p15", "a05"]),
        ("driver offer", ["d08", "d09", "p16"]),
        ("booking", ["p19", "p21", "a07"]),
        ("trip", ["p22", "d12"]),
        ("payment", ["p18", "a09", "a11"]),
        ("driver verification", ["d04", "d05", "a03"]),
        ("vehicle verification", ["d20", "a04"]),
        ("dispute", ["a12"]),
        ("support", ["a13", "p29"]),
    ],
    "17-edge-cases.md": [
        ("_intro", ["p15", "d21", "a12"]),
        ("connectivity", ["p15", "d12"]),
        ("location", ["p09", "p22"]),
        ("marketplace races", ["p16", "d09"]),
        ("payments", ["p18", "a11"]),
        ("cancellations", ["p21", "a11"]),
        ("flights", ["p13", "d07"]),
        ("payouts", ["d17", "a10"]),
        ("push", ["p24", "d25"]),
        ("safety", ["p22", "a08"]),
    ],
    "18-ui-screen-inventory.md": [
        ("_intro", ["p01", "d01", "a01"]),
        ("passenger app", [
            "p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p09", "p10",
            "p11", "p12", "p13", "p14", "p15", "p16", "p17", "p18", "p19", "p20",
            "p21", "p22", "p23", "p24", "p25", "p26", "p27", "p28", "p29", "p30", "p31",
        ]),
        ("driver app", [
            "d01", "d02", "d03", "d04", "d05", "d06", "d07", "d08", "d09", "d10",
            "d11", "d12", "d13", "d14", "d15", "d16", "d17", "d18", "d19", "d20",
            "d21", "d22", "d24", "d25",
        ]),
        ("admin portal", [
            "a01", "a02", "a03", "a04", "a05", "a06", "a07", "a08", "a09", "a10",
            "a11", "a12", "a13", "a14", "a15", "a16", "a17", "a18", "a19", "a20",
            "a21", "a22", "a23",
        ]),
        ("navigation summary", ["p07", "d06", "a01"]),
    ],
    "19-testing-strategy.md": [
        ("_intro", ["p14", "p18", "d08", "a07"]),
        ("e2e", ["p14", "p16", "p18", "d12"]),
        ("state machine", ["stateflow", "p19"]),
        ("geolocation", ["p22", "a08"]),
        ("acceptance", ["p28", "a15"]),
    ],
    "20-devops-deployment.md": [
        ("_intro", ["arch", "a21", "a22"]),
        ("environments", ["a21"]),
        ("observability", ["a01", "a22"]),
        ("security ops", ["a22", "a23"]),
    ],
    "21-analytics-reporting.md": [
        ("_intro", ["a18", "a01"]),
        ("passenger funnel", ["p07", "p16", "p18"]),
        ("driver funnel", ["d06", "d08", "d15"]),
        ("revenue", ["a09", "a18"]),
        ("quality", ["a15", "p28"]),
        ("admin reports", ["a18"]),
    ],
    "22-mvp-roadmap.md": [
        ("_intro", ["p07", "d06", "a01"]),
        ("mvp", ["p14", "p16", "d08", "a03"]),
        ("phase 2", ["p23", "a14", "d22"]),
        ("advanced", ["a08", "a18"]),
    ],
    "23-development-phases.md": [
        ("_intro", ["arch", "p01", "a01"]),
        ("phase 0", ["p03", "a21"]),
        ("phase 1", ["p06", "d04", "a03"]),
        ("phase 2", ["p14", "p16", "d08"]),
        ("phase 3", ["p19", "p21", "a07"]),
        ("phase 4", ["p18", "d15", "a10"]),
        ("phase 5", ["p22", "d12", "a08"]),
        ("phase 6", ["a12", "a13", "a18"]),
        ("phase 7", ["a22", "a23"]),
    ],
    "24-assumptions-open-questions.md": [
        ("_intro", ["p17", "d08", "a21"]),
        ("open questions", ["a21", "p18", "d17"]),
        ("assumptions", ["p03", "stateflow"]),
        ("sequence diagrams", ["stateflow", "p16", "d12"]),
        ("sign-off", ["p01", "a01"]),
    ],
}
