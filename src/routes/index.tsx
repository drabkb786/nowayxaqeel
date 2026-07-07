import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NovaTab Ultimate — Premium New Tab for Chrome" },
      { name: "description", content: "A futuristic new tab dashboard for Chrome. Glass search, wallpaper studio, favorites, and widgets — feels like VisionOS meets Arc." },
      { property: "og:title", content: "NovaTab Ultimate" },
      { property: "og:description", content: "A premium new tab dashboard for Chrome — glass search, wallpaper studio, favorites, widgets." },
    ],
  }),
  component: Index,
});

function Index() {
  const download = () => {
    fetch("/novatab-ultimate.zip")
      .then((r) => { if (!r.ok) throw new Error("Download failed"); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "novatab-ultimate.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <div className="min-h-screen bg-[#08080c] text-white overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 30%, rgba(168,85,247,0.5), transparent), radial-gradient(50% 40% at 80% 70%, rgba(34,211,238,0.4), transparent)",
        }}
      />
      <div className="relative max-w-4xl mx-auto px-6 py-24">
        <span className="inline-block text-xs tracking-[0.2em] uppercase text-white/60 mb-6">
          Chrome Extension · Manifest V3
        </span>
        <h1 className="text-5xl md:text-7xl font-light tracking-tight leading-[1.05]">
          NovaTab <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">Ultimate</span>
        </h1>
        <p className="mt-6 text-lg text-white/70 max-w-xl leading-relaxed">
          A premium new tab dashboard for Chrome. Glass search across 7 engines,
          a wallpaper studio (image + video), draggable favorites, and a proper
          settings panel. Feels like VisionOS meets Arc.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            onClick={download}
            className="px-6 py-3 rounded-full bg-white text-black font-medium hover:scale-[1.02] transition"
          >
            Download extension (.zip)
          </button>
          <a
            href="#install"
            className="px-6 py-3 rounded-full border border-white/20 text-white/90 hover:bg-white/10 transition"
          >
            Install instructions
          </a>
        </div>

        <div id="install" className="mt-24 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-8">
          <h2 className="text-xl font-semibold mb-4">Install in 4 steps</h2>
          <ol className="space-y-3 text-white/80 list-decimal list-inside">
            <li>Click <strong>Download extension</strong> above and unzip the file.</li>
            <li>Open <code className="px-2 py-0.5 bg-white/10 rounded">chrome://extensions</code> in Chrome (works in Edge, Brave, Arc too).</li>
            <li>Enable <strong>Developer mode</strong> (top-right toggle).</li>
            <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
          </ol>
          <p className="mt-6 text-sm text-white/50">
            Open a new tab to see NovaTab. Use the gear icon on the left toolbar to
            customize theme, accent, glass, and upload your own wallpaper (image or MP4/WebM).
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {[
            ["Glass search", "Google, Bing, DuckDuckGo, Brave, Perplexity, ChatGPT, Gemini. Tab to cycle."],
            ["Wallpaper studio", "Upload image or video. Blur, brightness, contrast, saturation, overlay, parallax."],
            ["Chrome sync", "Settings sync across devices via chrome.storage. Import Top Sites or Bookmarks."],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-sm font-medium">{title}</div>
              <div className="mt-2 text-sm text-white/60 leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
