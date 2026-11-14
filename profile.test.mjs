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
  cityview: ["place", 1000], penthouse: ["place", 6000], yacht: ["place", 12000]
};

function catalogCheck(RR) {
  eq(RR.CATALOG.length, 18, "catalog size");
  for (const c of RR.CATALOG) {
    truthy(EXPECT[c.id], "unexpected id " + c.id);
    eq([c.slot, c.price], EXPECT[c.id], c.id);
    truthy(c.name && c.desc, "name/desc for " + c.id);
  }
}
function levelCheck(RR) {
  const cases = [[0, 0], [1, 0], [2, 1], [4, 1], [5, 2], [8, 2], [9, 3], [13, 3], [14, 4], [19, 4], [20, 5], [40, 5]];
  for (const [score, lv] of cases) {
    eq(RR.smartLevel({ mastered: score, passedDays: 0 }), lv, "score " + score);
  }
}

check("CATALOG has exactly the contract items, slots, prices", () => catalogCheck(P));
check("SMART_NAMES match contract", () => eq(P.SMART_NAMES, ["Clueless", "Learning", "Sharp", "Brainy", "Genius", "Professor"]));
check("smartLevel at scores 0,1,2,4,5,8,9,13,14,19,20,40", () => levelCheck(P));
check("passedDays counts 3 each", () => {
  eq(P.smartLevel({ mastered: 0, passedDays: 0 }), 0, "setup");
  eq(P.smartLevel({ mastered: 0, passedDays: 1 }), 1, "1 day = 3");
  eq(P.smartLevel({ mastered: 2, passedDays: 1 }), 2, "2+3=5");
  eq(P.smartLevel({ mastered: 0, passedDays: 7 }), 5, "21");
  eq(P.smartLevel({ mastered: 1, passedDays: 6 }), 4, "19");
});
check("smartLevel tolerates missing stats", () => { eq(P.smartLevel({}), 0); eq(P.smartLevel(null), 0); });
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

check("avatarSVG valid for every smart level x every single item", () => {
  let n = 0;
  eq(ids.length, 18, "setup: 18 items");
  for (let smart = 0; smart <= 5; smart++) {
    validate(P.avatarSVG({ smart, equipped: {} }), "plain s" + smart); n++;
    for (const id of ids) { validate(P.avatarSVG({ smart, equipped: oneItem(id), size: 220 }), "s" + smart + " " + id); n++; }
  }
  eq(n, 6 * 19, "count of renders");
});
check("avatarSVG valid with everything equipped, every level, and crop head", () => {
  const e = allEquipped();
  eq(Object.keys(e).length, 7, "setup: 7 slots");
  for (let smart = 0; smart <= 5; smart++) {
    validate(P.avatarSVG({ smart, equipped: e }), "all s" + smart);
    validate(P.avatarSVG({ smart, equipped: e, crop: "head", size: 34 }), "crop s" + smart);
  }
});
check("avatarSVG handles missing/odd input", () => {
  validate(P.avatarSVG(), "no args");
  validate(P.avatarSVG({ smart: 99, equipped: { hat: "bogus" } }), "bad values");
  validate(P.avatarSVG({ smart: -3 }), "negative");
});
check("size sets width/height; default 220; crop changes viewBox", () => {
  const a = P.avatarSVG({ smart: 0, size: 34 }), b = P.avatarSVG({ smart: 0 });
  truthy(a.includes('width="34" height="34"'), "size 34");
  truthy(b.includes('width="220" height="220"'), "default 220");
  const c = P.avatarSVG({ smart: 0, crop: "head" });
  truthy(!c.includes('viewBox="0 0 300 300"') && b.includes('viewBox="0 0 300 300"'), "crop viewBox differs");
});
check("two avatars on one page share no element ids", () => {
  const e = allEquipped();
  const grab = s => [...s.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const a = grab(P.avatarSVG({ smart: 5, equipped: e })), b = grab(P.avatarSVG({ smart: 5, equipped: e }));
  truthy(a.length > 0 && b.length > 0, "setup: svgs actually have ids (" + a.length + "," + b.length + ")");
  eq(new Set(a).size, a.length, "ids unique within one svg");
  eq(a.filter(x => b.includes(x)), [], "shared ids");
  // every url(#id) reference resolves inside its own svg
  const s = P.avatarSVG({ smart: 5, equipped: e });
  for (const m of s.matchAll(/url\(#([^)]+)\)/g)) truthy(grab(s).includes(m[1]), "dangling ref " + m[1]);
});
check("graduation cap: smart 5 with no hat yes; with hat no; below 5 no", () => {
  const G = "pf-L-grad";
  truthy(!P.avatarSVG({ smart: 5, equipped: { hat: "cap" } }).includes(G), "setup: hat equipped renders (no grad)");
  truthy(P.avatarSVG({ smart: 5, equipped: {} }).includes(G), "smart 5 no hat");
  for (const hat of ["cap", "beanie", "crown"]) truthy(!P.avatarSVG({ smart: 5, equipped: { hat } }).includes(G), "hat " + hat);
  for (let s = 0; s < 5; s++) truthy(!P.avatarSVG({ smart: s, equipped: {} }).includes(G), "smart " + s);
  truthy(P.avatarSVG({ smart: 5, equipped: { hat: "cap" } }).includes("pf-L-hat"), "hat layer present");
});
check("smart items stack: pencil 1, glasses 2, book 3, bubble 4", () => {
  const has = (s, k) => P.avatarSVG({ smart: s, equipped: {} }).includes("pf-L-" + k);
  const want = { pencil: 1, glasses: 2, book: 3, bubble: 4 };
  for (const [k, from] of Object.entries(want)) for (let s = 0; s <= 5; s++) eq(has(s, k), s >= from, k + " at " + s);
  truthy(P.avatarSVG({ smart: 4, equipped: {} }).includes("m/n"), "bubble shows m/n");
  truthy(!P.avatarSVG({ smart: 2, equipped: { shades: "sunglasses" } }).includes("pf-L-glasses"), "shades replace glasses");
});
check("items add visible layers (each item changes the picture)", () => {
  const base = P.avatarSVG({ smart: 0, equipped: {} });
  for (const id of ids) truthy(P.avatarSVG({ smart: 0, equipped: oneItem(id) }) !== base.replace(/pf\d+-/g, "pf"), id + " changes nothing");
});
check("module loads in Node without document/window", () => {
  eq(typeof document, "undefined", "setup: no document");
  eq(typeof P.mount, "function");
});

// Mutation: a wrong threshold (14 -> 15) must make the level check fail.
check("mutation: wrong threshold is caught by the level check", () => {
  const src = fs.readFileSync(new URL("./profile.js", import.meta.url), "utf8");
  const bad = src.replace("[0, 2, 5, 9, 14, 20]", "[0, 2, 5, 9, 15, 20]");
  truthy(bad !== src, "setup: mutation applied");
  const ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(bad, ctx);
  let caught = false;
  try { levelCheck(ctx.RRProfile); } catch (e) { caught = true; }
  truthy(caught, "mutant survived");
  // and the unmutated copy passes the same check
  const ctx2 = {}; ctx2.globalThis = ctx2; vm.createContext(ctx2); vm.runInContext(src, ctx2);
  levelCheck(ctx2.RRProfile);
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

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
