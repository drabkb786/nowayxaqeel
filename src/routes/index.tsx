import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Noway — Chrome Extension" },
      { name: "description", content: "Noway generates a ChatGPT checkout link from your signed-in session, with promo region selection across 150+ countries." },
    ],
  }),
  component: Index,
});

function Index() {
  const download = () => {
    fetch("/noway.zip")
      .then((r) => { if (!r.ok) throw new Error("Download failed"); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "noway.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <div className="min-h-screen bg-[#08070d] text-white relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full blur-3xl opacity-60 pointer-events-none"
        style={{ background: "radial-gradient(circle, #6d5cff 0%, transparent 60%)" }}
      />
      <div className="relative max-w-3xl mx-auto px-6 py-24">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur text-[11px] tracking-[0.2em] uppercase text-white/70 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7cf0b8] shadow-[0_0_8px_#7cf0b8]" />
          Chrome Extension · v1.2.0
        </div>
        <h1 className="mt-6 text-6xl font-bold tracking-tight leading-[1.05]">
          No<span className="bg-gradient-to-r from-[#b794ff] to-[#6d5cff] bg-clip-text text-transparent">way</span>
        </h1>
        <p className="mt-5 text-lg text-white/60 max-w-xl leading-relaxed">
          Generate a ChatGPT checkout link from your signed-in session — pick a promo
          region from 150+ countries and get a copy-ready URL in one click.
        </p>

        <div className="mt-10 flex gap-3 flex-wrap">
          <button
            onClick={download}
            className="px-7 py-3.5 rounded-full font-semibold text-black bg-gradient-to-r from-[#b794ff] to-[#6d5cff] shadow-[0_16px_40px_-12px_rgba(140,108,255,0.7)] hover:-translate-y-0.5 transition"
          >
            Download extension
          </button>
          <a href="#install" className="px-7 py-3.5 rounded-full border border-white/15 hover:bg-white/5 transition">
            How to install
          </a>
        </div>

        <div id="install" className="mt-16 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur p-8">
          <div className="text-[11px] font-mono tracking-[0.2em] uppercase text-white/50 mb-3">Install</div>
          <ol className="space-y-3 text-white/75 list-decimal list-inside">
            <li>Download the zip above and unzip it.</li>
            <li>Open <code className="px-2 py-0.5 bg-white/10 rounded font-mono text-sm">chrome://extensions</code>.</li>
            <li>Enable <strong>Developer mode</strong> (top-right).</li>
            <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
            <li>Sign in to <code className="px-2 py-0.5 bg-white/10 rounded font-mono text-sm">chatgpt.com</code>, then click the Noway icon and hit <strong>Generate link</strong>.</li>
          </ol>
        </div>

        <p className="mt-12 text-center text-[11px] font-mono tracking-[0.2em] uppercase text-white/40">
          — Created by Noway —
        </p>
      </div>
    </div>
  );
}
