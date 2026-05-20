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

let allPubs = [];
let activeFilter = "all";

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

function pubCard(pub) {
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
    <div class="pub-card fade-in" data-type="${pub.type}">
      <div class="pub-type-stripe ${pub.type}"></div>
      <div class="pub-body">
        <div class="pub-meta">
          <span class="pub-type-badge ${pub.type}">${TYPE_LABELS[pub.type] ?? pub.type}</span>
        </div>
        <div class="pub-title">${title}</div>
        <div class="pub-authors">${highlightAuthor(pub.authors)}</div>
        <div class="pub-venue">${pub.venue}${pub.year ? ", " + pub.year : ""}</div>
        ${actions.length ? `<div class="pub-actions">${actions.join("")}</div>` : ""}
        ${pub.note && !pub.note.startsWith("Added automatically") ? `<div class="pub-note">${pub.note}</div>` : ""}
      </div>
    </div>`;
}

function renderPublications(pubs) {
  const container = document.getElementById("publications-list");

  const filtered = activeFilter === "all" ? pubs : pubs.filter(p => p.type === activeFilter);

  const byYear = {};
  for (const p of filtered) {
    (byYear[p.year] ??= []).push(p);
  }
  const years = Object.keys(byYear).sort((a, b) => b - a);

  if (years.length === 0) {
    container.innerHTML = `<p style="color:var(--muted);font-size:.9rem;">No publications in this category.</p>`;
    return;
  }

  container.innerHTML = years.map(year => `
    <div class="pub-year-group">
      <div class="pub-year-header">${year}</div>
      ${byYear[year].map(pubCard).join("")}
    </div>`).join("");

  observeFadeIns();
}

function setupFilters() {
  document.querySelectorAll(".pub-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pub-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      renderPublications(allPubs);
    });
  });
}

/* ── Experience tabs ──────────────────────────────────────── */
function setupExpTabs() {
  document.querySelectorAll(".exp-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".exp-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".exp-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const target = document.getElementById(tab.dataset.tab);
      if (target) {
        target.classList.add("active");
        observeFadeIns();
      }
    });
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
function observeFadeIns() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });

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
  loadPublications();
  setupFilters();
  setupExpTabs();
  setupNavHighlight();
  setupHamburger();
  observeFadeIns();
});
