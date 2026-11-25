/* ── Publications ─────────────────────────────────────────── */

const AUTHOR_NAMES = [
  "Angelo Geninatti Cossatin",
  "A\\.G\\. Cossatin",
  "A\\. Geninatti Cossatin",
];

const TYPE_LABELS = {
  journal:    "Journal",
  conference: "Conference",
  workshop:   "Workshop",
  thesis:     "Thesis",
};

const TYPE_PLURALS = {
  journal:    "journal papers",
  conference: "conference papers",
  workshop:   "workshop papers",
  thesis:     "theses",
};

// Collapsed view shows this many of the most recent papers of one type
// (journals for "All"). Keep in sync with PUB_COLLAPSE_LIMIT in generate_html.py.
const PUB_COLLAPSE_LIMIT = 5;

let allPubs = [];
let activeFilter = "all";
let pubToggle = null;

async function loadPublications() {
  try {
    const res = await fetch("publications.json");
    if (!res.ok) throw new Error("Failed to load publications.json");
    allPubs = await res.json();
    renderPublications(allPubs);
  } catch (err) {
    document.getElementById("publications-list").innerHTML =
        `<p style="color:var(--muted);font-size:.9rem;">Could not load publications. ${err.message}</p>`;
  }
}

function highlightAuthor(authors) {
  return authors.replace(
      new RegExp(AUTHOR_NAMES.join("|"), "g"),
      match => `<strong>${match}</strong>`
  );
}

function pubCard(pub, extra = false) {
  const doiHref = pub.doi ? `https://doi.org/${pub.doi}` : null;
  const title = doiHref
      ? `<a href="${doiHref}" target="_blank" rel="noopener">${pub.title}</a>`
      : pub.title;

  const actions = [];
  if (doiHref) {
    actions.push(`
      <a class="pub-action-btn" href="${doiHref}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        DOI
      </a>`);
  }
  if (pub.pdf) {
    actions.push(`
      <a class="pub-action-btn pdf" href="${pub.pdf}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        PDF
      </a>`);
  }

  return `
    <div class="pub-card fade-in${extra ? " is-extra" : ""}" data-type="${pub.type}">
      <div class="pub-type-stripe ${pub.type}"></div>
      <div class="pub-body">
        <div class="pub-meta">
          <span class="pub-type-badge ${pub.type}">${TYPE_LABELS[pub.type] ?? pub.type}</span>
        </div>
        <div class="pub-title">${title}</div>
        <div class="pub-authors">${highlightAuthor(pub.authors)}</div>
        <div class="pub-venue">${[pub.venue, pub.year].filter(Boolean).join(", ")}</div>
        ${actions.length ? `<div class="pub-actions">${actions.join("")}</div>` : ""}
      </div>
    </div>`;
}

const TYPE_ORDER = { journal: 0, conference: 1, workshop: 2, thesis: 3 };

/* Publications visible while collapsed (mirror of shown_pubs() in
   generate_html.py): those with "featured": true (most recent first, at most
   PUB_COLLAPSE_LIMIT), topped up to PUB_COLLAPSE_LIMIT with the most recent
   non-featured ones of the fill type (journals for "All", otherwise the
   filtered type; any type if there are none of it). Same-year papers keep
   their JSON order. */
function shownPubs(filtered) {
  const fillType = activeFilter === "all" ? "journal" : activeFilter;
  const ordered = [...filtered].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  let fill = ordered.filter(p => p.type === fillType);
  if (fill.length === 0) fill = ordered;
  const featured = ordered.filter(p => p.featured).slice(0, PUB_COLLAPSE_LIMIT);
  const rest = fill.filter(p => !p.featured).slice(0, PUB_COLLAPSE_LIMIT - featured.length);
  return new Set([...featured, ...rest]);
}

function renderPublications(pubs) {
  const container = document.getElementById("publications-list");

  const filtered = activeFilter === "all" ? pubs : pubs.filter(p => p.type === activeFilter);
  const shown = shownPubs(filtered);

  const byYear = {};
  for (const p of filtered) {
    (byYear[p.year] ??= []).push(p);
  }

  if (activeFilter === "all") {
    for (const year of Object.keys(byYear)) {
      byYear[year].sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));
    }
  }

  const years = Object.keys(byYear).sort((a, b) => b - a);

  if (years.length === 0) {
    container.innerHTML = `<p style="color:var(--muted);font-size:.9rem;">No publications in this category.</p>`;
    pubToggle?.refresh();
    return;
  }

  container.innerHTML = years.map(year => {
    const groupExtra = byYear[year].some(p => shown.has(p)) ? "" : " is-extra";
    return `
    <div class="pub-year-group${groupExtra}">
      <div class="pub-year-header">${year}</div>
      ${byYear[year].map(p => pubCard(p, !shown.has(p))).join("")}
    </div>`;
  }).join("");

  pubToggle?.refresh();
  observeFadeIns();
}

function setupFilters() {
  document.querySelectorAll(".pub-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pub-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      // Each filter starts collapsed, showing its own selection.
      document.getElementById("publications-list").classList.remove("expanded");
      renderPublications(allPubs);
    });
  });
}


/* ── "Show more" toggles for collapsed lists ──────────────── */
/* Lists render every item; the ones beyond the collapse limit carry the
   "is-extra" class and are hidden by CSS until the list gets "expanded". */
function makeToggle(list, collapsedLabel) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "show-more-btn";
  if (list.id) btn.setAttribute("aria-controls", list.id);

  btn.refresh = () => {
    const expanded = list.classList.contains("expanded");
    btn.hidden = !list.querySelector(".is-extra");
    btn.textContent = expanded ? "Show less" : collapsedLabel();
    btn.setAttribute("aria-expanded", String(expanded));
  };

  btn.addEventListener("click", () => {
    // Keep the button at the same spot on screen when collapsing, so the
    // reader isn't left far below the list they just closed.
    const before = btn.getBoundingClientRect().top;
    if (list.classList.contains("expanded")) {
      // Collapsing scrolls content from above into view. Anything up there
      // that hasn't faded in yet (e.g. after a reload restored the scroll
      // position mid-page) should just be there, not animate in.
      document.querySelectorAll(".fade-in:not(.visible)").forEach(el => {
        if (el.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) revealInstantly(el);
      });
    }
    list.classList.toggle("expanded");
    btn.refresh();
    if (!list.classList.contains("expanded")) {
      window.scrollBy({ top: btn.getBoundingClientRect().top - before, behavior: "instant" });
    }
  });

  btn.refresh();
  list.after(btn);
  return btn;
}

function setupListToggles() {
  document.querySelectorAll(".timeline, .awards-list").forEach(list => {
    const hidden = list.querySelectorAll(":scope > .is-extra").length;
    if (hidden) makeToggle(list, () => `Show ${hidden} more`);
  });
}

function setupPubToggle() {
  const list = document.getElementById("publications-list");
  pubToggle = makeToggle(list, () => {
    const n = activeFilter === "all"
        ? allPubs.length
        : allPubs.filter(p => p.type === activeFilter).length;
    // Before publications.json loads, count the cards baked into the HTML.
    const count = n || list.querySelectorAll(".pub-card").length;
    const what = activeFilter === "all" ? "publications" : TYPE_PLURALS[activeFilter] ?? "publications";
    return `Show all ${count} ${what}`;
  });
}


/* ── Nav active state + URL hash on scroll ────────────────── */
function setupNavHighlight() {
  const navLinks = document.querySelectorAll(".nav-links a, .nav-mobile-menu a");
  const linkedIds = [...new Set(
    Array.from(navLinks).map(a => a.getAttribute("href").slice(1))
  )];
  const NAV_H = 64;

  function update() {
    let activeId = null;
    for (const id of linkedIds) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= NAV_H) activeId = id;
    }
    navLinks.forEach(a =>
        a.classList.toggle("active", a.getAttribute("href") === "#" + activeId)
    );
    const hash = activeId ? "#" + activeId : location.pathname;
    history.replaceState(null, "", hash);
  }

  window.addEventListener("scroll", update, { passive: true });
  update();
}

/* ── Fade-in on scroll ────────────────────────────────────── */
function revealInstantly(el) {
  el.style.transition = "none";
  el.classList.add("visible");
  void el.offsetHeight; // apply the final state before restoring the transition
  el.style.transition = "";
}

function observeFadeIns() {
  // Reveal once the top edge is ~20px into the viewport, independent of the
  // element's height (a % threshold on a tall section needs a lot of scrolling).
  // Only content scrolled into view from below fades in; content coming in
  // from above (scrolling up after landing mid-page) appears as is.
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        if (e.boundingClientRect.top < (e.rootBounds?.top ?? 0)) revealInstantly(e.target);
        else e.target.classList.add("visible");
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0, rootMargin: "0px 0px -20px 0px" });

  document.querySelectorAll(".fade-in:not(.visible)").forEach(el => obs.observe(el));
}

/* ── Mobile hamburger menu ────────────────────────────────── */
function setupHamburger() {
  const btn = document.getElementById("nav-hamburger");
  const menu = document.getElementById("nav-mobile-menu");
  if (!btn || !menu) return;

  function close() {
    btn.setAttribute("aria-expanded", "false");
    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
  }

  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    if (open) {
      close();
    } else {
      btn.setAttribute("aria-expanded", "true");
      menu.classList.add("open");
      menu.setAttribute("aria-hidden", "false");
    }
  });

  menu.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
  document.addEventListener("click", e => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) close();
  });
}

/* ── Boot ─────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  setupPubToggle();
  setupListToggles();
  loadPublications();
  setupFilters();
  setupNavHighlight();
  setupHamburger();
  observeFadeIns();
});
