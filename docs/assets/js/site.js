(() => {
  const REPO = "Gtarafdar/porter";
  const API = `https://api.github.com/repos/${REPO}`;
  const FALLBACK_TAG = "v0.2.34";
  const FALLBACK_DMG = `https://github.com/${REPO}/releases/latest/download/Porter-0.2.34-mac-arm64.dmg`;
  const FALLBACK_ZIP = `https://github.com/${REPO}/releases/latest/download/Porter-0.2.34-mac-arm64.zip`;

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* Mobile nav */
  const drawer = document.getElementById("mobile-drawer");
  const openBtn = document.getElementById("menu-open");
  const closeBtn = document.getElementById("menu-close");

  function setNavOpen(open) {
    document.body.classList.toggle("nav-open", open);
    if (drawer) drawer.hidden = !open;
    if (openBtn) openBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  openBtn?.addEventListener("click", () => setNavOpen(true));
  closeBtn?.addEventListener("click", () => setNavOpen(false));
  drawer?.addEventListener("click", (e) => {
    if (e.target === drawer) setNavOpen(false);
  });
  drawer?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => setNavOpen(false));
  });

  /* Side nav current section + sliding pill */
  const navMenu = document.getElementById("side-nav-menu");
  const navIndicator = document.getElementById("nav-indicator");
  const navLinks = [...document.querySelectorAll("[data-nav]")];
  const sections = navLinks
    .map((a) => {
      const id = a.getAttribute("href")?.slice(1);
      const el = id ? document.getElementById(id === "top" ? "overview" : id) || document.getElementById(id) : null;
      return { a, el };
    })
    .filter((x) => x.el);

  let activeNav = sections[0]?.a || null;
  let hoverNav = null;

  function moveNavIndicator(target) {
    if (!navMenu || !navIndicator || !target) {
      if (navIndicator) navIndicator.style.opacity = "0";
      return;
    }
    const menuRect = navMenu.getBoundingClientRect();
    const linkRect = target.getBoundingClientRect();
    const top = linkRect.top - menuRect.top + navMenu.scrollTop;
    navIndicator.style.transform = `translateY(${Math.max(0, top)}px)`;
    navIndicator.style.height = `${linkRect.height}px`;
    navIndicator.style.opacity = "1";
    navMenu.classList.add("has-indicator");
  }

  function refreshCurrent() {
    let active = sections[0]?.a;
    const y = window.scrollY + 120;
    for (const { a, el } of sections) {
      if (el.offsetTop <= y) active = a;
    }
    activeNav = active || null;
    navLinks.forEach((a) => a.removeAttribute("aria-current"));
    activeNav?.setAttribute("aria-current", "true");
    if (!hoverNav) moveNavIndicator(activeNav);
  }

  window.addEventListener("scroll", refreshCurrent, { passive: true });
  window.addEventListener("resize", () => moveNavIndicator(hoverNav || activeNav), { passive: true });
  refreshCurrent();

  if (navMenu) {
    navLinks.forEach((a) => {
      a.addEventListener("pointerenter", () => {
        hoverNav = a;
        moveNavIndicator(a);
      });
    });
    navMenu.addEventListener("pointerleave", () => {
      hoverNav = null;
      moveNavIndicator(activeNav);
    });
  }

  /* Feature cards */
  document.querySelectorAll(".feat").forEach((btn) => {
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      document.querySelectorAll(".feat").forEach((b) => b.setAttribute("aria-expanded", "false"));
      btn.setAttribute("aria-expanded", open ? "false" : "true");
    });
  });

  /* Lightbox */
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxClose = document.getElementById("lightbox-close");

  function closeLightbox() {
    lightbox?.classList.remove("open");
    if (lightboxImg) lightboxImg.src = "";
  }

  document.querySelectorAll(".shot, .howto-shot[data-full]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.getAttribute("data-full");
      if (!src || !lightbox || !lightboxImg) return;
      lightboxImg.src = src;
      lightboxImg.alt = btn.querySelector("img")?.alt || "Screenshot";
      lightbox.classList.add("open");
    });
  });
  lightboxClose?.addEventListener("click", closeLightbox);
  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  /* Reveal */
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
  }

  function pickAsset(assets, kind) {
    const list = assets || [];
    const prefer =
      kind === "dmg"
        ? [/arm64\.dmg$/i, /mac-arm64\.dmg$/i, /mac\.dmg$/i, /\.dmg$/i]
        : [/arm64\.zip$/i, /mac-arm64\.zip$/i, /mac\.zip$/i, /\.zip$/i];
    for (const re of prefer) {
      const hit = list.find((a) => re.test(a.name || ""));
      if (hit) return hit.browser_download_url;
    }
    return null;
  }

  function setDownloads(tag, dmgUrl, zipUrl) {
    const label = document.getElementById("release-label");
    const chip = document.getElementById("version-chip");
    if (label) label.textContent = tag ? `${tag} for Apple Silicon` : "Latest for Apple Silicon";
    if (chip) chip.textContent = tag || "Latest release";
    const dmg = dmgUrl || FALLBACK_DMG;
    const zip = zipUrl || FALLBACK_ZIP;
    ["btn-dmg", "download-dmg"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = dmg;
    });
    ["btn-zip", "download-zip"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = zip;
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatReleaseBody(md) {
    const raw = String(md || "").replace(/\r\n/g, "\n").trim();
    if (!raw) return "<p>See release notes on GitHub.</p>";
    const lines = raw.split("\n");
    const out = [];
    let inList = false;
    const closeList = () => {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
    };
    for (const line of lines) {
      const t = line.trimEnd();
      if (/^\s*[-*]\s+/.test(t)) {
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        out.push(`<li>${escapeHtml(t.replace(/^\s*[-*]\s+/, ""))}</li>`);
        continue;
      }
      closeList();
      if (!t.trim()) {
        out.push("");
        continue;
      }
      if (/^###\s+/.test(t)) {
        out.push(`<h5>${escapeHtml(t.replace(/^###\s+/, ""))}</h5>`);
      } else if (/^##\s+/.test(t)) {
        out.push(`<h4>${escapeHtml(t.replace(/^##\s+/, ""))}</h4>`);
      } else if (/^#\s+/.test(t)) {
        out.push(`<h4>${escapeHtml(t.replace(/^#\s+/, ""))}</h4>`);
      } else {
        out.push(`<p>${escapeHtml(t)}</p>`);
      }
    }
    closeList();
    return out.filter((x) => x !== undefined).join("");
  }

  function renderChangelog(releases) {
    const tree = document.getElementById("changelog-tree");
    if (!tree) return;
    tree.innerHTML = "";
    const sorted = [...(releases || [])]
      .filter((r) => r && !r.draft)
      .sort((a, b) => {
        const tb = Date.parse(b.published_at || b.created_at || 0) || 0;
        const ta = Date.parse(a.published_at || a.created_at || 0) || 0;
        return tb - ta;
      });
    sorted.slice(0, 20).forEach((r) => {
      const li = document.createElement("li");
      const time = document.createElement("time");
      const date = r.published_at ? new Date(r.published_at) : null;
      time.dateTime = r.published_at || "";
      time.textContent = date
        ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : "";
      const strong = document.createElement("strong");
      const a = document.createElement("a");
      a.href = r.html_url;
      a.rel = "noopener";
      a.textContent = r.tag_name || r.name || "Release";
      strong.appendChild(a);
      if (r.name && r.name !== r.tag_name) {
        const title = document.createElement("span");
        title.className = "changelog-title";
        title.textContent = ` · ${r.name}`;
        strong.appendChild(title);
      }
      const body = document.createElement("div");
      body.className = "changelog-body";
      body.innerHTML = formatReleaseBody(r.body || r.name || "");
      li.append(time, strong, body);
      tree.appendChild(li);
    });
    if (!tree.children.length) {
      tree.innerHTML =
        '<li><strong><a href="https://github.com/Gtarafdar/porter/releases">Releases</a></strong><div class="changelog-body"><p>Could not load changelog. Open GitHub Releases.</p></div></li>';
    }
  }

  async function loadReleases() {
    try {
      const [latestRes, listRes] = await Promise.all([
        fetch(`${API}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } }),
        fetch(`${API}/releases?per_page=20`, { headers: { Accept: "application/vnd.github+json" } }),
      ]);
      if (!latestRes.ok) throw new Error("latest failed");
      const latest = await latestRes.json();
      let list = listRes.ok ? await listRes.json() : [latest];
      if (!Array.isArray(list)) list = [latest];
      if (latest?.id && !list.some((r) => r.id === latest.id)) list = [latest, ...list];
      const dmg = pickAsset(latest.assets, "dmg");
      const zip = pickAsset(latest.assets, "zip");
      setDownloads(latest.tag_name || FALLBACK_TAG, dmg, zip);
      renderChangelog(list);
    } catch {
      setDownloads(FALLBACK_TAG, FALLBACK_DMG, FALLBACK_ZIP);
      renderChangelog([
        {
          tag_name: FALLBACK_TAG,
          html_url: `https://github.com/${REPO}/releases/tag/${FALLBACK_TAG}`,
          published_at: "2026-07-24T18:31:42Z",
          body: "Multi-IDE MCP connectors. Activity Save panel. See GitHub for full notes.",
        },
      ]);
    }
  }

  /* How-to stack: two-way scroll reveal */
  (function initHowtoStack() {
    const stack = document.getElementById("howto-stack");
    const stage = document.getElementById("howto-stage");
    const cards = stage ? [...stage.querySelectorAll(".howto-card")] : [];
    const dotsWrap = document.getElementById("howto-dots");
    const currentEl = document.getElementById("howto-current");
    const totalEl = document.getElementById("howto-total");
    if (!stack || !stage || cards.length < 2) return;

    const n = cards.length;
    stack.style.setProperty("--steps", String(n));
    if (totalEl) totalEl.textContent = String(n);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = () => window.matchMedia("(max-width: 860px)").matches;

    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      cards.forEach((_, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "howto-dot";
        b.setAttribute("aria-label", `Go to step ${idx + 1}`);
        b.addEventListener("click", () => {
          if (mobile() || reduceMotion) {
            cards[idx].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
            setActive(idx);
            return;
          }
          const top = stack.offsetTop + (idx / Math.max(n - 1, 1)) * (stack.offsetHeight - window.innerHeight);
          window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
        });
        dotsWrap.appendChild(b);
      });
    }

    let active = 0;
    function setActive(i) {
      active = Math.max(0, Math.min(n - 1, i));
      if (currentEl) currentEl.textContent = String(active + 1);
      cards.forEach((c, idx) => c.classList.toggle("is-active", idx === active));
      if (dotsWrap) {
        [...dotsWrap.children].forEach((d, idx) => {
          if (idx === active) d.setAttribute("aria-current", "true");
          else d.removeAttribute("aria-current");
        });
      }
    }

    function paint(exact) {
      cards.forEach((card, idx) => {
        const d = idx - exact;
        let y = 0;
        let scale = 1;
        let opacity = 1;
        let z = 100 + idx;
        if (d < 0) {
          y = d * 18;
          scale = Math.max(0.86, 1 + d * 0.045);
          opacity = Math.max(0.25, 1 + d * 0.4);
          z = 40 + idx;
        } else if (d > 0) {
          y = Math.min(110, 28 + d * 52);
          scale = 1;
          opacity = d > 0.95 ? 0 : Math.max(0, 1 - d * 0.75);
          z = 200 - Math.floor(d * 20);
        } else {
          z = 300;
        }
        card.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
        card.style.opacity = String(opacity);
        card.style.zIndex = String(z);
        card.style.pointerEvents = Math.abs(d) < 0.55 ? "auto" : "none";
      });
      setActive(Math.round(exact));
    }

    function update() {
      if (reduceMotion || mobile()) {
        cards.forEach((card) => {
          card.style.transform = "";
          card.style.opacity = "";
          card.style.zIndex = "";
          card.style.pointerEvents = "";
        });
        let nearest = 0;
        let best = Infinity;
        cards.forEach((card, idx) => {
          const mid = Math.abs(card.getBoundingClientRect().top + card.offsetHeight / 2 - window.innerHeight / 2);
          if (mid < best) {
            best = mid;
            nearest = idx;
          }
        });
        setActive(nearest);
        return;
      }
      const rect = stack.getBoundingClientRect();
      const total = Math.max(1, stack.offsetHeight - window.innerHeight);
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      const p = scrolled / total;
      paint(p * (n - 1));
    }

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  })();

  loadReleases();
})();
