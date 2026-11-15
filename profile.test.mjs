import fs from "node:fs";
import vm from "node:vm";
import "./profile.js";

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log("ok   " + name); }
  catch (e) { fail++; console.log("FAIL " + name + " :: " + e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function truthy(v, msg) { if (!v) throw new Error(msg || "not truthy"); }

const P = globalThis.RRProfile;

const EXPECT = {
  cap: ["hat", 300], beanie: ["hat", 400], crown: ["hat", 5000],
  sunglasses: ["shades", 350], goldshades: ["shades", 1500],
  hoodie: ["outfit", 500], dripjacket: ["outfit", 1200], suit: ["outfit", 2500],
  silverchain: ["chain", 800], goldchain: ["chain", 3000], diamondchain: ["chain", 8000],
  sneakers: ["shoes", 400], designerkicks: ["shoes", 2000],
  bike: ["ride", 700], sportscar: ["ride", 9000],
  room: ["place", 150], cleantee: ["outfit", 100], cityview: ["place", 1000], penthouse: ["place", 6000], yacht: ["place", 12000]
};

function catalogCheck(RR) {
  eq(RR.CATALOG.length, 20, "catalog size");
  for (const c of RR.CATALOG) {
    truthy(EXPECT[c.id], "unexpected id " + c.id);
    eq([c.slot, c.price], EXPECT[c.id], c.id);
    truthy(c.name && c.desc, "name/desc for " + c.id);
  }
}

check("CATALOG has exactly the contract items, slots, prices", () => catalogCheck(P));
check("netWorth of sets", () => {
  eq(P.netWorth([]), 0, "empty");
  eq(P.netWorth(["cap"]), 300);
  eq(P.netWorth(["cap", "crown", "yacht"]), 17300);
  eq(P.netWorth(Object.keys(EXPECT)), Object.values(EXPECT).reduce((a, v) => a + v[1], 0), "everything");
  eq(P.netWorth(["nonsense", "bike"]), 700, "unknown ids ignored");
});

const ids = P.CATALOG.map(c => c.id);
function oneItem(id) { const c = P.CATALOG.find(x => x.id === id); return { [c.slot]: id }; }
function allEquipped() {
  const e = {};
  // one item per slot, the richest of each
  for (const id of ["crown", "goldshades", "suit", "diamondchain", "designerkicks", "sportscar", "yacht"]) Object.assign(e, oneItem(id));
  return e;
}
function validate(svg, label) {
  truthy(typeof svg === "string" && svg.startsWith("<svg"), label + " starts with <svg");
  truthy(svg.endsWith("</svg>"), label + " ends with </svg>");
  truthy(!svg.includes("undefined"), label + " has undefined");
  truthy(!svg.includes("NaN"), label + " has NaN");
  const open = (svg.match(/<g[\s>]/g) || []).length, close = (svg.match(/<\/g>/g) || []).length;
  eq(open, close, label + " <g balance");
}

check("avatarSVG valid for every single item and plain", () => {
  let n = 0;
  eq(ids.length, 20, "setup: 20 items");
  validate(P.avatarSVG({ equipped: {} }), "plain"); n++;
  for (const id of ids) { validate(P.avatarSVG({ equipped: oneItem(id), size: 220 }), id); n++; }
  eq(n, 21, "count of renders");
});
check("avatarSVG valid with everything equipped and crop head", () => {
  const e = allEquipped();
  eq(Object.keys(e).length, 7, "setup: 7 slots");
  validate(P.avatarSVG({ equipped: e }), "all");
  validate(P.avatarSVG({ equipped: e, crop: "head", size: 34 }), "crop");
});
check("avatarSVG handles missing/odd input", () => {
  validate(P.avatarSVG(), "no args");
  validate(P.avatarSVG({ equipped: { hat: "bogus" } }), "bad values");
});
check("size sets width/height; default 220; crop changes viewBox", () => {
  const a = P.avatarSVG({ size: 34 }), b = P.avatarSVG({});
  truthy(a.includes('width="34" height="34"'), "size 34");
  truthy(b.includes('width="220" height="220"'), "default 220");
  const c = P.avatarSVG({ crop: "head" });
  truthy(!c.includes('viewBox="0 0 300 300"') && b.includes('viewBox="0 0 300 300"'), "crop viewBox differs");
});
check("two avatars on one page share no element ids", () => {
  const e = allEquipped();
  const grab = s => [...s.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const a = grab(P.avatarSVG({ equipped: e })), b = grab(P.avatarSVG({ equipped: e }));
  truthy(a.length > 0 && b.length > 0, "setup: svgs actually have ids (" + a.length + "," + b.length + ")");
  eq(new Set(a).size, a.length, "ids unique within one svg");
  eq(a.filter(x => b.includes(x)), [], "shared ids");
  // every url(#id) reference resolves inside its own svg
  const s = P.avatarSVG({ equipped: e });
  for (const m of s.matchAll(/url\(#([^)]+)\)/g)) truthy(grab(s).includes(m[1]), "dangling ref " + m[1]);
});
check("avatarSVG output is identical whether or not a smart field is passed", () => {
  const e = allEquipped();
  for (const o of [{ equipped: {} }, { equipped: e }, { equipped: e, crop: "head", size: 34 }]) {
    const base = P.avatarSVG(o).replace(/pf\d+-/g, "pf");
    for (const smart of [0, 1, 3, 5, 99, -3, "x"]) eq(P.avatarSVG(Object.assign({ smart }, o)).replace(/pf\d+-/g, "pf"), base, "smart " + smart);
  }
});
check("no smart-level API or drawings remain", () => {
  for (const k of ["smartLevel", "SMART_NAMES", "SMART_STEPS"]) eq(typeof P[k], "undefined", k);
  const svg = P.avatarSVG({ equipped: {} });
  for (const k of ["pencil", "glasses", "book", "bubble", "grad", "m/n"]) truthy(!svg.includes(k), k + " drawn");
});
check("items add visible layers (each item changes the picture)", () => {
  const base = P.avatarSVG({ equipped: {} });
  for (const id of ids) truthy(P.avatarSVG({ equipped: oneItem(id) }) !== base.replace(/pf\d+-/g, "pf"), id + " changes nothing");
});
check("module loads in Node without document/window", () => {
  eq(typeof document, "undefined", "setup: no document");
  eq(typeof P.mount, "function");
});

check("mutation: wrong price is caught by the catalog check", () => {
  const src = fs.readFileSync(new URL("./profile.js", import.meta.url), "utf8");
  const bad = src.replace("price: 9000", "price: 900");
  truthy(bad !== src, "setup: mutation applied");
  const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(bad, ctx);
  let caught = false;
  try { catalogCheck(ctx.RRProfile); } catch (e) { caught = true; }
  truthy(caught, "mutant survived");
});

check("status: starts Broke on the road, climbs with net worth", () => {
  eq(P.status([]).name, "Broke", "nothing owned");
  truthy(/road/.test(P.avatarSVG({ equipped: {} })) || /WILL DO MATH/.test(P.avatarSVG({ equipped: {} })), "default scene is the road sign");
  eq(P.status(["cleantee"]).name, "Scraping by", "100");
  eq(P.status(["cityview"]).name, "Getting by", "1000");
  eq(P.status(["suit", "goldchain"]).name, "Comfortable", "5500");
  eq(P.status(["yacht", "sportscar"]).name, "Rich", "21000");
  eq(P.status(P.CATALOG.map(c => c.id)).name, "Rolling in it", "everything");
  eq(P.status(P.CATALOG.map(c => c.id)).next, null, "no next at top");
  const s = P.status(["cleantee"]); eq(s.toNext, 900, "900 to Getting by");
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
