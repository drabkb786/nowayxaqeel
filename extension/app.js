/* NovaTab Ultimate — vanilla ES module, MV3 safe (no eval, no remote code) */

const ENGINES = {
  google:     { name: "Google",      url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing:       { name: "Bing",        url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  duckduckgo: { name: "DuckDuckGo",  url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  brave:      { name: "Brave",       url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  perplexity: { name: "Perplexity",  url: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}` },
  chatgpt:    { name: "ChatGPT",     url: (q) => `https://chat.openai.com/?q=${encodeURIComponent(q)}` },
  gemini:     { name: "Gemini",      url: (q) => `https://gemini.google.com/app?q=${encodeURIComponent(q)}` },
};

const ACCENTS = ["#a855f7", "#22d3ee", "#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#ffffff"];

const DEFAULT_FAVS = [
  { name: "YouTube",  url: "https://youtube.com" },
  { name: "GitHub",   url: "https://github.com" },
  { name: "Gmail",    url: "https://mail.google.com" },
  { name: "Reddit",   url: "https://reddit.com" },
  { name: "X",        url: "https://x.com" },
  { name: "Lovable",  url: "https://lovable.dev" },
];

const DEFAULT_SETTINGS = {
  theme: "dark",
  accent: "#a855f7",
  glassBlur: 20,
  radius: 16,
  transparency: 40,
  reducedMotion: false,
  wpFit: "cover",
  wpBlur: 0, wpBrightness: 100, wpContrast: 100, wpSaturation: 100, wpOverlay: 30,
  parallax: false,
  wpDataUrl: null,
  wpType: "image", // "image" | "video"
  defaultEngine: "google",
  favorites: DEFAULT_FAVS,
};

// ---- Storage (chrome.storage.sync when available, localStorage fallback) ----
const hasChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;

async function loadSettings() {
  if (hasChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, (data) => {
        // Wallpaper data URL can be huge → try local first
        chrome.storage.local.get(["wpDataUrl", "wpType"], (local) => {
          resolve({ ...DEFAULT_SETTINGS, ...data, ...local });
        });
      });
    });
  }
  try {
    const raw = localStorage.getItem("novatab") || "{}";
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

async function saveSettings(partial) {
  Object.assign(state, partial);
  if (hasChromeStorage) {
    const { wpDataUrl, wpType, ...syncable } = partial;
    if (Object.keys(syncable).length) chrome.storage.sync.set(syncable);
    if ("wpDataUrl" in partial || "wpType" in partial) {
      chrome.storage.local.set({
        ...(("wpDataUrl" in partial) && { wpDataUrl: partial.wpDataUrl }),
        ...(("wpType" in partial) && { wpType: partial.wpType }),
      });
    }
  } else {
    localStorage.setItem("novatab", JSON.stringify(state));
  }
}

// ---- State ----
let state = { ...DEFAULT_SETTINGS };

// ---- Boot ----
init();

async function init() {
  state = await loadSettings();
  applyTheme();
  applyWallpaper();
  renderGreeting();
  startClock();
  renderFavorites();
  bindSearch();
  bindToolbar();
  bindSettings();
  bindFavModal();
  bindParallax();
}

// ---- Theme + tokens ----
function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  root.style.setProperty("--accent", state.accent);
  root.style.setProperty("--glass-blur", `${state.glassBlur}px`);
  root.style.setProperty("--radius", `${state.radius}px`);
  const alpha = state.transparency / 100;
  const glassBg = state.theme === "light"
    ? `rgba(255,255,255,${Math.min(0.9, 0.2 + alpha)})`
    : `rgba(20,20,28,${Math.min(0.9, alpha)})`;
  root.style.setProperty("--glass-bg", glassBg);
  document.body.classList.toggle("reduce-motion", state.reducedMotion);
}

// ---- Wallpaper ----
function applyWallpaper() {
  const root = document.documentElement;
  root.style.setProperty("--wp-blur", `${state.wpBlur}px`);
  root.style.setProperty("--wp-brightness", state.wpBrightness / 100);
  root.style.setProperty("--wp-contrast", state.wpContrast / 100);
  root.style.setProperty("--wp-saturation", state.wpSaturation / 100);
  root.style.setProperty("--wp-overlay", state.wpOverlay / 100);
  document.body.dataset.wpFit = state.wpFit;
  document.body.dataset.wpType = state.wpType;
  const img = document.getElementById("wallpaper-img");
  const vid = document.getElementById("wallpaper-video");
  const src = state.wpDataUrl || "wallpapers/default.jpg";
  if (state.wpType === "video") {
    vid.src = src;
    vid.play().catch(() => {});
  } else {
    img.src = src;
  }
}

// ---- Greeting + Clock ----
function renderGreeting() {
  const h = new Date().getHours();
  const part = h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  document.getElementById("greeting").innerHTML = `Good <strong>${part}</strong> — make it count.`;
}
function startClock() {
  const tick = () => {
    const d = new Date();
    document.getElementById("clock-time").textContent =
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    document.getElementById("clock-date").textContent =
      d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  };
  tick();
  setInterval(tick, 1000);
}

// ---- Search ----
function bindSearch() {
  const input = document.getElementById("search-input");
  const engineBtn = document.getElementById("engine-btn");
  const engineName = document.getElementById("engine-name");
  const engineMenu = document.getElementById("engine-menu");

  const setEngine = (key) => {
    state.defaultEngine = key;
    engineName.textContent = ENGINES[key].name;
    saveSettings({ defaultEngine: key });
  };
  setEngine(state.defaultEngine);

  // Build engine menu
  engineMenu.innerHTML = "";
  Object.entries(ENGINES).forEach(([key, e]) => {
    const b = document.createElement("button");
    b.textContent = e.name;
    b.onclick = () => { setEngine(key); engineMenu.classList.add("hidden"); input.focus(); };
    engineMenu.appendChild(b);
  });

  engineBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    engineMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", () => engineMenu.classList.add("hidden"));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      window.location.href = ENGINES[state.defaultEngine].url(input.value.trim());
    } else if (e.key === "Tab") {
      e.preventDefault();
      const keys = Object.keys(ENGINES);
      const idx = keys.indexOf(state.defaultEngine);
      setEngine(keys[(idx + 1) % keys.length]);
    }
  });

  // Global focus with "/"
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault(); input.focus();
    }
  });
  setTimeout(() => input.focus(), 100);
}

// ---- Favorites ----
function renderFavorites() {
  const grid = document.getElementById("favorites");
  grid.innerHTML = "";
  state.favorites.forEach((fav, i) => {
    const el = document.createElement("a");
    el.className = "fav";
    el.href = fav.url;
    el.title = fav.url;
    let host = "";
    try { host = new URL(fav.url).hostname; } catch {}
    el.innerHTML = `
      <div class="fav-icon">${host ? `<img src="https://www.google.com/s2/favicons?domain=${host}&sz=64" alt="" onerror="this.replaceWith(document.createTextNode('${(fav.name[0]||'?').toUpperCase()}'))"/>` : (fav.name[0] || '?').toUpperCase()}</div>
      <div class="fav-label">${escapeHtml(fav.name)}</div>
      <button class="fav-remove" aria-label="Remove" data-i="${i}">✕</button>
    `;
    el.querySelector(".fav-remove").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      state.favorites.splice(i, 1);
      saveSettings({ favorites: state.favorites });
      renderFavorites();
    });
    grid.appendChild(el);
  });
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// ---- Toolbar ----
function bindToolbar() {
  document.querySelectorAll("#toolbar button").forEach((b) => {
    b.addEventListener("click", () => {
      const tool = b.dataset.tool;
      if (tool === "settings") openSettings();
      else if (tool === "add-fav") openFavModal();
      else if (tool === "bookmarks" && hasChromeStorage && chrome.bookmarks) {
        chrome.bookmarks.getRecent(12, (nodes) => {
          state.favorites = nodes.filter(n => n.url).map(n => ({ name: n.title || n.url, url: n.url }));
          saveSettings({ favorites: state.favorites });
          renderFavorites();
        });
      } else if (tool === "topsites" && typeof chrome !== "undefined" && chrome.topSites) {
        chrome.topSites.get((sites) => {
          state.favorites = sites.slice(0, 12).map(s => ({ name: s.title || s.url, url: s.url }));
          saveSettings({ favorites: state.favorites });
          renderFavorites();
        });
      }
    });
  });
}

// ---- Settings panel ----
function openSettings() {
  const p = document.getElementById("settings-panel");
  p.classList.add("open");
  p.setAttribute("aria-hidden", "false");
  hydrateSettingsUI();
}
function bindSettings() {
  document.getElementById("settings-close").addEventListener("click", () => {
    const p = document.getElementById("settings-panel");
    p.classList.remove("open");
    p.setAttribute("aria-hidden", "true");
  });
  document.querySelectorAll(".sp-tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".sp-tab").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".sp-section").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      document.querySelector(`.sp-section[data-section="${t.dataset.tab}"]`).classList.add("active");
    });
  });

  // Segments
  document.querySelectorAll(".segment").forEach((seg) => {
    const key = seg.dataset.segment;
    seg.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        saveSettings({ [key]: b.dataset.value });
        if (key === "theme") applyTheme();
        if (key === "wpFit") applyWallpaper();
      });
    });
  });

  // Range + checkbox settings
  document.querySelectorAll("[data-setting]").forEach((el) => {
    const key = el.dataset.setting;
    el.addEventListener("input", () => {
      const val = el.type === "checkbox" ? el.checked : Number(el.value);
      saveSettings({ [key]: val });
      const label = document.querySelector(`[data-val="${key}"]`);
      if (label) label.textContent = val;
      if (key.startsWith("wp") || key === "parallax") applyWallpaper();
      else applyTheme();
    });
  });

  // Accent swatches
  const wrap = document.getElementById("accent-swatches");
  ACCENTS.forEach((c) => {
    const s = document.createElement("button");
    s.className = "swatch";
    s.style.background = c;
    s.addEventListener("click", () => {
      document.querySelectorAll(".swatch").forEach(x => x.classList.remove("active"));
      s.classList.add("active");
      saveSettings({ accent: c });
      applyTheme();
    });
    wrap.appendChild(s);
  });

  // Wallpaper upload
  document.getElementById("wp-upload").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const isVideo = file.type.startsWith("video/");
      saveSettings({ wpDataUrl: reader.result, wpType: isVideo ? "video" : "image" });
      applyWallpaper();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById("wp-reset").addEventListener("click", () => {
    saveSettings({ wpDataUrl: null, wpType: "image" });
    applyWallpaper();
  });

  // Default engine
  document.getElementById("default-engine").addEventListener("change", (e) => {
    state.defaultEngine = e.target.value;
    saveSettings({ defaultEngine: e.target.value });
    document.getElementById("engine-name").textContent = ENGINES[e.target.value].name;
  });

  // Backup
  document.getElementById("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `novatab-backup-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  });
  document.getElementById("btn-import").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        saveSettings(parsed);
        location.reload();
      } catch { alert("Invalid backup file"); }
    };
    r.readAsText(file);
  });
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Reset all settings?")) return;
    if (hasChromeStorage) { chrome.storage.sync.clear(); chrome.storage.local.clear(); }
    else localStorage.removeItem("novatab");
    location.reload();
  });
}

function hydrateSettingsUI() {
  // Segments
  document.querySelectorAll(".segment").forEach((seg) => {
    const key = seg.dataset.segment;
    seg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.value === state[key]);
    });
  });
  // Ranges + checkboxes
  document.querySelectorAll("[data-setting]").forEach((el) => {
    const key = el.dataset.setting;
    if (el.type === "checkbox") el.checked = !!state[key];
    else el.value = state[key];
    const label = document.querySelector(`[data-val="${key}"]`);
    if (label) label.textContent = state[key];
  });
  // Accent
  document.querySelectorAll(".swatch").forEach((s, i) => {
    s.classList.toggle("active", ACCENTS[i] === state.accent);
  });
  // Default engine
  document.getElementById("default-engine").value = state.defaultEngine;
}

// ---- Favorite modal ----
function openFavModal() {
  const m = document.getElementById("fav-modal");
  m.classList.remove("hidden");
  document.getElementById("fav-name").value = "";
  document.getElementById("fav-url").value = "";
  document.getElementById("fav-name").focus();
}
function bindFavModal() {
  document.getElementById("fav-cancel").addEventListener("click", () => document.getElementById("fav-modal").classList.add("hidden"));
  document.getElementById("fav-save").addEventListener("click", () => {
    const name = document.getElementById("fav-name").value.trim();
    let url = document.getElementById("fav-url").value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    state.favorites.push({ name, url });
    saveSettings({ favorites: state.favorites });
    renderFavorites();
    document.getElementById("fav-modal").classList.add("hidden");
  });
}

// ---- Parallax ----
function bindParallax() {
  window.addEventListener("mousemove", (e) => {
    if (!state.parallax) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    const img = document.getElementById("wallpaper-img");
    const vid = document.getElementById("wallpaper-video");
    const t = `translate(${x}px, ${y}px) scale(1.08)`;
    img.style.transform = t; vid.style.transform = t;
  });
}
