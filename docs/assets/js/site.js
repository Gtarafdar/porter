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
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function openLightbox(src, alt) {
    if (!src || !lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightboxImg.alt = alt || "Screenshot";
    lightbox.classList.add("open");
  }

  function closeLightbox() {
    lightbox?.classList.remove("open");
    if (lightboxImg) lightboxImg.src = "";
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".shot[data-full], .howto-shot[data-full]");
    if (!btn) return;
    openLightbox(btn.getAttribute("data-full"), btn.querySelector("img")?.alt || "Screenshot");
  });
  lightboxClose?.addEventListener("click", closeLightbox);
  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  /* Gallery auto carousel (seamless loop, pauses on interaction) */
  (function initFilmstripCarousel() {
    const strip = document.getElementById("filmstrip");
    if (!strip || reduce || strip.dataset.autoplay !== "true") return;

    const originals = [...strip.querySelectorAll(":scope > .shot")];
    if (originals.length < 2) return;

    originals.forEach((node) => {
      const clone = node.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.tabIndex = -1;
      clone.removeAttribute("aria-label");
      const img = clone.querySelector("img");
      if (img) {
        img.loading = "lazy";
        img.decoding = "async";
        img.setAttribute("aria-hidden", "true");
      }
      strip.appendChild(clone);
    });

    strip.classList.add("filmstrip--loop");

    let last = 0;
    let visible = true;
    let resumeTimer = 0;
    let hovering = false;
    let focusing = false;
    let interacting = false;
    let autoplaying = false;
    let programmatic = false;
    const speed = 0.06; // ~3.5px/s — glanceable screenshots
    let loopWidth = 0;
    let carry = 0;

    function measure() {
      const firstClone = strip.children[originals.length];
      if (!firstClone) {
        loopWidth = 0;
        return;
      }
      // Distance from start of first original to start of first clone (= one full set + gaps)
      loopWidth = firstClone.offsetLeft - strip.children[0].offsetLeft;
    }

    function setAutoplaying(on) {
      if (autoplaying === on) return;
      autoplaying = on;
      strip.classList.toggle("is-autoplaying", on);
    }

    function shouldRun() {
      return (
        visible &&
        !hovering &&
        !focusing &&
        !interacting &&
        !lightbox?.classList.contains("open")
      );
    }

    function clearResume() {
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = 0;
      }
    }

    function softPause() {
      interacting = true;
      setAutoplaying(false);
      clearResume();
      last = 0;
      carry = 0;
    }

    function resumeSoon(ms = 3800) {
      interacting = true;
      setAutoplaying(false);
      clearResume();
      resumeTimer = setTimeout(() => {
        interacting = false;
        last = 0;
        carry = 0;
      }, ms);
    }

    function tick(now) {
      requestAnimationFrame(tick);
      if (!shouldRun()) {
        setAutoplaying(false);
        last = 0;
        carry = 0;
        return;
      }
      if (!last) {
        last = now;
        setAutoplaying(true);
        return;
      }
      const dt = Math.min(40, now - last);
      last = now;
      if (!loopWidth) measure();
      if (loopWidth <= 0) return;

      setAutoplaying(true);
      carry += speed * dt;
      if (carry < 1) return;
      const step = carry | 0;
      carry -= step;
      programmatic = true;
      strip.scrollLeft += step;
      if (strip.scrollLeft >= loopWidth - 0.5) {
        strip.scrollLeft -= loopWidth;
      }
      programmatic = false;
    }

    measure();
    window.addEventListener("load", measure, { once: true });
    window.addEventListener(
      "resize",
      () => {
        const ratio = loopWidth > 0 ? strip.scrollLeft / loopWidth : 0;
        measure();
        if (loopWidth > 0) {
          programmatic = true;
          strip.scrollLeft = (ratio % 1) * loopWidth;
          programmatic = false;
        }
      },
      { passive: true },
    );

    strip.addEventListener(
      "scroll",
      () => {
        // Ignore our own autoplay / resize writes (scroll can fire async)
        if (autoplaying || programmatic) return;
        resumeSoon();
      },
      { passive: true },
    );

    strip.addEventListener("pointerenter", () => {
      hovering = true;
      setAutoplaying(false);
      last = 0;
    });
    strip.addEventListener("pointerleave", () => {
      hovering = false;
      last = 0;
    });
    strip.addEventListener("focusin", () => {
      focusing = true;
      setAutoplaying(false);
      last = 0;
    });
    strip.addEventListener("focusout", (e) => {
      if (!strip.contains(e.relatedTarget)) focusing = false;
    });
    strip.addEventListener("wheel", () => resumeSoon(), { passive: true });
    strip.addEventListener("touchstart", () => softPause(), { passive: true });
    strip.addEventListener("touchend", () => resumeSoon(), { passive: true });
    strip.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        softPause();
        const end = () => {
          resumeSoon(2800);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
        };
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
      },
      { passive: true },
    );

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          visible = entries.some((en) => en.isIntersecting && en.intersectionRatio > 0.1);
          if (!visible) {
            last = 0;
            setAutoplaying(false);
          }
        },
        { threshold: [0, 0.1, 0.35] },
      );
      io.observe(strip.closest(".filmstrip-wrap") || strip);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        last = 0;
        setAutoplaying(false);
      }
    });

    requestAnimationFrame(tick);
  })();

  /* Reveal */
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
    const sorted = [...(releases || [])]
      .filter((r) => r && !r.draft)
      .sort((a, b) => {
        const tb = Date.parse(b.published_at || b.created_at || 0) || 0;
        const ta = Date.parse(a.published_at || a.created_at || 0) || 0;
        return tb - ta;
      })
      .slice(0, 12);

    const frag = document.createDocumentFragment();
    if (!sorted.length) {
      tree.innerHTML =
        '<li><strong><a href="https://github.com/Gtarafdar/porter/releases">Releases</a></strong><div class="changelog-body"><p>Could not load changelog. Open GitHub Releases.</p></div></li>';
      return;
    }

    sorted.forEach((r, idx) => {
      const li = document.createElement("li");
      const time = document.createElement("time");
      const date = r.published_at ? new Date(r.published_at) : null;
      time.dateTime = r.published_at || "";
      time.textContent = date
        ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : "";

      const heading = document.createElement("strong");
      const a = document.createElement("a");
      a.href = r.html_url;
      a.rel = "noopener";
      a.textContent = r.tag_name || r.name || "Release";
      heading.appendChild(a);
      if (r.name && r.name !== r.tag_name) {
        const title = document.createElement("span");
        title.className = "changelog-title";
        title.textContent = ` · ${r.name}`;
        heading.appendChild(title);
      }

      const bodyHtml = formatReleaseBody(r.body || r.name || "");
      if (idx === 0) {
        const body = document.createElement("div");
        body.className = "changelog-body";
        body.innerHTML = bodyHtml;
        li.append(time, heading, body);
      } else {
        const details = document.createElement("details");
        details.className = "changelog-details";
        const summary = document.createElement("summary");
        summary.append(heading.cloneNode(true));
        const preview = document.createElement("span");
        preview.className = "changelog-preview";
        const firstLine = String(r.body || "")
          .replace(/\r\n/g, "\n")
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith("#"));
        preview.textContent = firstLine ? ` — ${firstLine.slice(0, 90)}${firstLine.length > 90 ? "…" : ""}` : " — Full notes";
        summary.appendChild(preview);
        const body = document.createElement("div");
        body.className = "changelog-body";
        body.innerHTML = bodyHtml;
        details.append(summary, body);
        li.append(time, details);
      }
      frag.appendChild(li);
    });

    tree.replaceChildren(frag);
  }

  const RELEASE_CACHE_KEY = "porter-releases-cache-v2";
  const RELEASE_CACHE_MS = 15 * 60 * 1000;

  function readReleaseCache() {
    try {
      const raw = sessionStorage.getItem(RELEASE_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.list) || !parsed.ts) return null;
      if (Date.now() - parsed.ts > RELEASE_CACHE_MS) return null;
      return parsed.list;
    } catch {
      return null;
    }
  }

  function writeReleaseCache(list) {
    try {
      sessionStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ ts: Date.now(), list }));
    } catch {
      /* ignore quota */
    }
  }

  function applyReleases(list) {
    const sorted = [...(list || [])]
      .filter((r) => r && !r.draft)
      .sort((a, b) => {
        const tb = Date.parse(b.published_at || b.created_at || 0) || 0;
        const ta = Date.parse(a.published_at || a.created_at || 0) || 0;
        return tb - ta;
      });
    const latest = sorted[0];
    if (latest) {
      setDownloads(latest.tag_name || FALLBACK_TAG, pickAsset(latest.assets, "dmg"), pickAsset(latest.assets, "zip"));
    } else {
      setDownloads(FALLBACK_TAG, FALLBACK_DMG, FALLBACK_ZIP);
    }
    renderChangelog(sorted);
  }

  async function loadReleases() {
    const cached = readReleaseCache();
    if (cached) {
      applyReleases(cached);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      // One request: newest first. Avoids waiting on a second /releases/latest round-trip.
      const listRes = await fetch(`${API}/releases?per_page=12`, {
        headers: { Accept: "application/vnd.github+json" },
        signal: ctrl.signal,
      });
      if (!listRes.ok) throw new Error("releases failed");
      const list = await listRes.json();
      if (!Array.isArray(list) || !list.length) throw new Error("empty releases");
      writeReleaseCache(list);
      applyReleases(list);
    } catch {
      if (!cached) {
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
    } finally {
      clearTimeout(timer);
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
        if (d < -0.02) {
          y = Math.max(-28, d * 12);
          scale = Math.max(0.92, 1 + d * 0.028);
          opacity = 1;
          z = 40 + idx;
        } else if (d > 0.02) {
          y = Math.min(120, 36 + d * 56);
          scale = 1;
          opacity = d > 0.9 ? 0 : 1;
          z = 200 - Math.floor(d * 20);
        } else {
          opacity = 1;
          scale = 1;
          y = 0;
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

  /* Scroll to top + percent ring */
  (function initScrollTop() {
    const btn = document.getElementById("scroll-top");
    const pctEl = document.getElementById("scroll-top-pct");
    const ring = document.getElementById("scroll-top-progress");
    if (!btn || !pctEl || !ring) return;
    const circumference = 2 * Math.PI * 24;
    ring.style.strokeDasharray = String(circumference);

    function refresh() {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const scrolled = Math.min(max, Math.max(0, window.scrollY || doc.scrollTop));
      const pct = Math.round((scrolled / max) * 100);
      pctEl.textContent = `${pct}%`;
      ring.style.strokeDashoffset = String(circumference - (pct / 100) * circumference);
      btn.hidden = scrolled < 240;
    }

    btn.addEventListener("click", () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });

    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          refresh();
          ticking = false;
        });
      },
      { passive: true },
    );
    window.addEventListener("resize", refresh, { passive: true });
    refresh();
  })();

  loadReleases();
})();
