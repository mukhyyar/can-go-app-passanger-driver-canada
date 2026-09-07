# -*- coding: utf-8 -*-
"""
CAN-GO complete development proposal generator.
- Client brand: CAN-GO (Canada flag red theme)
- High-fidelity UI designs paired with briefs (front) AND appendix docs 00–24
- Full appendix text preserved; UI injected beside each relevant section
"""
from __future__ import annotations

import html
import re
from pathlib import Path

from proposal_ui import (
    DOC_VISUAL_RULES,
    MAPLE,
    build_screens,
    join_screens,
    viz_strip,
)

DOCS = Path(__file__).resolve().parent
OUT = DOCS / "CAN-GO-Development-Proposal.html"
OUT_ALIAS = DOCS / "TransferMarket-Development-Proposal.html"

# Commercial figures — phase split follows relative complexity (docs 23); total = USD 5,250
COMMERCIAL: dict[str, str] = {
    "TOTAL_DEVELOPMENT_COST": "USD $5,250",
    "MAINTENANCE_ANNUAL_RANGE": "USD $650",
    "PHASE_0_COST": "$350",
    "PHASE_1_COST": "$875",
    "PHASE_2_COST": "$1,050",
    "PHASE_3_COST": "$525",
    "PHASE_4_COST": "$1,050",
    "PHASE_5_COST": "$525",
    "PHASE_6_COST": "$525",
    "PHASE_7_COST": "$350",
    "TIMELINE_MVP": "1.5 months",
    "PAY_1_PCT": "35%",
    "PAY_1_AMOUNT": "USD $1,837.50",
    "PAY_2_PCT": "32.5%",
    "PAY_2_AMOUNT": "USD $1,706.25",
    "PAY_3_PCT": "32.5%",
    "PAY_3_AMOUNT": "USD $1,706.25",
}

DOC_FILES = [
    ("00-executive-summary.md", "00 — Executive Summary"),
    ("01-reference-app-analysis.md", "01 — Reference App Analysis"),
    ("02-business-model.md", "02 — Business Model"),
    ("03-passenger-app-requirements.md", "03 — Passenger App Requirements"),
    ("04-driver-app-requirements.md", "04 — Driver App Requirements"),
    ("05-admin-portal-requirements.md", "05 — Admin Portal Requirements"),
    ("06-booking-marketplace-workflow.md", "06 — Booking Marketplace Workflow"),
    ("07-driver-bidding-engine.md", "07 — Driver Bidding Engine"),
    ("08-payment-wallet-payouts.md", "08 — Payment, Wallet & Payouts"),
    ("09-system-architecture.md", "09 — System Architecture"),
    ("10-database-schema.md", "10 — Database Schema"),
    ("11-api-specification.md", "11 — API Specification"),
    ("12-realtime-location-architecture.md", "12 — Realtime & Location"),
    ("13-notifications-chat.md", "13 — Notifications & Chat"),
    ("14-security-compliance.md", "14 — Security & Compliance"),
    ("15-roles-permissions.md", "15 — Roles & Permissions"),
    ("16-state-machines.md", "16 — State Machines"),
    ("17-edge-cases.md", "17 — Edge Cases"),
    ("18-ui-screen-inventory.md", "18 — UI Screen Inventory"),
    ("19-testing-strategy.md", "19 — Testing Strategy"),
    ("20-devops-deployment.md", "20 — DevOps & Deployment"),
    ("21-analytics-reporting.md", "21 — Analytics & Reporting"),
    ("22-mvp-roadmap.md", "22 — MVP Roadmap"),
    ("23-development-phases.md", "23 — Development Phases"),
    ("24-assumptions-open-questions.md", "24 — Assumptions & Open Questions"),
]

PROPOSAL_SCOPE = "cango-proposal"
PROPOSAL_SCOPE_SEL = f".{PROPOSAL_SCOPE}"
OUT_EMBED = DOCS / "CAN-GO-Development-Proposal-embed.html"

# CRM embed: native document scroll so browser Find (Ctrl+F) jumps to the match.
# PWS wraps offers in Perfect Scrollbar (#proposal-preview-scrollbar.ps) with overflow:hidden
# on html/body — that custom scroller does not follow Find highlights. Override it.
EMBED_FLOW_CSS = r"""
html, body {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}
#proposal-preview-scrollbar,
#proposal-preview-scrollbar.ps,
.proposal-preview,
.proposal-preview-container,
.page-wrapper {
  overflow: visible !important;
  overflow-x: hidden !important;
  overflow-y: visible !important;
  height: auto !important;
  max-height: none !important;
  position: relative !important;
}
#proposal-preview-scrollbar .ps__rail-x,
#proposal-preview-scrollbar .ps__rail-y {
  display: none !important;
}
.cango-proposal {
  overflow: visible !important;
  max-height: none !important;
  height: auto !important;
  position: relative;
}
.cango-proposal .page-break {
  break-before: auto !important;
  page-break-before: auto !important;
}
.cango-proposal [id^="doc-"] {
  scroll-margin-top: 24px;
}
"""


PAGE_SCROLL_CSS = r"""
html, body {
  margin: 0;
  padding: 0;
  height: auto !important;
  min-height: 100%;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}
"""

CSS_RAW = r"""
:root {
  --cango: #C8102E;
  --cango-dark: #9B0C24;
  --cango-soft: #FDECEF;
  --ink: #1A1A1A;
  --muted: #5C5C5C;
  --line: #E6E6E6;
  --bg: #F7F7F8;
  --ok: #1B7A45;
  --warn: #B86E00;
}
.header-title { font-size: 40px; line-height: 48px; font-weight: 800; }
.header-subtitle { font-size: 16px; color: var(--muted); }
.section-title { font-size: 26px; font-weight: 800; text-align: center; color: var(--ink); }
.section-title-left { font-size: 22px; font-weight: 800; color: var(--ink); margin: 0 0 6px; }
.rule { height: 3px; width: 80px; background: var(--cango); margin: 14px auto; }
.rule-left { height: 3px; width: 64px; background: var(--cango); margin: 8px 0 16px; }
.tag { display: inline-block; background: var(--cango-soft); color: var(--cango); font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; letter-spacing: .03em; }
.muted { color: var(--muted); }
.brief-text { font-size: 15px; line-height: 1.75; color: #222; text-align: justify; }
.brief-text li { margin: 4px 0; }

.pair {
  display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start;
  width: 94%; margin: 0 auto 36px; padding: 8px 0 28px;
  border-bottom: 1px solid var(--line);
}
.pair-brief { flex: 1 1 340px; min-width: 280px; }
.pair-screens { flex: 1 1 520px; display: flex; flex-wrap: wrap; gap: 22px; justify-content: center; }

.hf-phone {
  width: 270px; background: #0B0B0C; border-radius: 38px; padding: 11px;
  box-shadow: 0 22px 50px rgba(0,0,0,.22), inset 0 0 0 1px #333;
  position: relative;
}
.hf-phone::before {
  content: ""; position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  width: 96px; height: 22px; background: #0B0B0C; border-radius: 0 0 16px 16px; z-index: 8;
}
.hf-screen {
  background: #fff; border-radius: 30px; overflow: hidden; height: 548px;
  position: relative; font-family: 'Segoe UI', system-ui, sans-serif;
  display: flex; flex-direction: column;
}
.hf-home {
  position: absolute; bottom: 7px; left: 50%; transform: translateX(-50%);
  width: 108px; height: 4px; background: #2a2a2a; border-radius: 4px; z-index: 9;
}
.hf-caption { margin-top: 10px; font-size: 12px; font-weight: 700; color: var(--muted); text-align: center; max-width: 270px; }
.hf-caption b { color: var(--ink); }
.sb { display: flex; justify-content: space-between; padding: 12px 16px 6px; font-size: 11px; font-weight: 700; position: relative; z-index: 3; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 14px 10px; border-bottom: 1px solid var(--line); background: #fff;
}
.brand-word { color: var(--cango); font-weight: 800; font-size: 14px; letter-spacing: .04em; }
.top-meta { font-size: 11px; color: var(--muted); font-weight: 600; }
.map {
  flex: 1; min-height: 160px; position: relative;
  background:
    radial-gradient(circle at 70% 30%, rgba(200,16,46,.12), transparent 40%),
    linear-gradient(90deg, #e8eef3 1px, transparent 1px) 0 0 / 26px 26px,
    linear-gradient(#e8eef3 1px, transparent 1px) 0 0 / 26px 26px,
    #d9e3ea;
}
.road-h { position: absolute; left: 0; right: 0; top: 46%; height: 12px; background: #b8c4ce; }
.road-h::after { content: ""; position: absolute; left: 0; right: 0; top: 5px; border-top: 2px dashed #fff; opacity: .8; }
.road-v { position: absolute; top: 0; bottom: 0; left: 40%; width: 12px; background: #b8c4ce; }
.pin {
  position: absolute; width: 16px; height: 16px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
  background: var(--cango); border: 2px solid #fff; box-shadow: 0 3px 10px rgba(0,0,0,.25);
}
.car {
  position: absolute; width: 34px; height: 34px; border-radius: 50%;
  background: #111; color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,.3); border: 2px solid #fff;
}
.sheet {
  background: #fff; border-radius: 22px 22px 0 0; padding: 14px 16px 26px;
  box-shadow: 0 -10px 28px rgba(0,0,0,.1); position: relative; z-index: 2;
}
.sheet h3 { margin: 0 0 4px; font-size: 16px; font-weight: 800; }
.sheet p { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.4; }
.btn {
  display: block; width: 100%; text-align: center; background: var(--cango); color: #fff;
  border: 0; border-radius: 14px; padding: 13px; font-weight: 800; font-size: 14px;
  margin-top: 12px; box-shadow: 0 8px 18px rgba(200,16,46,.28);
}
.btn-out {
  display: block; width: 100%; text-align: center; background: #fff; color: var(--cango);
  border: 1.5px solid var(--cango); border-radius: 14px; padding: 12px; font-weight: 800; font-size: 13px; margin-top: 8px;
}
.chip { display: inline-block; background: var(--cango-soft); color: var(--cango); font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 8px; }
.row { display: flex; align-items: center; gap: 10px; }
.avatar {
  width: 46px; height: 46px; border-radius: 50%;
  background: linear-gradient(135deg, #C8102E, #5a1520); color: #fff;
  display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(200,16,46,.35);
}
.field {
  background: var(--bg); border-radius: 12px; padding: 10px 12px; margin-top: 8px;
  font-size: 12px; text-align: left; border: 1px solid #eee;
}
.field strong { display: block; font-size: 10px; color: var(--muted); font-weight: 700; margin-bottom: 2px; letter-spacing: .04em; }
.price { font-size: 28px; font-weight: 800; margin: 4px 0; letter-spacing: -0.5px; }
.card {
  border: 1px solid var(--line); border-radius: 16px; padding: 12px; margin-top: 10px;
  text-align: left; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.04);
}
.card.sel { border-color: var(--cango); box-shadow: 0 0 0 2px rgba(200,16,46,.15); }
.mini { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid #F0F0F0; font-size: 12px; }
.earn { font-size: 26px; font-weight: 800; color: var(--cango); letter-spacing: -0.5px; }
.splash {
  height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 24px;
  background: linear-gradient(165deg, #fff 0%, var(--cango-soft) 48%, #fff 100%);
}
.splash .brand { font-size: 30px; font-weight: 900; color: var(--cango); letter-spacing: 1px; }
.splash .tagline { font-size: 10px; color: var(--muted); letter-spacing: .1em; margin-top: 8px; text-transform: uppercase; }
.tabs {
  display: flex; justify-content: space-around; padding: 8px 6px 14px; border-top: 1px solid var(--line);
  background: #fff; font-size: 9px; font-weight: 700; color: #999;
}
.tabs .on { color: var(--cango); }
.stars { color: #F5A623; letter-spacing: 1px; font-size: 16px; }
.photo-strip { display: flex; gap: 6px; margin: 8px 0; overflow: hidden; }
.photo {
  height: 56px; flex: 1; border-radius: 10px;
  background: linear-gradient(135deg, #9aa3ad, #5c6570); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700;
}
.statg { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.stat {
  flex: 1; min-width: 70px; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 10px;
  text-align: left;
}
.stat b { display: block; font-size: 18px; color: var(--cango); }
.stat span { font-size: 10px; color: var(--muted); }
.pill-ok { background: #E8F8EF; color: var(--ok); font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; }
.pill-warn { background: #FFF4E5; color: var(--warn); font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; }
.toggle {
  width: 52px; height: 30px; background: var(--ok); border-radius: 999px; position: relative;
}
.toggle::after {
  content: ""; width: 24px; height: 24px; background: #fff; border-radius: 50%;
  position: absolute; right: 3px; top: 3px; box-shadow: 0 1px 4px rgba(0,0,0,.2);
}
.search-pill {
  position: absolute; top: 12px; left: 12px; right: 12px; background: #fff; border-radius: 16px;
  padding: 12px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.12); font-size: 12px; text-align: left; z-index: 3;
}
.search-pill strong { display: block; font-size: 10px; color: var(--muted); margin-bottom: 2px; }

.browser {
  width: 100%; max-width: 680px; margin: 0 auto; background: #E4E4E7; border-radius: 14px;
  overflow: hidden; box-shadow: 0 18px 40px rgba(0,0,0,.16); text-align: left;
}
.bbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot.r { background: #FF5F57; } .dot.y { background: #FEBC2E; } .dot.g { background: #28C840; }
.url { flex: 1; background: #fff; border-radius: 8px; padding: 6px 12px; font-size: 12px; color: var(--muted); }
.bbody { background: #F4F5F7; min-height: 320px; display: flex; }
.aside { width: 168px; background: #1A1A1A; color: #fff; padding: 16px 12px; flex-shrink: 0; }
.aside .nav { font-size: 12px; padding: 9px 10px; border-radius: 8px; margin-bottom: 4px; color: #bbb; }
.aside .nav.on { background: var(--cango); color: #fff; font-weight: 800; }
.main { flex: 1; padding: 16px; }
.main h2 { margin: 0 0 4px; font-size: 18px; }
.main .sub { font-size: 12px; color: var(--muted); margin-bottom: 12px; }
.tmini { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; font-size: 11px; }
.tmini th { text-align: left; padding: 8px; border-bottom: 1px solid var(--line); color: var(--muted); }
.tmini td { padding: 8px; border-bottom: 1px solid var(--line); }
.badge { background: #E8F8EF; color: var(--ok); font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 6px; }
.badge.warn { background: #FFF4E5; color: var(--warn); }
.id-pill { display: inline-block; background: var(--cango); color: #fff; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; margin-right: 6px; }
.amap {
  height: 180px; border-radius: 10px; border: 1px solid var(--line); position: relative; overflow: hidden;
  background: linear-gradient(90deg,#e9eef2 1px,transparent 1px) 0 0/24px 24px,
              linear-gradient(#e9eef2 1px,transparent 1px) 0 0/24px 24px, #dfe7ec;
}
.arch-box { display: inline-block; background:#fff; border:1.5px solid var(--cango); border-radius:10px; padding:10px 14px; margin:6px; font-size:12px; font-weight:700; text-align:center; min-width:100px; }
.arch-box.soft { border-color:#999; background:#F7F7F8; font-weight:600; }
.arch-row { text-align:center; margin:8px 0; }
.arch-arrow { text-align:center; color: var(--cango); font-size:18px; }
.state-flow { font-family: Consolas, monospace; font-size:12px; background:#F7F7F8; border:1px solid #E6E6E6; border-radius:10px; padding:14px 16px; line-height:1.7; overflow-x:auto; }
.inv-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:10px; }
.inv-table th { background: var(--cango); color:#fff; text-align:left; padding:8px; border:1px solid #ddd; }
.inv-table td { padding:7px 8px; border:1px solid #ddd; }
.inv-table tr:nth-child(even) { background:#FAFAFA; }
.section-note { font-size:14px; color:#5C5C5C; text-align:center; margin:0 0 12px; }
.doc-appendix { width: 92%; margin: 0 auto 48px; text-align: left; }
.doc-block { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 22px 24px; margin: 18px 0 32px; }
.doc-block h1 { font-size: 22px; color: var(--cango-dark); margin: 0 0 12px; border-bottom: 2px solid var(--cango-soft); padding-bottom: 8px; }
.doc-block h2 { font-size: 17px; margin: 18px 0 8px; }
.doc-block h3 { font-size: 15px; margin: 14px 0 6px; color: var(--cango); }
.doc-block p, .doc-block li { font-size: 14px; line-height: 1.65; }
.doc-block ul, .doc-block ol { margin: 6px 0 10px 22px; }
.doc-block table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0 14px; }
.doc-block th { background: var(--cango); color: #fff; text-align: left; padding: 7px 8px; border: 1px solid #ddd; }
.doc-block td { padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; }
.doc-block tr:nth-child(even) td { background: #FAFAFA; }
.doc-block pre, .doc-block .code-block {
  background: #F4F6F7; border: 1px solid #E6E6E6; border-radius: 8px;
  padding: 12px 14px; font-size: 12px; overflow-x: auto; line-height: 1.5;
  font-family: Consolas, monospace; white-space: pre-wrap;
}
.doc-block code { font-family: Consolas, monospace; font-size: 12px; background: #FDECEF; padding: 1px 4px; border-radius: 4px; }
.doc-toc a { color: var(--cango); text-decoration: none; font-weight: 600; }
.page-break { break-before: page; page-break-before: always; }

/* Appendix visual strips */
.viz-strip {
  background: linear-gradient(180deg, #FFF8F9 0%, #fff 100%);
  border: 1px solid #F0D0D6;
  border-radius: 16px;
  padding: 16px 14px 20px;
  margin: 14px 0 22px;
}
.viz-head { font-size: 13px; margin-bottom: 6px; color: var(--ink); }
.viz-head b { margin-left: 6px; }
.viz-note { font-size: 12px; color: var(--muted); margin: 0 0 12px; }
.viz-row {
  display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; align-items: flex-start;
  max-width: 100%;
  overflow-x: auto;
}
.viz-item { display: flex; flex-direction: column; align-items: center; }
.viz-item.viz-admin { width: 100%; max-width: 700px; }
.viz-item.viz-admin .hf-caption { max-width: 100%; }

@media screen and (max-width: 768px) {
  .header-title { font-size: 26px !important; line-height: 34px !important; }
  .aside { display: none; }
}
"""


def scope_css(css: str, scope: str = PROPOSAL_SCOPE_SEL) -> str:
    """Prefix every rule so styles apply only inside the proposal wrapper (CRM-safe)."""
    css = css.replace(":root {", f"{scope} {{")

    isolation = f"""
{scope} {{
  display: block;
  box-sizing: border-box;
  font-family: 'Segoe UI', system-ui, Arial, sans-serif;
  color: #1A1A1A;
  background: #fff;
  line-height: 1.5;
  text-align: left;
  max-width: 100%;
  word-wrap: break-word;
  overflow: visible;
  height: auto;
}}
{scope}, {scope} * {{
  box-sizing: border-box;
}}
{scope} table {{
  max-width: 100%;
  word-wrap: break-word;
  width: 100% !important;
  border-collapse: collapse;
}}
{scope} td {{
  vertical-align: top;
}}
"""

    def prefix_selector(selector: str) -> str:
        selector = selector.strip()
        if not selector or selector.startswith("@"):
            return selector
        parts: list[str] = []
        for part in selector.split(","):
            part = part.strip()
            if not part:
                continue
            if part.startswith(scope):
                parts.append(part)
            else:
                parts.append(f"{scope} {part}")
        return ", ".join(parts)

    def scope_block(text: str) -> str:
        out: list[str] = []
        i = 0
        n = len(text)
        while i < n:
            while i < n and text[i].isspace():
                i += 1
            if i >= n:
                break
            if text[i] == "}":
                i += 1
                continue
            if text[i] == "@":
                j = text.find("{", i)
                if j == -1:
                    out.append(text[i:])
                    break
                depth = 0
                k = j
                while k < n:
                    if text[k] == "{":
                        depth += 1
                    elif text[k] == "}":
                        depth -= 1
                        if depth == 0:
                            header = text[i : j + 1]
                            inner = text[j + 1 : k]
                            out.append(header + scope_block(inner) + "}")
                            i = k + 1
                            break
                    k += 1
                else:
                    out.append(text[i:])
                    break
                continue
            j = text.find("{", i)
            if j == -1:
                out.append(text[i:])
                break
            selector = text[i:j].strip()
            depth = 0
            k = j
            while k < n:
                if text[k] == "{":
                    depth += 1
                elif text[k] == "}":
                    depth -= 1
                    if depth == 0:
                        body = text[j : k + 1]
                        out.append(prefix_selector(selector) + " " + body)
                        i = k + 1
                        break
                k += 1
            else:
                out.append(text[i:])
                break
        return "".join(out)

    return isolation + scope_block(css.strip())

    return isolation + scope_block(css.strip())


def md_inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def _visual_for_heading(fname: str, heading: str, sc: dict[str, str], used: set[str]) -> str:
    rules = DOC_VISUAL_RULES.get(fname, [])
    h = heading.lower().strip()
    for key, keys in rules:
        if key.startswith("_"):
            continue
        if key in h:
            # Avoid injecting the exact same key-set twice in one doc when headings overlap
            sig = fname + "|" + key
            if sig in used:
                return ""
            used.add(sig)
            html_screens = join_screens(sc, keys)
            if not html_screens:
                return ""
            label = heading if len(heading) < 80 else heading[:77] + "…"
            note = "What this looks like in the CAN-GO passenger / driver / admin product."
            return viz_strip(f"Screens for: {html.escape(label)}", html_screens, note)
    return ""


def md_to_html(src: str, fname: str = "", sc: dict[str, str] | None = None) -> str:
    lines = src.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    i = 0
    in_ul = in_ol = False
    table_rows: list[str] = []
    used: set[str] = set()
    sc = sc or {}
    intro_done = False

    def close_lists():
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>"); in_ul = False
        if in_ol:
            out.append("</ol>"); in_ol = False

    def flush_table():
        nonlocal table_rows
        if not table_rows:
            return
        out.append("<table>")
        for ri, row in enumerate(table_rows):
            cells = [c.strip() for c in row.strip("|").split("|")]
            if ri == 1 and all(re.match(r"^:?-+:?$", c or "") for c in cells):
                continue
            tag = "th" if ri == 0 else "td"
            out.append("<tr>" + "".join(f"<{tag}>{md_inline(c)}</{tag}>" for c in cells) + "</tr>")
        out.append("</table>")
        table_rows = []

    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("```"):
            close_lists(); flush_table(); i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            out.append(f'<pre class="code-block">{html.escape(chr(10).join(buf))}</pre>')
            continue
        if "|" in line and line.strip().startswith("|"):
            close_lists(); table_rows.append(line); i += 1; continue
        if table_rows:
            flush_table()
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            close_lists()
            level = len(m.group(1))
            heading = m.group(2)
            out.append(f"<h{level}>{md_inline(heading)}</h{level}>")
            # Intro gallery once after first h1
            if level == 1 and not intro_done and fname:
                intro_done = True
                for key, keys in DOC_VISUAL_RULES.get(fname, []):
                    if key == "_intro":
                        html_screens = join_screens(sc, keys)
                        if html_screens:
                            out.append(viz_strip(
                                "Start here — how this chapter looks in the product",
                                html_screens,
                                "Read the text below; matching high-fidelity screens appear after each major section.",
                            ))
                        break
            if level in (2, 3) and fname:
                out.append(_visual_for_heading(fname, heading, sc, used))
            i += 1; continue
        if line.strip() == "---":
            close_lists(); out.append("<hr/>"); i += 1; continue
        if re.match(r"^[-*]\s+", line):
            if in_ol: out.append("</ol>"); in_ol = False
            if not in_ul: out.append("<ul>"); in_ul = True
            out.append(f"<li>{md_inline(re.sub(r'^[-*]\\s+', '', line))}</li>"); i += 1; continue
        if re.match(r"^\d+\.\s+", line):
            if in_ul: out.append("</ul>"); in_ul = False
            if not in_ol: out.append("<ol>"); in_ol = True
            out.append(f"<li>{md_inline(re.sub(r'^\\d+\\.\\s+', '', line))}</li>"); i += 1; continue
        if not line.strip():
            close_lists(); i += 1; continue
        close_lists()
        out.append(f"<p>{md_inline(line)}</p>"); i += 1
    close_lists(); flush_table()
    return "\n".join(out)


def pair(title: str, brief_html: str, screens_html: str, tag: str = "") -> str:
    t = f'<span class="tag">{tag}</span><br/>' if tag else ""
    return f"""
<div class="pair">
  <div class="pair-brief">
    {t}
    <div class="section-title-left">{title}</div>
    <div class="rule-left"></div>
    <div class="brief-text">{brief_html}</div>
  </div>
  <div class="pair-screens">{screens_html}</div>
</div>"""


def build_front(sc: dict[str, str]) -> str:
    maple = MAPLE.format(w=120, h=120)

    cover = f"""
<table style="margin:0;width:100%;"><tr><td style="padding:0;">
  <div style="background:linear-gradient(160deg,#ffffff 0%,#FDECEF 45%,#ffffff 100%);padding:52px 20px 44px;text-align:center;border-bottom:4px solid #C8102E;">
    {maple}
    <div class="header-title" style="color:#1A1A1A;">CAN-GO Mobility Marketplace</div>
    <div class="header-subtitle" style="margin-top:12px;max-width:780px;margin-left:auto;margin-right:auto;">
      End-to-End Development Proposal for <b>{{PROPOSAL_TO_COMPANY_NAME}}</b><br>
      Passenger App · Driver App · Admin Portal · Web Booking · NestJS Backend<br>
      <span style="font-size:13px;">Private transfer <b>tender marketplace</b> — compare driver offers before you pay</span>
    </div>
    <div style="margin-top:16px;"><span class="tag">CANADA-READY · HIGH-FIDELITY UI IN APPENDIX</span></div>
  </div>
</td></tr></table>

<table style="margin:20px auto 28px;width:90%;border-collapse:collapse;text-align:center;font-size:14px;">
  <tr style="background:#C8102E;color:#fff;">
    <td style="padding:10px;border:1px solid #ddd;">Proposal ID</td>
    <td style="padding:10px;border:1px solid #ddd;">Date</td>
    <td style="padding:10px;border:1px solid #ddd;">Expiry</td>
    <td style="padding:10px;border:1px solid #ddd;">Client</td>
  </tr>
  <tr>
    <td style="padding:10px;border:1px solid #ddd;">{{PROPOSAL_ID}}</td>
    <td style="padding:10px;border:1px solid #ddd;">{{PROPOSAL_DATE}}</td>
    <td style="padding:10px;border:1px solid #ddd;">{{PROPOSAL_EXPIRY_DATE}}</td>
    <td style="padding:10px;border:1px solid #ddd;"><b>CAN-GO</b> / {{PROPOSAL_TO_COMPANY_NAME}}</td>
  </tr>
</table>

<table style="margin:0 auto 36px;width:90%;font-size:15px;"><tr>
  <td style="width:50%;padding:10px;"><p style="font-style:italic;margin:0;color:#5C5C5C;">Proposal For</p>
    <p><b>CAN-GO</b><br>{{PROPOSAL_TO_COMPANY_NAME}}<br>{{PROPOSAL_TO_ADDRESS}}<br>
    {{PROPOSAL_TO_CITY}}, {{PROPOSAL_TO_STATE}}, {{PROPOSAL_TO_COUNTRY}}<br>VAT: {{PROPOSAL_TO_VAT_NUMBER}}</p></td>
  <td style="width:50%;padding:10px;"><p style="font-style:italic;margin:0;color:#5C5C5C;">Proposal From</p>
    <p>{{COMPANY_NAME}}<br>{{COMPANY_ADDRESS}}<br>{{COMPANY_EMAIL}}<br>{{COMPANY_PHONE}}<br>{{COMPANY_WEBSITE}}</p></td>
</tr></table>
"""

    howto = """
<table style="margin:0 auto 28px;width:92%;"><tr><td>
  <div class="section-title">How to read this proposal</div><div class="rule"></div>
  <p class="section-note" style="text-align:left;">
    <b>Front half:</b> plain-language brief + high-fidelity screens.<br>
    <b>Appendix (docs 00–24):</b> full product documentation — <u>nothing removed</u>. While you read each section,
    matching <b>CAN-GO UI designs</b> appear immediately under that heading so a non-technical reader can visualize the product.
  </p>
</td></tr></table>
"""

    parts = [cover, howto]

    parts.append(pair(
        "1. What CAN-GO is (for non-technical readers)",
        """
        <p><b>CAN-GO</b> is a private transfer marketplace (not a classic “nearest taxi now” app).</p>
        <ol>
          <li>Passenger creates a transfer request (airport, city, return…).</li>
          <li>Eligible drivers send <b>their own prices</b> with real vehicle photos &amp; ratings.</li>
          <li>Passenger compares offers and chooses one.</li>
          <li>Payment confirms the booking — then driver completes the trip.</li>
        </ol>
        <p>Brand theme follows <b>Canada flag red</b> (<code>#C8102E</code>) with clean white surfaces.</p>
        <p><b>Investment:</b> {{TOTAL_DEVELOPMENT_COST}} · Optional maintenance {{MAINTENANCE_ANNUAL_RANGE}}/yr</p>
        """,
        sc["splash"] + sc["home"],
        "EXECUTIVE",
    ))

    parts.append(pair(
        "2. Passenger — Create a transfer request",
        """
        <p>Passenger picks service type, map pins, date/time, passengers, luggage, and airport options (flight, meet &amp; greet).</p>
        <ul>
          <li>Clear form — no surprise fields</li>
          <li>GPS optional; typing an address always works</li>
          <li>Submit creates an open marketplace request</li>
        </ul>
        """,
        sc["otp"] + sc["request"],
        "PASSENGER APP",
    ))

    parts.append(pair(
        "3. Passenger — Compare driver offers before paying",
        """
        <p>This is the heart of CAN-GO. Offers show price, rating, trips, real vehicle photos, fee-inclusive total, and cancellation summary.</p>
        <p>Sort by Recommended · Lowest price · Highest rated.</p>
        """,
        sc["waiting"] + sc["offer"],
        "MARKETPLACE",
    ))

    parts.append(pair(
        "4. Passenger — Live trip &amp; review",
        """
        <p>After payment: live map + ETA, chat/share, then star rating + review.</p>
        """,
        sc["live"] + sc["rate"],
        "LIVE TRIP",
    ))

    parts.append(pair(
        "5. Driver — Go online &amp; browse requests",
        """
        <p>Approved drivers go <b>Online</b> and see eligible requests (phone hidden until booked).</p>
        """,
        sc["d_online"] + sc["d_feed"],
        "DRIVER APP",
    ))

    parts.append(pair(
        "6. Driver — Submit bid + earnings wallet",
        """
        <p>Price + extras + <b>commission / net preview</b>. Wallet shows available vs pending + payouts. KYC must stay valid.</p>
        """,
        sc["d_offer"] + sc["d_earn"] + sc["d_kyc"],
        "BIDDING + WALLET",
    ))

    parts.append(pair(
        "7. Admin — What the operations team sees",
        """
        <p>Dashboard, KYC queue, booking timeline, live map, finance tools — Canada-red branded Admin.</p>
        """,
        sc["a_dash"] + sc["a_kyc"],
        "ADMIN PORTAL",
    ))

    parts.append(f"""
<div class="pair">
  <div class="pair-brief">
    <span class="tag">ADMIN · BOOKINGS</span><br/>
    <div class="section-title-left">8. Booking ops &amp; live monitoring</div>
    <div class="rule-left"></div>
    <div class="brief-text">
      <p>Support opens any booking timeline. Live map shows in-progress transfers. Sensitive actions are audited.</p>
    </div>
  </div>
  <div class="pair-screens" style="flex-direction:column;align-items:center;">
    {sc["a_book"]}
    {sc["a_live"]}
  </div>
</div>
""")

    parts.append("""
<table style="margin:20px auto 36px;width:92%;"><tr><td>
  <div class="section-title">Brand &amp; colour system</div><div class="rule"></div>
  <table style="width:100%;font-size:15px;"><tr>
    <td style="width:140px;text-align:center;">""" + MAPLE.format(w=100, h=100) + """</td>
    <td>
      <p><b>Brand:</b> CAN-GO · <b>Primary:</b> <code>#C8102E</code> · <b>Soft:</b> <code>#FDECEF</code></p>
      <p>Marketplace tender model — offers before pay.</p>
    </td>
  </tr></table>
</td></tr></table>
""")

    parts.append("""
<table style="margin:0 auto 36px;width:92%;"><tr><td>
  <div class="section-title">Delivery phases (unchanged scope)</div><div class="rule"></div>
  <table class="inv-table"><thead><tr>
    <th>Phase</th><th>Focus</th><th>Complexity</th><th>USD</th>
  </tr></thead><tbody>
  <tr><td><b>0</b> Definition</td><td>Docs, ERD, API, wireframes, sign-off</td><td>M</td><td>{{PHASE_0_COST}}</td></tr>
  <tr><td><b>1</b> Foundation</td><td>Auth, KYC, vehicles, geo, admin base</td><td>L–XL</td><td>{{PHASE_1_COST}}</td></tr>
  <tr><td><b>2</b> Marketplace</td><td>Requests, matching, offers, compare</td><td>XL</td><td>{{PHASE_2_COST}}</td></tr>
  <tr><td><b>3</b> Booking</td><td>Accept, bookings, notifications</td><td>L</td><td>{{PHASE_3_COST}}</td></tr>
  <tr><td><b>4</b> Payments</td><td>Stripe, refunds, commission, wallet, payouts</td><td>XL</td><td>{{PHASE_4_COST}}</td></tr>
  <tr><td><b>5</b> Live trips</td><td>GPS, WebSockets, trip SM, chat MVP</td><td>L</td><td>{{PHASE_5_COST}}</td></tr>
  <tr><td><b>6</b> Operations</td><td>Disputes, support, promos, analytics</td><td>L</td><td>{{PHASE_6_COST}}</td></tr>
  <tr><td><b>7</b> Harden</td><td>Security, load, monitoring, stores</td><td>M–L</td><td>{{PHASE_7_COST}}</td></tr>
  </tbody></table>
  <p class="brief-text" style="margin-top:14px;text-align:center;font-size:15px;">
    <b>Total delivery timeline:</b> 1.5 months (Phases 0–7, milestone-based)
  </p>
</td></tr></table>
""")

    parts.append("""
<table style="margin:0 auto 36px;width:92%;"><tr><td>
  <div class="section-title">System architecture</div><div class="rule"></div>
  <div style="background:#FDECEF;border-radius:14px;padding:18px;margin:16px 0;">
    <div class="arch-row"><span class="arch-box">Flutter Passenger</span><span class="arch-box">Flutter Driver</span><span class="arch-box">Next.js Admin</span></div>
    <div class="arch-arrow">↓ HTTPS / WSS ↓</div>
    <div class="arch-row"><span class="arch-box">NestJS API</span><span class="arch-box">Workers + Events</span></div>
    <div class="arch-arrow">↓</div>
    <div class="arch-row"><span class="arch-box soft">Postgres+PostGIS</span><span class="arch-box soft">Redis</span><span class="arch-box soft">Object Storage</span></div>
  </div>
  <div class="state-flow">
REQUEST → OFFERS → ACCEPT + PAY → BOOKING → HEADING → ARRIVED → IN PROGRESS → COMPLETED → WALLET + REVIEW
  </div>
</td></tr></table>
""")

    parts.append("""
<table style="margin:0 auto 36px;width:92%;"><tr><td>
  <div class="section-title">Master costing</div><div class="rule"></div>
  <table class="inv-table"><thead><tr><th>Phase</th><th>Duration</th><th>Cost (USD)</th></tr></thead><tbody>
  <tr><td>0–7 (see table above)</td><td>{{TIMELINE_MVP}}</td><td><b>{{TOTAL_DEVELOPMENT_COST}}</b></td></tr>
  <tr><td>Optional maintenance / year</td><td>—</td><td>{{MAINTENANCE_ANNUAL_RANGE}}</td></tr>
  </tbody></table>
</td></tr></table>
""")

    parts.append("""
<table style="margin:0 auto 36px;width:92%;"><tr><td>
  <div class="section-title">Payment terms</div><div class="rule"></div>
  <p class="section-note" style="text-align:left;margin-bottom:12px;">
    Total project investment <b>{{TOTAL_DEVELOPMENT_COST}}</b>. Payment is split into <b>3 installments</b>:
    <b>35% advance</b> to kickstart, then two equal breakups for the remaining <b>65%</b>.
  </p>
  <table class="inv-table"><thead><tr>
    <th>#</th><th>When</th><th>%</th><th>Amount (USD)</th>
  </tr></thead><tbody>
  <tr>
    <td><b>1</b></td>
    <td><b>Advance — kickstart</b><br>Due on project start / Phase 0 kickoff (before development begins)</td>
    <td><b>{{PAY_1_PCT}}</b></td>
    <td><b>{{PAY_1_AMOUNT}}</b></td>
  </tr>
  <tr>
    <td><b>2</b></td>
    <td><b>Mid delivery</b><br>After Marketplace + Booking (Phases 0–3) are delivered for review</td>
    <td><b>{{PAY_2_PCT}}</b></td>
    <td><b>{{PAY_2_AMOUNT}}</b></td>
  </tr>
  <tr>
    <td><b>3</b></td>
    <td><b>Final delivery</b><br>On Payments + Live trips + Ops + Hardening complete / go-live readiness (Phases 4–7)</td>
    <td><b>{{PAY_3_PCT}}</b></td>
    <td><b>{{PAY_3_AMOUNT}}</b></td>
  </tr>
  <tr>
    <td colspan="2"><b>Total</b></td>
    <td><b>100%</b></td>
    <td><b>{{TOTAL_DEVELOPMENT_COST}}</b></td>
  </tr>
  </tbody></table>
</td></tr></table>
""")

    return "\n".join(parts)


def build_appendix(sc: dict[str, str]) -> str:
    toc, blocks = [], []
    for fname, title in DOC_FILES:
        path = DOCS / fname
        anchor = fname.replace(".md", "")
        toc.append(
            f'<li><a href="#doc-{anchor}">{html.escape(title)}</a> <span class="muted">({fname})</span></li>'
        )
        raw = path.read_text(encoding="utf-8") if path.exists() else f"# Missing\n\nMissing {fname}"
        body = md_to_html(raw, fname=fname, sc=sc)
        note = (
            '<p style="font-size:12px;color:#5C5C5C;"><i>Note: Source docs may say “TransferMarket” as the working product '
            "codename. Client-facing brand in this proposal is <b>CAN-GO</b>. "
            "Pink <b>UI DESIGN</b> panels below are high-fidelity screen previews — documentation text is unchanged.</i></p>"
        )
        blocks.append(
            f'<div class="doc-block page-break" id="doc-{anchor}">'
            f'<p><span class="tag">SOURCE: /docs/{html.escape(fname)}</span></p>{note}{body}</div>'
        )
    return f"""
<div class="page-break"></div>
<table style="margin:40px auto 16px;width:92%;"><tr><td>
  <div class="section-title">APPENDIX — Complete product documentation (00–24)</div>
  <div class="rule"></div>
  <p class="section-note" style="text-align:left;">
    Full research docs preserved. Each major section is followed by the matching <b>high-fidelity CAN-GO screens</b>
    (Passenger P-*, Driver D-*, Admin A-*). Doc <b>18</b> contains the complete screen inventory gallery.
  </p>
</td></tr></table>
<div class="doc-appendix">
  <div class="doc-block"><h2>Appendix contents</h2><ol class="doc-toc">{''.join(toc)}</ol></div>
  {''.join(blocks)}
</div>
"""


def apply_placeholders(html_out: str, values: dict[str, str]) -> str:
    for key, val in values.items():
        html_out = html_out.replace("{" + key + "}", val)
    return html_out


def main() -> None:
    sc = build_screens()
    front = build_front(sc)
    appendix = build_appendix(sc)
    contact = """
<table style="margin:40px auto;width:90%;"><tr><td>
  <div class="section-title">Contact Us</div><div class="rule"></div>
  <p style="text-align:center;font-size:15px;line-height:1.8;">
    {COMPANY_NAME}<br>{COMPANY_ADDRESS}<br>{COMPANY_EMAIL}<br>{COMPANY_PHONE}<br>{COMPANY_WEBSITE}
  </p>
  <p style="text-align:center;font-size:14px;color:#5C5C5C;">Ready to kick off CAN-GO Phase 0 sign-off and Phase 1 foundation.</p>
</td></tr></table>
"""
    content = front + appendix + contact
    scoped_css = scope_css(CSS_RAW)
    html_out = (
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n"
        "<meta charset=\"utf-8\"/>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>\n"
        "<title>CAN-GO — Complete Development Proposal</title>\n"
        "<style>\n" + PAGE_SCROLL_CSS + scoped_css + "\n</style>\n</head>\n<body>\n"
        f'<div class="{PROPOSAL_SCOPE}" id="{PROPOSAL_SCOPE}">\n'
        + content +
        "</div>\n</body></html>\n"
    )
    html_out = html_out.replace("{{", "{").replace("}}", "}")
    html_out = apply_placeholders(html_out, COMMERCIAL)
    embed_out = (
        "<!-- CRM embed (PWS): paste entire block — NO script tags (CRM server error). Native page scroll so Ctrl+F works. -->\n"
        "<style>\n" + scoped_css + "\n}\n" + EMBED_FLOW_CSS + "\n</style>\n"
        f'<div class="{PROPOSAL_SCOPE}" id="{PROPOSAL_SCOPE}">\n'
        + content +
        "</div>\n"
    )
    embed_out = embed_out.replace("{{", "{").replace("}}", "}")
    embed_out = apply_placeholders(embed_out, COMMERCIAL)
    OUT.write_text(html_out, encoding="utf-8")
    OUT_ALIAS.write_text(html_out, encoding="utf-8")
    OUT_EMBED.write_text(embed_out, encoding="utf-8")
    print(f"Wrote {OUT.name} ({OUT.stat().st_size:,} bytes)")
    print(f"Also wrote {OUT_ALIAS.name}")
    print(f"CRM embed fragment: {OUT_EMBED.name}")
    print(f"Appendix docs: {len(DOC_FILES)}")
    print(f"Screen keys: {len(sc)}")


if __name__ == "__main__":
    main()
