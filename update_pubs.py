"""
Refresh publications.json from ORCID.

Usage:
    pip install requests          # one-time
    python update_pubs.py

Merge rules (safe to run at any time):
  - Existing entry matched by DOI   → only adds a missing DOI; everything else
    (authors, venue, pdf, notes …)  is left exactly as you wrote it.
  - Existing entry matched by title → same as above.
  - New entry on ORCID              → appended with data from ORCID API.

"""

import json
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    sys.exit("Please install requests:  pip install requests")

# ── Config ─────────────────────────────────────────────────────────────────
ORCID_ID  = "0009-0007-5378-7061"
BASE      = f"https://pub.orcid.org/v3.0/{ORCID_ID}"
HEADERS   = {"Accept": "application/json"}
OUT       = Path(__file__).parent / "publications.json"
DELAY     = 0.15   # seconds between detail requests (be polite to ORCID)

# ORCID type → our type
TYPE_MAP = {
    "journal-article":     "journal",
    "conference-paper":    "conference",
    "conference-abstract": "conference",
    "book-chapter":        "workshop",   # workshop proceedings often end up as book chapters
    "dissertation":        "thesis",
    "report":              "workshop",
    "preprint":            "workshop",
    "working-paper":       "workshop",
}


# ── ORCID helpers ───────────────────────────────────────────────────────────

def get(url: str) -> dict:
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()


def works_summaries() -> list[dict]:
    """Return one summary per work (preferred one from each group)."""
    data = get(f"{BASE}/works")
    return [g["work-summary"][0] for g in data.get("group", []) if g.get("work-summary")]


def work_detail(put_code: int) -> dict:
    return get(f"{BASE}/work/{put_code}")


def _clean(text: str) -> str:
    """Replace NBSPs and exotic whitespace with plain spaces, then collapse."""
    import unicodedata
    cleaned = "".join(
        " " if unicodedata.category(ch) in ("Zs", "Cc", "Cf") or ch in ("\xa0", "​", "‌", "‍", "﻿")
        else ch
        for ch in (text or "")
    )
    return " ".join(cleaned.split())


def _normalize_name(name: str) -> str:
    """Convert 'Lastname, Firstname' → 'Firstname Lastname'."""
    if name.count(",") == 1:
        last, _, first = name.partition(",")
        last, first = last.strip(), first.strip()
        if first:
            return f"{first} {last}"
    return name


def extract_doi(external_ids: Optional[dict]) -> Optional[str]:
    if not external_ids:
        return None
    for eid in external_ids.get("external-id", []):
        if eid.get("external-id-type") == "doi":
            val = _clean(eid.get("external-id-value", ""))
            return val if val else None
    return None


def extract_title(work: dict) -> str:
    return _clean((work.get("title") or {}).get("title", {}).get("value", ""))


def extract_year(work: dict) -> Optional[int]:
    pd  = work.get("publication-date") or {}
    yr  = pd.get("year") or {}
    val = yr.get("value") if isinstance(yr, dict) else str(yr)
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def extract_authors(work: dict) -> str:
    contributors = (work.get("contributors") or {}).get("contributor", [])
    names = []
    for c in contributors:
        cn = _clean((c.get("credit-name") or {}).get("value", ""))
        if cn:
            names.append(_normalize_name(cn))
    return ", ".join(names) if names else ""


def extract_venue(work: dict) -> str:
    jt = work.get("journal-title") or {}
    raw = jt.get("value", "") if isinstance(jt, dict) else str(jt)
    return _clean(raw)


def guess_type(orcid_type: str, venue: str = "") -> str:
    v = venue.lower()
    # Venue-name overrides are more reliable than ORCID's self-reported type
    if any(k in v for k in ("journal", "transactions", "ieee access")):
        return "journal"
    if any(k in v for k in ("workshop", "adjunct proceedings", "ceur", "adjunct")):
        return "workshop"
    if orcid_type == "book-chapter":
        return "workshop"
    if orcid_type == "dissertation":
        return "thesis"
    if any(k in v for k in ("proceedings", "conference", "symposium")):
        return "conference"
    return TYPE_MAP.get((orcid_type or "").lower(), "conference")


def make_id(put_code: int, title: str, year: Optional[int]) -> str:
    slug = "".join(c if c.isalnum() else "_" for c in title[:30]).strip("_").lower()
    return f"orcid_{put_code}_{slug}"


# ── Merge helpers ───────────────────────────────────────────────────────────

def title_sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def find_existing(existing: list, doi: Optional[str], title: str) -> Optional[dict]:
    """Return the first existing entry that matches by DOI or (≥90%) title similarity."""
    if doi:
        doi_l = doi.lower()
        for e in existing:
            if (e.get("doi") or "").lower() == doi_l:
                return e
    for e in existing:
        if title_sim(e.get("title", ""), title) >= 0.90:
            return e
    return None


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    # Load current state
    existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else []
    print(f"Existing entries in JSON : {len(existing)}")

    print(f"Fetching works list from ORCID ({ORCID_ID}) …")
    summaries = works_summaries()
    print(f"ORCID reports {len(summaries)} work(s).\n")

    doi_updated = 0
    added       = 0

    for s in summaries:
        put_code = s.get("put-code")
        title    = extract_title(s)
        if not title:
            continue

        doi = extract_doi(s.get("external-ids"))

        match = find_existing(existing, doi, title)

        if match is not None:
            # ── Existing entry: only fill in a missing DOI ──────────────────
            if doi and not match.get("doi"):
                match["doi"] = doi
                doi_updated += 1
                print(f"  DOI added  : {title[:65]}")
            # Everything else (authors, venue, pdf, note, type …) is untouched
            continue

        # ── New entry: fetch full details from ORCID ────────────────────────
        print(f"  New entry  : {title[:65]}")
        try:
            detail = work_detail(put_code)
            time.sleep(DELAY)
        except Exception as exc:
            print(f"             ↳ Warning: could not fetch details ({exc}); using summary.")
            detail = s

        authors = extract_authors(detail)
        venue   = extract_venue(detail)
        year    = extract_year(detail)
        full_doi = extract_doi(detail.get("external-ids")) or doi

        entry = {
            "id":      make_id(put_code, title, year),
            "type":    guess_type(detail.get("type", ""), venue),
            "title":   title,
            "authors": authors or "— see DOI —",
            "venue":   venue,
            "year":    year,
            "doi":     full_doi,
            "pdf":     None,
            "note":    "",
        }

        existing.append(entry)
        added += 1

    # ── Sort and save ────────────────────────────────────────────────────────
    existing.sort(key=lambda p: (-(p.get("year") or 0), p.get("title", "")))
    OUT.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")

    print()
    if doi_updated == 0 and added == 0:
        print("Nothing changed — publications.json is already up to date.")
    else:
        if doi_updated:
            print(f"{doi_updated} existing entry/entries received a missing DOI.")
        if added:
            print(f"{added} new entry/entries appended.")
        print(f"\nSaved → {OUT}")
    print("Tip: review any entries marked 'Added automatically from ORCID'.")


if __name__ == "__main__":
    main()
