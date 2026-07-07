(function () {
  const $ = (id) => document.getElementById(id);
  const search = $("search");
  const select = $("country");
  const genBtn = $("gen");
  let currentCode = "US";

  function renderCountries(filter) {
    const q = (filter || "").toLowerCase().trim();
    const list = window.COUNTRIES.filter((c) =>
      !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
    select.innerHTML = '<option value="">Random country</option>' +
      list.map((c) => `<option value="${c.code}"${c.code === currentCode ? " selected" : ""}>${c.name} (${c.code})</option>`).join("");
  }

  function field(label, value, opts) {
    opts = opts || {};
    const div = document.createElement("button");
    div.className = "field" + (opts.wide ? " wide" : "");
    div.type = "button";
    div.innerHTML =
      `<div class="k"><span>${label}</span><span class="cp">COPY</span></div>` +
      `<div class="v${opts.mono ? " mono" : ""}"></div>`;
    div.querySelector(".v").textContent = value || "—";
    div.addEventListener("click", () => {
      navigator.clipboard.writeText(value || "");
      div.classList.add("copied");
      div.querySelector(".cp").textContent = "COPIED";
      setTimeout(() => {
        div.classList.remove("copied");
        div.querySelector(".cp").textContent = "COPY";
      }, 1200);
    });
    return div;
  }

  function render(id) {
    const hero = $("hero");
    hero.innerHTML =
      `<div class="code">${id.country.code}</div>` +
      `<div class="info"><div class="name"></div><div class="meta"></div></div>`;
    hero.querySelector(".name").textContent = id.fullName;
    hero.querySelector(".meta").textContent = `${id.countryName} · ${id.gender} · ${id.age} yrs · ${id.country.dial} · ${id.currency}`;

    const p = $("personal"); p.innerHTML = "";
    p.append(
      field("Full Name", id.fullName),
      field("Gender", id.gender),
      field("Date of Birth", `${id.dob} (age ${id.age})`),
      field("Username", id.username, { mono: true }),
      field("Email", id.email, { mono: true }),
      field("Phone", id.phone, { mono: true }),
    );

    const a = $("address"); a.innerHTML = "";
    a.append(
      field("Street", id.streetAddress),
      field("City", id.city),
      field("State / Province", id.state),
      field("Postal / Zip", id.postalCode, { mono: true }),
      field("Country", `${id.countryName} (${id.country.code})`),
      field("Full Address", `${id.streetAddress}, ${id.city}, ${id.state} ${id.postalCode}, ${id.countryName}`, { wide: true }),
    );

    const c = $("card"); c.innerHTML = "";
    c.append(
      field("Card Number", id.card.formatted, { mono: true, wide: true }),
      field("Type", id.card.type),
      field("Expiry", id.card.expiry, { mono: true }),
      field("CVV", id.card.cvv, { mono: true }),
    );
  }

  function regen() {
    render(window.generateIdentity(currentCode || undefined));
  }

  search.addEventListener("input", () => renderCountries(search.value));
  select.addEventListener("change", () => { currentCode = select.value; regen(); });
  genBtn.addEventListener("click", regen);

  renderCountries("");
  regen();
})();
