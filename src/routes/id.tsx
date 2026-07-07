import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { generateIdentity, type Identity } from "@/lib/generator";

export const Route = createFileRoute("/id")({
  head: () => ({
    meta: [
      { title: "Noway ID — Fake Identity & Address Generator (250+ Countries)" },
      { name: "description", content: "Generate realistic fake identities with address, postal code, phone, email, and test card details for 250+ countries. For developers, testing and QA." },
      { property: "og:title", content: "Noway ID — Fake Identity Generator" },
      { property: "og:description", content: "Realistic fake names, addresses, postal codes, phones, emails and test cards for 250+ countries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      onClick={copy}
      className="group text-left w-full rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition p-4"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] tracking-[0.18em] uppercase text-white/40 font-medium">{label}</div>
        <div className="text-[10px] text-white/30 group-hover:text-emerald-400 transition">
          {copied ? "COPIED" : "COPY"}
        </div>
      </div>
      <div className={`text-white/95 break-words ${mono ? "font-mono text-sm" : "text-[15px]"}`}>{value || "—"}</div>
    </button>
  );
}

function Page() {
  const [countryCode, setCountryCode] = useState<string>("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => { setIdentity(generateIdentity("US")); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [search]);

  const regen = (code?: string) => setIdentity(generateIdentity(code ?? countryCode ?? undefined));

  return (
    <div className="min-h-screen bg-[#0a0912] text-white relative overflow-hidden">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(circle, #a56bff, transparent 60%)" }} />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full blur-3xl opacity-30" style={{ background: "radial-gradient(circle, #22d3ee, transparent 60%)" }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-14">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#a56bff] to-[#6d5cff] flex items-center justify-center font-bold text-black text-sm shadow-[0_8px_24px_-6px_rgba(165,107,255,0.6)]">N</div>
            <div>
              <div className="font-bold text-lg leading-none">Noway ID</div>
              <div className="text-[11px] text-white/40 mt-0.5">Fake identity generator</div>
            </div>
          </div>
          <div className="text-[11px] font-mono tracking-widest text-white/40 uppercase hidden sm:block">
            250+ Countries · For Testing
          </div>
        </header>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] max-w-3xl">
          Generate a full <span className="bg-gradient-to-r from-[#a56bff] to-[#22d3ee] bg-clip-text text-transparent">fake identity</span> for any country
        </h1>
        <p className="mt-4 text-white/60 max-w-2xl">
          Name, address, postal code, phone, email, DOB and test card — all realistically formatted for the country you choose. Great for QA, form testing and mock data.
        </p>

        {/* Controls */}
        <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            placeholder="Search country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus:border-white/30 focus:bg-white/[0.05] outline-none text-sm placeholder:text-white/30"
          />
          <select
            value={countryCode}
            onChange={(e) => { setCountryCode(e.target.value); regen(e.target.value); }}
            className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus:border-white/30 outline-none text-sm appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#0a0912]">Random country</option>
            {filtered.map((c) => (
              <option key={c.code} value={c.code} className="bg-[#0a0912]">{c.name} ({c.code})</option>
            ))}
          </select>
          <button
            onClick={() => regen()}
            className="px-6 py-3 rounded-xl font-semibold text-black bg-gradient-to-r from-[#a56bff] to-[#22d3ee] hover:brightness-110 active:scale-[0.98] transition shadow-[0_10px_30px_-10px_rgba(165,107,255,0.6)]"
          >
            Generate ↻
          </button>
        </div>

        <div className="mt-4">
          <button
            onClick={() => {
              fetch("/noway-id.zip")
                .then((r) => { if (!r.ok) throw new Error("Download failed"); return r.blob(); })
                .then((blob) => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "noway-id.zip";
                  a.click();
                  URL.revokeObjectURL(a.href);
                })
                .catch((e) => alert(e.message));
            }}
            className="text-xs px-4 py-2 rounded-lg border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] text-white/80 hover:text-white transition"
          >
            ↓ Download Chrome Extension (.zip)
          </button>
          <span className="ml-3 text-[10px] text-white/30">Unzip → chrome://extensions → Developer mode → Load unpacked</span>
        </div>

        {/* Identity flag row */}
        <div className="mt-8 flex items-center gap-4 p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent">
          <div className="text-4xl font-mono font-bold text-white/90">{identity.country.code}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-semibold truncate">{identity.fullName}</div>
            <div className="text-sm text-white/50 truncate">{identity.countryName} · {identity.gender} · {identity.age} yrs</div>
          </div>
          <div className="text-right text-[11px] tracking-widest text-white/40 uppercase hidden sm:block">
            Dial {identity.country.dial}<br/>{identity.currency}
          </div>
        </div>

        {/* Fields grid */}
        <section className="mt-6">
          <h2 className="text-[11px] tracking-[0.2em] uppercase text-white/40 mb-3">Personal</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full Name" value={identity.fullName} />
            <Field label="First Name" value={identity.firstName} />
            <Field label="Last Name" value={identity.lastName} />
            <Field label="Gender" value={identity.gender} />
            <Field label="Date of Birth" value={`${identity.dob} (age ${identity.age})`} />
            <Field label="Username" value={identity.username} mono />
            <Field label="Email" value={identity.email} mono />
            <Field label="Phone" value={identity.phone} mono />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] tracking-[0.2em] uppercase text-white/40 mb-3">Address</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Street Address" value={identity.streetAddress} />
            <Field label="City" value={identity.city} />
            <Field label="State / Province" value={identity.state} />
            <Field label="Postal / Zip Code" value={identity.postalCode} mono />
            <Field label="Country" value={`${identity.countryName} (${identity.country.code})`} />
            <Field
              label="Full Address"
              value={`${identity.streetAddress}, ${identity.city}, ${identity.state} ${identity.postalCode}, ${identity.countryName}`}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] tracking-[0.2em] uppercase text-white/40 mb-3">Test Card (Luhn-valid · non-chargeable)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Card Number" value={identity.card.formatted} mono />
            <Field label="Type" value={identity.card.type} />
            <Field label="Expiry" value={identity.card.expiry} mono />
            <Field label="CVV" value={identity.card.cvv} mono />
          </div>
          <p className="text-[11px] text-white/30 mt-3 leading-relaxed">
            Random Luhn-valid numbers only — not linked to any real account and cannot be charged. Use for form validation testing.
          </p>
        </section>

        <footer className="mt-16 text-center text-[11px] text-white/30 tracking-widest uppercase">
          created by noway · fake data for testing only
        </footer>
      </div>
    </div>
  );
}
