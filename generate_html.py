"""
Bake the content of the JSON data files (about.json, research.json, projects.json,
teaching.json, service.json, publications.json) directly into index.html.

Why: a crawler that doesn't execute JS would otherwise see empty containers, since
these sections used to be rendered client-side by fetching the JSON and setting
innerHTML. This script renders the same markup and splices it into index.html
directly (by container id, preserving everything else in the file byte-for-byte),
so the content is present in the served HTML. Re-run it after editing any of the
JSON files to keep index.html in sync.

Usage:
    python generate_html.py
"""

import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
INDEX = ROOT / "index.html"

AUTHOR_NAMES = [
    "Angelo Geninatti Cossatin",
    r"A\.G\. Cossatin",
    r"A\. Geninatti Cossatin",
]
AUTHOR_RE = re.compile("|".join(AUTHOR_NAMES))

TYPE_LABELS = {
    "journal": "Journal",
    "conference": "Conference",
    "workshop": "Workshop",
    "thesis": "Thesis",
}
TYPE_ORDER = {"journal": 0, "conference": 1, "workshop": 2, "thesis": 3}

# Collapsed lists show N items: those with "featured": true first (most
# recent ones if there are more than N), then the most recent others until
# there are N. Display order stays chronological and featured items look like
# any other. The remaining items get the "is-extra" class (hidden by style.css
# until script.js's "Show more" toggle expands the list); they stay in the
# HTML so crawlers still see them.
# Keep PUB_COLLAPSE_LIMIT and the selection logic in sync with script.js.
LIST_COLLAPSE_LIMIT = 3
PUB_COLLAPSE_LIMIT = 5
CURRENT_YEAR = datetime.date.today().year


def recency_key(date_str):
    """Sort key for free-text dates like "2026", "2023–2026", "2025–present",
    "2024 · 2025 · 2026": (latest year, earliest year), with "present"
    counting as the current year."""
    s = str(date_str).lower().replace("present", str(CURRENT_YEAR))
    years = [int(y) for y in re.findall(r"\d{4}", s)]
    return (max(years), min(years)) if years else (0, 0)


def most_recent_first(items, field="date"):
    # sorted() is stable, so entries with the same dates keep their JSON order.
    return sorted(items, key=lambda it: recency_key(it.get(field, "")), reverse=True)


def pick_shown(ordered, limit, fill=None):
    """ids of the items visible while collapsed. `ordered` is most recent
    first; `fill` (default: all of `ordered`) is the pool of non-featured
    items used to top the featured ones up to `limit`."""
    featured = [it for it in ordered if it.get("featured")][:limit]
    rest = [it for it in (ordered if fill is None else fill) if not it.get("featured")]
    return {id(it) for it in featured + rest[:limit - len(featured)]}


def load(name):
    with open(ROOT / name, encoding="utf-8") as f:
        return json.load(f)


def highlight_author(authors):
    return AUTHOR_RE.sub(lambda m: f"<strong>{m.group(0)}</strong>", authors)


def pub_card(pub, extra=False):
    doi_href = f"https://doi.org/{pub['doi']}" if pub.get("doi") else None
    title = f'<a href="{doi_href}" target="_blank" rel="noopener">{pub["title"]}</a>' if doi_href else pub["title"]

    actions = []
    if doi_href:
        actions.append(f'''
      <a class="pub-action-btn" href="{doi_href}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        DOI
      </a>''')
    if pub.get("pdf"):
        actions.append(f'''
      <a class="pub-action-btn pdf" href="{pub['pdf']}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        PDF
      </a>''')

    year = pub.get("year")
    return f'''
    <div class="pub-card fade-in{' is-extra' if extra else ''}" data-type="{pub['type']}">
      <div class="pub-type-stripe {pub['type']}"></div>
      <div class="pub-body">
        <div class="pub-meta">
          <span class="pub-type-badge {pub['type']}">{TYPE_LABELS.get(pub['type'], pub['type'])}</span>
        </div>
        <div class="pub-title">{title}</div>
        <div class="pub-authors">{highlight_author(pub['authors'])}</div>
        <div class="pub-venue">{', '.join(str(x) for x in (pub['venue'], year) if x)}</div>
        {f'<div class="pub-actions">{"".join(actions)}</div>' if actions else ''}
      </div>
    </div>'''


def shown_pubs(pubs, fill_type="journal"):
    """Mirror of shownPubs() in script.js: featured publications of any type,
    topped up with the most recent ones of fill_type (any type if there are
    none of it). Within a year the JSON order is kept."""
    ordered = sorted(pubs, key=lambda p: p.get("year") or 0, reverse=True)
    fill = [p for p in ordered if p["type"] == fill_type] or ordered
    return pick_shown(ordered, PUB_COLLAPSE_LIMIT, fill)


def render_publications(pubs):
    # Baked markup matches script.js's initial state: filter "all", collapsed.
    shown = shown_pubs(pubs)
    by_year = {}
    for p in pubs:
        by_year.setdefault(p.get("year"), []).append(p)

    for year in by_year:
        by_year[year].sort(key=lambda p: TYPE_ORDER.get(p["type"], 99))

    years = sorted(by_year.keys(), key=lambda y: (y is None, y), reverse=True)

    def group(year):
        group_cls = "" if any(id(p) in shown for p in by_year[year]) else " is-extra"
        cards = "".join(pub_card(p, id(p) not in shown) for p in by_year[year])
        return f'''
    <div class="pub-year-group{group_cls}">
      <div class="pub-year-header">{year}</div>
      {cards}
    </div>'''

    return "".join(group(year) for year in years)


def render_timeline(items, limit=None):
    if limit is not None:
        items = most_recent_first(items)
        shown = pick_shown(items, limit)
    extra = lambda it: " is-extra" if limit is not None and id(it) not in shown else ""
    return "".join(f'''
        <div class="tl-item fade-in{extra(it)}">
          <div class="tl-date">{it['date']}</div>
          <div class="tl-content">
            <div class="tl-title">{it['title']}</div>
            <div class="tl-org">{it['org']}</div>
            {f'<div class="tl-desc">{it["desc"]}</div>' if it.get('desc') else ''}
          </div>
        </div>''' for it in items)


def render_awards(items, limit=None):
    if limit is not None:
        items = most_recent_first(items, field="year")
        shown = pick_shown(items, limit)
    extra = lambda a: " is-extra" if limit is not None and id(a) not in shown else ""
    return "".join(f'''
        <li class="award-item fade-in{extra(a)}">
          <div class="award-dot"></div>
          <div>
            <div class="award-text">{a['text']}</div>
            <div class="award-year">{a['year']}</div>
          </div>
        </li>''' for a in items)


def render_interests(items):
    return "".join(f'<span class="interest-tag">{i["text"]}</span>' for i in items)


def replace_container(html_text, tag, element_id, new_inner):
    """Replace the contents of <tag id="element_id"> in html_text, leaving
    everything else untouched. Handles nested tags of the same name (e.g. a
    <div id="X"> that contains other <div>s) by counting open/close tags."""
    open_re = re.compile(rf'<{tag}\b[^>]*\bid="{re.escape(element_id)}"[^>]*>')
    m = open_re.search(html_text)
    if not m:
        raise SystemExit(f"index.html is missing a <{tag}> with id={element_id!r}")
    content_start = m.end()

    tag_re = re.compile(rf'<{tag}\b[^>]*>|</{tag}>', re.IGNORECASE)
    depth = 1
    content_end = None
    for tm in tag_re.finditer(html_text, content_start):
        depth += -1 if tm.group(0).startswith("</") else 1
        if depth == 0:
            content_end = tm.start()
            break
    if content_end is None:
        raise SystemExit(f"Could not find matching </{tag}> for id={element_id!r}")

    return html_text[:content_start] + new_inner + html_text[content_end:]


def main():
    about = load("about.json")
    research = load("research.json")
    projects = load("projects.json")
    teaching = load("teaching.json")
    service = load("service.json")
    publications = load("publications.json")

    html_text = INDEX.read_text(encoding="utf-8")

    replacements = [
        ("div", "interests-list", render_interests(about["interests"])),
        ("div", "research-list", render_timeline(research, LIST_COLLAPSE_LIMIT)),
        ("div", "projects-list", render_timeline(projects, LIST_COLLAPSE_LIMIT)),
        ("div", "teaching-courses-list", render_timeline(teaching["courses"], LIST_COLLAPSE_LIMIT)),
        ("div", "teaching-guest-lectures-list", render_timeline(teaching["guestLectures"], LIST_COLLAPSE_LIMIT)),
        ("div", "teaching-student-support-list", render_timeline(teaching["studentSupport"], LIST_COLLAPSE_LIMIT)),
        ("div", "teaching-thesis-list", render_timeline(teaching["thesisSupervision"], LIST_COLLAPSE_LIMIT)),
        ("div", "service-conference-list", render_timeline(service["conferenceOrganisation"], LIST_COLLAPSE_LIMIT)),
        ("div", "service-volunteering-list", render_timeline(service["studentVolunteering"], LIST_COLLAPSE_LIMIT)),
        ("ul", "service-awards-list", render_awards(service["awardsGrants"], LIST_COLLAPSE_LIMIT)),
        ("div", "publications-list", render_publications(publications)),
    ]
    for tag, element_id, inner in replacements:
        html_text = replace_container(html_text, tag, element_id, inner)

    INDEX.write_text(html_text, encoding="utf-8")
    print(f"Wrote {INDEX}")


if __name__ == "__main__":
    main()
