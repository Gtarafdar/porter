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

  /* Side nav current section + sliding liquid pill */
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

  document.querySelectorAll(".shot").forEach((btn) => {
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

  /* Liquid glass specular + lens follow (CodePen-style mouse tracking) */
  if (!reduce) {
    const setSpecular = (el, clientX, clientY) => {
      const r = el.getBoundingClientRect();
      const x = ((clientX - r.left) / Math.max(r.width, 1)) * 100;
      const y = ((clientY - r.top) / Math.max(r.height, 1)) * 100;
      el.style.setProperty("--mx", `${x}%`);
      el.style.setProperty("--my", `${y}%`);
    };
    document.querySelectorAll(".glass").forEach((el) => {
      el.addEventListener(
        "pointerenter",
        () => el.classList.add("is-lens"),
        { passive: true },
      );
      el.addEventListener(
        "pointerleave",
        () => el.classList.remove("is-lens"),
        { passive: true },
      );
      el.addEventListener(
        "pointermove",
        (e) => setSpecular(el, e.clientX, e.clientY),
        { passive: true },
      );
    });
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
    const ids = ["btn-dmg", "download-dmg", "btn-zip", "download-zip"];
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
    void ids;
  }

  function renderChangelog(releases) {
    const tree = document.getElementById("changelog-tree");
    if (!tree) return;
    tree.innerHTML = "";
    (releases || []).slice(0, 10).forEach((r) => {
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
      const p = document.createElement("p");
      const body = (r.body || "").replace(/\r\n/g, "\n").trim();
      const lines = body
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4);
      p.textContent = lines.join("\n") || r.name || "See release notes on GitHub.";
      li.append(time, strong, p);
      tree.appendChild(li);
    });
    if (!tree.children.length) {
      tree.innerHTML =
        '<li><strong><a href="https://github.com/Gtarafdar/porter/releases">Releases</a></strong><p>Could not load changelog. Open GitHub Releases.</p></li>';
    }
  }

  async function loadReleases() {
    try {
      const [latestRes, listRes] = await Promise.all([
        fetch(`${API}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } }),
        fetch(`${API}/releases?per_page=12`, { headers: { Accept: "application/vnd.github+json" } }),
      ]);
      if (!latestRes.ok) throw new Error("latest failed");
      const latest = await latestRes.json();
      const list = listRes.ok ? await listRes.json() : [latest];
      const dmg = pickAsset(latest.assets, "dmg");
      const zip = pickAsset(latest.assets, "zip");
      setDownloads(latest.tag_name || FALLBACK_TAG, dmg, zip);
      renderChangelog(Array.isArray(list) ? list : [latest]);
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

  loadReleases();
})();
