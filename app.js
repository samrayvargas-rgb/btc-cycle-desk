const MS_DAY = 86400000;
const GENESIS = Date.UTC(2009, 0, 3);
const LAST_HALVING = Date.UTC(2024, 3, 20);
const NEXT_HALVING = Date.UTC(2028, 3, 17);
const ATH_TIME = Date.UTC(2025, 9, 6);
const ATH_PRICE = 126080;

const HISTORY = [
  { cycle: "2012", h: "2012-11-28", top: "outside · late", topNote: "Nov 2013 double top", bot: "inside", botNote: "2015 window" },
  { cycle: "2016", h: "2016-07-09", top: "inside", topNote: "17 Dec 2017", bot: "inside", botNote: "Dec 2018" },
  { cycle: "2020", h: "2020-05-11", top: "inside", topNote: "Nov 2021 ATH in window (Apr was an earlier high)", bot: "inside", botNote: "Nov 2022" },
];

const state = {
  price: null,
  chg: null,
  rp: null,
  mvrv: null,
  rpAsOf: null,
  signals: null,
  daily: null,
  rpCycles: null,
};

function daysBetween(a, b) {
  return Math.round((b - a) / MS_DAY);
}

function addDays(ts, d) {
  return ts + d * MS_DAY;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function pill(text, cls) {
  return `<span class="pill ${cls}">${text}</span>`;
}

function pillClass(label) {
  if (label.includes("no print") || label.includes("expired") || label.includes("overdue")) return "bg-orange";
  if (label.includes("inside")) return "bg-lime";
  if (label.includes("split") || label.includes("late") || label.includes("early")) return "bg-yellow";
  return "bg-gray";
}


function locationGrade(pl, price, rp, mvrv, above50) {
  const mult = pl && pl.mult;
  const belowRp = rp && price != null && price <= rp;
  const nearRp = rp && price != null && price <= rp * 1.05;
  const cheap = mult != null && mult < 0.70;
  const idealZ = mult != null && mult < 0.55;
  const expensive = mult != null && mult >= 1.20;
  let name = "Neutral", why = "Mid-range versus the long-term trend. No strong historical edge from this map.", next = "";
  if (belowRp && cheap && above50 === false) {
    name = "Ideal";
    why = "This is what the last three bears looked like at the best buys: under realized price, cheap versus the power-law trend, and still below the 50-week.";
    next = "Stays Ideal while those three hold. Loses Ideal on a 50-week reclaim that turns into a stretch toward trend.";
  } else if (belowRp || nearRp && cheap) {
    name = "Good";
    why = "Spot is at or under holder cost basis while the trend still says cheap. History paid well here even if the exact low was a few weeks away.";
    next = "Becomes Ideal if price is also below the 50-week. Slides to Okay if we bounce far above realized price again.";
  } else if (cheap) {
    name = "Okay";
    why = "Cheap versus the long-term trend and, this cycle, inside the usual low-search window — but spot has not tagged realized price the way 2015, 2018, and 2022 did.";
    next = "Good/Ideal if this cycle finally visits realized price (~current $53k and rising slowly). Not Ideal if price runs back toward the power-law trend without a washout.";
  } else if (expensive) {
    name = "Not Ideal";
    why = "Expensive versus the power-law trend. That is where prior cycles paid poorly for new buys.";
    next = "Cools toward Neutral if price falls back under ~1.2× trend.";
  } else {
    name = "Neutral";
    why = "Neither cheap nor expensive versus the long-term line, and not at realized price.";
    next = "Okay if the multiple compresses under 0.70×. Not Ideal if it pushes through 1.2× trend.";
  }
  return { name, why, next };
}

function settings() {
  const buySens = 0.90, sellSens = 0.20;
  return {
    useInd: true, master: 57, buySens, sellSens, vol: false,
    topA: 510, topB: 560, botA: 850, botB: 930, extend: 60,
    buyLevel: 12 + buySens * 18,
    sellLevel: 72 + sellSens * 18,
    rsiLen: Math.round(4 + buySens * 5),
    rankLen: Math.round(60 + buySens * 90),
  };
}

function windowState(now, startDays, endDays, printed) {
  const d = daysBetween(LAST_HALVING, now);
  const start = addDays(LAST_HALVING, startDays);
  const end = addDays(LAST_HALVING, endDays);
  if (printed) {
    return { key: "printed", label: "printed inside", start, end, d };
  }
  if (d < startDays) {
    return { key: "upcoming", label: `upcoming · in ${startDays - d}d`, start, end, d };
  }
  if (d <= endDays) {
    return { key: "inside", label: `inside · no print · day ${d - startDays}/${endDays - startDays}`, start, end, d, left: endDays - d };
  }
  const overdue = d - endDays;
  return { key: "expired", label: `expired — no print · +${overdue}d`, start, end, d, overdue };
}

function powerLaw(now, price) {
  const t = Math.max(1, daysBetween(GENESIS, now));
  const trend = 10 ** (-16.493 + 5.688 * Math.log10(t));
  const floor = trend * 10 ** -0.4;
  const ceiling = trend * 10 ** 0.4;
  const mult = price ? price / trend : null;
  let zone = "—", zoneCls = "bg-gray";
  if (mult != null) {
    if (mult < 0.43) { zone = "Below Floor"; zoneCls = "bg-orange"; }
    else if (mult < 0.55) { zone = "Ideal Buy Zone"; zoneCls = "bg-lime"; }
    else if (mult < 0.70) { zone = "Cheap"; zoneCls = "bg-lime"; }
    else if (mult < 0.90) { zone = "Fair Value"; zoneCls = "bg-gray"; }
    else if (mult < 1.20) { zone = "Near Trend"; zoneCls = "bg-yellow"; }
    else if (mult < 1.80) { zone = "Expensive"; zoneCls = "bg-orange"; }
    else { zone = "Euphoria"; zoneCls = "bg-orange"; }
  }
  return { t, trend, floor, ceiling, mult, zone, zoneCls };
}

function rpState(mvrv) {
  if (mvrv == null) return "No data";
  if (mvrv < 0.85) return "Deep underwater";
  if (mvrv < 1) return "Below cost basis";
  if (mvrv < 1.5) return "Mild profit";
  if (mvrv < 2.5) return "Fair / mid-cycle profit";
  if (mvrv < 3.5) return "Stretched";
  return "Euphoria (high MVRV)";
}

function render() {
  const now = Date.now();
  const s = settings();
  const price = state.price;
  const pl = powerLaw(now, price);
  const dH = daysBetween(LAST_HALVING, now);
  const dNext = daysBetween(now, NEXT_HALVING);
  const dAth = daysBetween(ATH_TIME, now);
  const dd = price ? (price / ATH_PRICE - 1) * 100 : null;

  const top = windowState(now, s.topA, s.topB, true); // 2024 ATH already stamped inside
  const bot = windowState(now, s.botA, s.botB, false);

  document.getElementById("asof").textContent =
    "Local clock " + new Date(now).toLocaleString() + " · math is live · feeds refresh on load";
  document.getElementById("price").textContent = price ? fmtMoney(price) : "—";
  const perf = (state.signals && state.signals.perf) || {};
  if (state.chg != null && perf.d == null) perf.d = +state.chg.toFixed(1);
  const setChg = (id, label, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (v == null) { el.textContent = label + " —"; el.className = "gray"; return; }
    el.textContent = label + " " + (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
    el.className = v >= 0 ? "lime" : "red";
  };
  setChg("chgD", "D", perf.d);
  setChg("chgW", "W", perf.w);
  setChg("chgM", "M", perf.m);
  setChg("chgY", "Y", perf.y);
  const athPct = price ? (price / ATH_PRICE - 1) * 100 : perf.ath;
  const athEl = document.getElementById("athLine");
  if (athEl) {
    athEl.innerHTML = `ATH ${fmtMoney(ATH_PRICE)} · ${fmtDate(ATH_TIME)} · <span class="${athPct!=null && athPct<0?"red":"lime"}">${athPct==null?"—":athPct.toFixed(0)+"% from ATH"}</span>`;
  }
  const low = state.signals && state.signals.cycleLow;
  const lowEl = document.getElementById("lowLine");
  if (lowEl && low) {
    const bounce = price ? ((price / low.low - 1) * 100) : null;
    lowEl.textContent = `Cycle low so far ${fmtMoney(low.low)} on ${fmtDay(low.t)}` + (bounce==null?"":" · +"+bounce.toFixed(0)+"% off the low");
  }


  const above50 = state.signals ? state.signals.above50w : null;
  const grade = locationGrade(pl, price, state.rp, state.mvrv, above50);
  const gName = document.getElementById("gradeName");
  const gWhy = document.getElementById("gradeWhy");
  const gIf = document.getElementById("gradeIf");
  if (gName) {
    gName.textContent = grade.name;
    gName.style.color = ({Ideal:"#84cc16", Good:"#a3e635", Okay:"#facc15", Neutral:"#94a3b8", "Not Ideal":"#fb923c"})[grade.name] || "#e8edf5";
  }
  if (gWhy) gWhy.textContent = grade.why;
  if (gIf) gIf.textContent = grade.next;

  document.getElementById("banner").innerHTML =
    `<strong>Now:</strong> Bottom window is <em>${bot.key}</em> — ${bot.label}.
     Top already stamped inside the 2025 search box (6 Oct, day 534).
     ${bot.key === "expired"
        ? "Calendar paint is done. Priority: power law + RP + accumulation signals."
        : "Do not stamp a bottom from the date. Wait for weekly reclaim or a Build (weekly) buy."}`;

  const nextTopStart = addDays(NEXT_HALVING, s.topA);
  const nextTopEnd = addDays(NEXT_HALVING, s.topB);
  const nextBotStart = addDays(NEXT_HALVING, s.botA);
  const nextBotEnd = addDays(NEXT_HALVING, s.botB);

  const rows = HISTORY.map(h => `
    <tr>
      <td>${h.cycle}</td>
      <td>${pill(h.top, pillClass(h.top))}<div class="sub">${h.topNote}</div></td>
      <td>${pill(h.bot, pillClass(h.bot))}<div class="sub">${h.botNote}</div></td>
    </tr>`).join("");

  document.getElementById("ledger").innerHTML = `
    <tr><th>Cycle</th><th>Top print</th><th>Bottom print</th></tr>
    ${rows}
    <tr>
      <td>2024</td>
      <td>${pill("inside", "bg-lime")}<div class="sub">6 Oct 2025 · day 534</div></td>
      <td>${pill(bot.label, pillClass(bot.label))}<div class="sub">${fmtDate(bot.start)} – ${fmtDate(bot.end)}</div></td>
    </tr>
    <tr>
      <td>2028</td>
      <td>${pill("upcoming", "bg-gray")}<div class="sub">${fmtDate(nextTopStart)} – ${fmtDate(nextTopEnd)}</div></td>
      <td>${pill("upcoming", "bg-gray")}<div class="sub">${fmtDate(nextBotStart)} – ${fmtDate(nextBotEnd)}</div></td>
    </tr>`;

  const extendUntil = addDays(bot.end, s.extend);
  const sig50 = state.signals && state.signals.sma50w
    ? ((state.signals.above50w ? "above" : "below") + " " + fmtMoney(state.signals.sma50w) + " — reclaim not printed")
    : "load signal history";
  document.getElementById("playbook").innerHTML = `
    <tr><td class="k">State</td><td class="v">${pill(bot.label, pillClass(bot.label))}</td></tr>
    <tr><td class="k">Search ends</td><td class="v">${fmtDate(bot.end)}</td></tr>
    <tr><td class="k">Overdue timer</td><td class="v">${bot.key === "expired" ? "+" + bot.overdue + "d past window" : "starts after " + fmtDate(bot.end)}</td></tr>
    <tr><td class="k">Optional extension</td><td class="v">${fmtDate(bot.end)} → ${fmtDate(extendUntil)} (+${s.extend}d)</td></tr>
    <tr><td class="k">50-week average</td><td class="v">${sig50}</td></tr>
    <tr><td class="k">Stamp bottom when</td><td class="v">swing low + weekly close &gt; 50w or Build buy</td></tr>
    <tr><td class="k">Invalidate if</td><td class="v" style="color:#f87171">new low after the stamp</td></tr>`;

  document.getElementById("playbookNow").textContent =
    bot.key === "inside"
      ? `Playbook now: stay in search mode through ${fmtDate(bot.end)}. Do not auto-mark a bottom from day ${dH}.`
      : bot.key === "expired"
        ? `Window expired. Stop calling it the bottom box. Use extension to ${fmtDate(extendUntil)} only as a tagged search, then power law + RP + Anchor/Build.`
        : `Bottom search has not started.`;

  const vsTrend = pl.mult != null ? ((pl.mult - 1) * 100).toFixed(1) + "%" : "—";
  const vsFloor = price ? (((price / pl.floor) - 1) * 100).toFixed(1) + "%" : "—";
  const vsRp = price && state.rp ? (((price / state.rp) - 1) * 100).toFixed(1) + "%" : "—";

  document.getElementById("metrics").innerHTML = `
    <tr><td class="k">Zone</td><td class="v">${pill(pl.zone, pl.zoneCls)}</td></tr>
    <tr><td class="k">Multiple of trend</td><td class="v">${pl.mult ? pl.mult.toFixed(3) + "×" : "—"}</td></tr>
    <tr><td class="k">vs trend</td><td class="v">${vsTrend}</td></tr>
    <tr><td class="k">Floor</td><td class="v">${fmtMoney(pl.floor)} (${vsFloor})</td></tr>
    <tr><td class="k">Trend / ceiling</td><td class="v">${fmtMoney(pl.trend)} · ${fmtMoney(pl.ceiling)}</td></tr>
    <tr><td class="k">Realized price</td><td class="v">${fmtMoney(state.rp)}${state.rpAsOf && state.rpAsOf!=="live" ? " <span class=\"sub\">as of "+state.rpAsOf+"</span>" : ""}</td></tr>
    <tr><td class="k">vs RP / MVRV</td><td class="v">${vsRp} · ${state.mvrv ? state.mvrv.toFixed(2) + "×" : "—"}</td></tr>
    <tr><td class="k">RP state</td><td class="v">${rpState(state.mvrv)}</td></tr>
    <tr><td class="k">Days since halving</td><td class="v">${dH}</td></tr>
    <tr><td class="k">Days since ATH</td><td class="v">${dAth}</td></tr>
    <tr><td class="k">Drawdown</td><td class="v">${dd != null ? dd.toFixed(0) + "%" : "—"}</td></tr>
    <tr><td class="k">Next halving</td><td class="v">${dNext}d · ${fmtDate(NEXT_HALVING)}</td></tr>
    <tr><td class="k">Halving → ATH</td><td class="v">534 days</td></tr>
    <tr><td class="k">ATH → bottom</td><td class="v">open</td></tr>`;


  const sig = state.signals;
  let smaTxt = "awaiting rebuild";
  if (sig && sig.sma50w) {
    const a50 = sig.above50w ? "above 50w" : "below 50w";
    const a200 = sig.above200w ? "above 200w" : "below 200w";
    smaTxt = a50 + " / " + a200 + " · 50w " + fmtMoney(sig.sma50w);
  }
  const stackTxt = sig
    ? ("closed A " + (sig.anchor.lastClosed ?? "—") + " · B " + (sig.build.lastClosed ?? "—") + " · P " + (sig.pulse.lastClosed ?? "—"))
    : "pending";

  document.getElementById("lanes").innerHTML = `
    <div class="lane"><b>1 · Halving clock</b>${pill(bot.label, pillClass(bot.label))}</div>
    <div class="lane"><b>2 · Days since ATH</b>${dAth}d · ${dd != null ? dd.toFixed(0) + "%" : "—"}</div>
    <div class="lane"><b>3 · Power law</b>${pill(pl.zone, pl.zoneCls)} ${pl.mult ? pl.mult.toFixed(3) + "×" : ""}</div>
    <div class="lane"><b>4 · Realized / MVRV</b>${state.mvrv ? state.mvrv.toFixed(2) + "×" : "pending feed"}</div>
    <div class="lane"><b>5 · 50w / 200w</b>${smaTxt}</div>
    <div class="lane"><b>6 · Accumulation</b>${stackTxt}</div>`;

  renderLookAhead();
  renderRpCycles();
  renderSignals();
  const plain = document.getElementById("plainRead");
  if (plain) {
    const bits = [];
    if (bot.key === "inside") bits.push("We are in the usual post-halving low-search window, but a low is not confirmed yet.");
    if (bot.key === "expired") bits.push("The usual low-search window has ended with no confirmed low.");
    if (pl.zone) bits.push("Versus the long-term trend, price is in the " + pl.zone.toLowerCase() + ".");
    if (state.mvrv) bits.push("Holders as a group are still in profit (MVRV " + state.mvrv.toFixed(2) + ").");
    bits.push("The Oct 2025 high already counts as the cycle top print.");
    plain.textContent = bits.join(" ");
  }
}



function renderLookAhead() {
  const tbl = document.getElementById("laTable");
  const note = document.getElementById("laNote");
  if (!tbl) return;
  const monthsEl = document.getElementById("laMonths");
  const dateEl = document.getElementById("laDate");
  let target;
  if (dateEl && dateEl.value) target = new Date(dateEl.value + "T00:00:00Z").getTime();
  else {
    const m = monthsEl ? +monthsEl.value || 12 : 12;
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + m);
    target = d.getTime();
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date(target).toISOString().slice(0, 10);
    }
  }
  const pl = powerLaw(target, state.price);
  const px = state.price;
  const futMult = px && pl.trend ? px / pl.trend : null;
  let zone = "—";
  if (futMult != null) {
    zone = futMult < 0.43 ? "Below Floor" : futMult < 0.55 ? "Ideal Buy Zone" : futMult < 0.70 ? "Cheap" : futMult < 0.90 ? "Fair" : futMult < 1.20 ? "Near Trend" : futMult < 1.80 ? "Expensive" : "Euphoria";
  }
  tbl.innerHTML = `
    <tr><td class="k">Date</td><td class="v">${fmtDate(target)}</td></tr>
    <tr><td class="k">Power-law floor</td><td class="v">${fmtMoney(pl.floor)}</td></tr>
    <tr><td class="k">Power-law trend</td><td class="v">${fmtMoney(pl.trend)}</td></tr>
    <tr><td class="k">Power-law ceiling</td><td class="v">${fmtMoney(pl.ceiling)}</td></tr>
    <tr><td class="k">If spot stays ${fmtMoney(px)}</td><td class="v">${futMult ? futMult.toFixed(2)+"× trend · "+zone : "—"}</td></tr>`;
  if (note) {
    note.textContent = "Change months or the date. Realized price is only shown as of the last snapshot, not projected.";
  }
}

function renderRpCycles() {
  const tbl = document.getElementById("rpCycles");
  const now = document.getElementById("rpNow");
  const story = document.getElementById("rpStory");
  if (!tbl) return;
  const pack = state.rpCycles;
  const rp = state.rp;
  const px = state.price;
  const vs = (rp && px) ? ((px / rp - 1) * 100) : null;
  if (now) {
    now.innerHTML = `
      <tr><td class="k">Realized price now</td><td class="v">${fmtMoney(rp)}${state.rpAsOf && state.rpAsOf!=="live" ? " <span class=\"sub\">as of "+state.rpAsOf+"</span>" : ""}</td></tr>
      <tr><td class="k">Spot vs RP</td><td class="v">${vs==null ? "—" : (vs>=0?"+":"")+vs.toFixed(0)+"%"} · MVRV ${state.mvrv ? state.mvrv.toFixed(2)+"×" : "—"}</td></tr>`;
  }
  const cl = document.getElementById("cycleLow");
  const low = state.signals && state.signals.cycleLow;
  if (cl && low) {
    const off = px ? ((px / low.low - 1) * 100) : null;
    const vsRp = rp ? ((low.low / rp - 1) * 100) : null;
    cl.innerHTML = `
      <tr><td class="k">Cycle low since ATH</td><td class="v">${fmtMoney(low.low)} · ${fmtDay(low.t)}</td></tr>
      <tr><td class="k">Spot vs that low</td><td class="v">${off==null?"—":"+"+off.toFixed(0)+"%"}</td></tr>
      <tr><td class="k">That low vs RP</td><td class="v">${vsRp==null?"—":(vsRp>=0?"+":"")+vsRp.toFixed(0)+"% · still above realized"}</td></tr>`;
  }
  if (!pack) {
    tbl.innerHTML = "<tr><td>Realized-price history missing. Upload data/rp-cycles.json.</td></tr>";
    return;
  }
  const rows = pack.cycles.map(c => {
    const tag = c.wentBelow ? pill("went below", "bg-lime") : c.visited ? pill("tagged", "bg-yellow") : pill("not yet", "bg-orange");
    const when = c.wentBelow
      ? `first ${c.firstBelow} · last ${c.lastBelow} · ${c.daysBelow} days under`
      : c.minDay ? `closest ${c.minMultiple}× on ${c.minDay}` : "—";
    return `<tr><td>${c.cycle}</td><td>${tag}</td><td class="sub">${when}</td></tr>`;
  }).join("");
  tbl.innerHTML = `<tr><th>Cycle</th><th>Spot vs RP</th><th>When</th></tr>${rows}`;
  const cur = pack.cycles.find(c => c.cycle === "2024");
  const prev = pack.cycles.find(c => c.cycle === "2020");
  if (story && cur && prev) {
    story.innerHTML = prev.wentBelow
      ? `Last cycle (2020) went under realized price from ${prev.firstBelow} to ${prev.lastBelow} (${prev.daysBelow} days), down to ${prev.minMultiple}×. This cycle has <b>not</b> tagged it. Closest so far: ${cur.minMultiple}× on ${cur.minDay}.`
      : `Last cycle did not go under RP. This cycle closest: ${cur.minMultiple}×.`;
  }
}

function fmtDay(ts) {
  return new Date(ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function renderSignals() {
  const grid = document.getElementById("sigGrid");
  const hits = document.getElementById("hitCounts");
  if (!grid) return;
  const n = +((document.getElementById("showN") || {}).value || 5);
  const sig = state.signals;
  if (!sig) {
    grid.innerHTML = "<p class='note'>Signal history loads from data/signals.json after publish.</p>";
    return;
  }
  const cols = [
    ["1 · rarest", sig.anchor],
    ["2 · weekly", sig.build],
    ["3 · most often", sig.pulse],
  ];
  hits.textContent = `12 months A ${sig.anchor.buys12m} · B ${sig.build.buys12m} · P ${sig.pulse.buys12m}
  · since ATH A ${sig.anchor.buysSinceAth} · B ${sig.build.buysSinceAth} · P ${sig.pulse.buysSinceAth}`;
  const stack = document.getElementById("stackRead");
  if (stack) {
    const recentBuild = (sig.build.lastBuys || []).slice(-1)[0];
    const recentPulse = (sig.pulse.lastBuys || []).slice(-1)[0];
    const agree = recentBuild && recentPulse && recentPulse.t >= recentBuild.t - 21*86400;
    stack.textContent = sig.above50w
      ? "Price is back above the 50-week average. A low stamp is allowed if a swing low is in place."
      : "Price is still below the 50-week average, so a cycle-low stamp is not printed. Pulse buys here are tactical only unless Build agrees.";
    if (!sig.above50w) stack.style.borderColor = "#3a2a20";
  }
  grid.innerHTML = cols.map(([rank, s]) => {
    const buys = (s.lastBuys || []).slice(-n).reverse();
    const list = buys.length
      ? buys.map(b => {
          const perf = b.afterPct == null ? "" : `<span class="${b.afterPct>=0?"lime":"red"}">${b.afterPct>=0?"+":""}${b.afterPct}%</span>`;
          return `<li><span>${fmtDay(b.t)}</span><span>${fmtMoney(b.price)} ${perf}</span></li>`;
        }).join("")
      : "<li class='gray'>No closed-bar buys in this history.</li>";
    const sells = (s.lastSells || []).slice(-2).reverse();
    const sl = sells.length ? `<div class="sub">Last sells: ${sells.map(x => fmtDay(x.t)).join(", ")}</div>` : "";
    return `<div class="sig-col">
      <div class="sub">${rank} · ${s.timeframe}</div>
      <h3>${s.name}${s.liveBuy ? ' <span class="pill bg-lime">LIVE BUY</span>' : s.liveSell ? ' <span class="pill bg-orange">LIVE SELL</span>' : ""}</h3>
      <div class="sub">${s.buys6m} in 6 months · ${s.buys12m} in 12 months · ${s.buysSinceAth} since ATH</div>
      <ul>${list}</ul>
    </div>`;
  }).join("");
}


async function pullRecentDaily() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=1d&range=6mo";
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    const d = await r.json();
    const res = d.chart && d.chart.result && d.chart.result[0];
    if (!res) return;
    const ts = res.timestamp || [];
    const q = res.indicators.quote[0];
    const extra = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
      if (o == null || c == null) continue;
      extra.push({ t: ts[i], o, h, l, c, v: v || 0 });
    }
    if (!extra.length) return;
    const have = new Set((state.daily || []).map(b => Math.floor(b.t / 86400)));
    const merged = (state.daily || []).slice();
    for (const b of extra) {
      const day = Math.floor(b.t / 86400);
      if (!have.has(day)) { merged.push(b); have.add(day); }
      else {
        const idx = merged.findIndex(x => Math.floor(x.t / 86400) === day);
        if (idx >= 0) merged[idx] = b;
      }
    }
    merged.sort((a, b) => a.t - b.t);
    state.daily = merged;
  } catch (e) { console.warn("yahoo daily", e); }
}

function markRpIfTagged() {
  if (!state.rpCycles || !state.rp || !state.price) return;
  const cur = state.rpCycles.cycles.find(c => c.cycle === "2024");
  if (!cur) return;
  const mult = state.price / state.rp;
  if (mult < (cur.minMultiple || 99)) {
    cur.minMultiple = +mult.toFixed(3);
    cur.minDay = new Date().toISOString().slice(0, 10);
  }
  if (state.price < state.rp) {
    cur.wentBelow = true;
    cur.visited = true;
    if (!cur.firstBelow) cur.firstBelow = new Date().toISOString().slice(0, 10);
    cur.lastBelow = new Date().toISOString().slice(0, 10);
  }
}

async function loadFeeds() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true");
    if (r.ok) {
      const j = await r.json();
      state.price = j.bitcoin.usd;
      state.chg = j.bitcoin.usd_24h_change;
    }
  } catch (e) { console.warn("price feed", e); }

  try {
    const [rp, mv] = await Promise.all([
      fetch("https://bitcoin-data.com/api/v1/realized-price/last"),
      fetch("https://bitcoin-data.com/api/v1/mvrv/last"),
    ]);
    if (rp.ok) {
      const j = await rp.json();
      state.rp = j.realizedPrice ?? j.realized_price ?? Object.values(j).find(v => typeof v === "number" && v > 1000);
    }
    if (mv.ok) {
      const j = await mv.json();
      state.mvrv = j.mvrv ?? Object.values(j).find(v => typeof v === "number" && v < 20);
      if (state.rp) state.rpAsOf = "live";
    }
  } catch (e) { console.warn("onchain feed", e); }

  if (state.rp == null || state.mvrv == null) {
    try {
      const snap = await fetch("data/onchain.json");
      if (snap.ok) {
        const j = await snap.json();
        if (state.rp == null) state.rp = j.realizedPrice;
        if (state.mvrv == null) state.mvrv = j.mvrv;
        state.rpAsOf = j.asOf || "snapshot";
      }
    } catch (e) { console.warn("onchain snapshot", e); }
  }

  try {
    const d = await fetch("data/btc-daily.json");
    if (d.ok) state.daily = await d.json();
  } catch (e) { console.warn("daily", e); }
  await pullRecentDaily();
  try {
    const s = await fetch("data/signals.json");
    if (s.ok && !state.daily) state.signals = await s.json();
  } catch (e) { console.warn("signals", e); }
  recomputeLive();
  try {
    const r = await fetch("data/rp-cycles.json");
    if (r.ok) state.rpCycles = await r.json();
  } catch (e) { console.warn("rp cycles", e); }

  if (!state.price) state.price = 78339;
  markRpIfTagged();
  render();
}

function bind() {
  const showN = document.getElementById("showN");
  if (showN) showN.addEventListener("change", render);
  ["laMonths", "laDate"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", render);
  });
}

bind();
render();
loadFeeds();


function recomputeLive() {
  if (!state.daily || typeof buildSignals !== "function") return;
  state.signals = buildSignals(state.daily, state.price);
}

setInterval(async () => {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true");
    if (r.ok) {
      const j = await r.json();
      state.price = j.bitcoin.usd;
      state.chg = j.bitcoin.usd_24h_change;
    }
  } catch (e) {}
  recomputeLive();
  render();
}, 60000);
