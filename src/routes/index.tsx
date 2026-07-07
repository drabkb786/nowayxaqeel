import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChatGPT Stripe UPI Pay Link — Extension" },
      { name: "description", content: "Chrome extension that generates a Stripe checkout link from your signed-in ChatGPT session. Updated for the new checkout API." },
    ],
  }),
  component: Index,
});

function Index() {
  const download = () => {
    fetch("/chatgpt-stripe-upi.zip")
      .then((r) => { if (!r.ok) throw new Error("Download failed"); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "chatgpt-stripe-upi.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <div className="min-h-screen bg-[#0b0f0d] text-white">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <span className="inline-block text-xs tracking-[0.2em] uppercase text-emerald-300/80 mb-4">
          Chrome Extension · v1.1.0
        </span>
        <h1 className="text-5xl font-bold tracking-tight">
          ChatGPT Stripe UPI <span className="text-emerald-400">Pay Link</span>
        </h1>
        <p className="mt-5 text-lg text-white/70 max-w-xl">
          Fixed for the new ChatGPT checkout API. Adds the required
          <code className="mx-1 px-1.5 py-0.5 bg-white/10 rounded text-sm">entry_point</code>
          field, reads the response from every URL field the API now returns
          (<code className="mx-1 px-1.5 py-0.5 bg-white/10 rounded text-sm">checkout_url</code>,
          <code className="mx-1 px-1.5 py-0.5 bg-white/10 rounded text-sm">stripe_hosted_url</code>,
          <code className="mx-1 px-1.5 py-0.5 bg-white/10 rounded text-sm">url</code>),
          and falls back to composing the session URL from
          <code className="mx-1 px-1.5 py-0.5 bg-white/10 rounded text-sm">checkout_session_id</code>.
        </p>

        <div className="mt-8 flex gap-3 flex-wrap">
          <button onClick={download} className="px-6 py-3 rounded-full bg-emerald-500 text-black font-semibold hover:bg-emerald-400 transition">
            Download extension (.zip)
          </button>
          <a href="#install" className="px-6 py-3 rounded-full border border-white/20 hover:bg-white/10 transition">
            Install instructions
          </a>
        </div>

        <div id="install" className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <h2 className="text-xl font-semibold mb-4">Install</h2>
          <ol className="space-y-3 text-white/80 list-decimal list-inside">
            <li>Download the zip above and unzip it.</li>
            <li>Open <code className="px-2 py-0.5 bg-white/10 rounded">chrome://extensions</code>.</li>
            <li>Turn on <strong>Developer mode</strong> (top-right).</li>
            <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
            <li>Log in to <code className="px-2 py-0.5 bg-white/10 rounded">chatgpt.com</code>, then click the extension icon and hit <strong>Generate Link</strong>.</li>
          </ol>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70 leading-relaxed">
          <div className="font-semibold text-white mb-2">What changed vs your old build</div>
          <ul className="list-disc list-inside space-y-1">
            <li>Added <code className="px-1.5 py-0.5 bg-white/10 rounded">entry_point: "all_plans_pricing_modal"</code> (missing field was the main cause of the failure).</li>
            <li>Response parser now tries <code>checkout_url</code> → <code>stripe_hosted_url</code> → <code>url</code>, then falls back to <code>https://chatgpt.com/checkout/openai_llc/&#123;checkout_session_id&#125;</code>.</li>
            <li><code>cancel_url</code> updated to <code>https://chatgpt.com/#pricing</code>.</li>
            <li>Team plans auto-add <code>team_plan_data</code> and switch entry point.</li>
            <li>Optional <code>promoCode</code> path (coupon string) alongside existing <code>promoId</code>.</li>
            <li>Added <code>cookies</code> permission and <code>*.chatgpt.com</code> host permission for reliable session pickup.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
