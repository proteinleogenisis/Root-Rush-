// node typed.test.mjs : checks the typed-answer checker (typed.js)
import "./typed.js";
const T = globalThis.RRType; let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL " + m); } };
const yes = (u, c) => { const r = T.check(u, c); ok(r.ok, `"${u}" should be right for ${c} ${JSON.stringify(r)}`); };
const no = (u, c) => { const r = T.check(u, c); ok(!r.ok && !r.retry, `"${u}" should be wrong for ${c} ${JSON.stringify(r)}`); };
const retry = (u, c) => { const r = T.check(u, c); ok(!r.ok && r.retry, `"${u}" should ask to simplify for ${c} ${JSON.stringify(r)}`); };
// canType
for (const c of ["64", "−3", "Not a real number", "x = ±2", "x = 14 or x = 2", "2<sup>11/6</sup>", "1 / 5<sup>4/3</sup>", "7√11", "k<sup>6</sup> / 2|z|", "3m<sup>4</sup>n<sup>4</sup>", "13⁶√2", "20(2<sup>1/3</sup>)", "10.95", "1/6", "No real solution"]) ok(T.canType(c), "canType " + c);
for (const c of ["8 ^ (2/5)", "Subtract 24, divide by 4, then take the cube root", "Can't be combined: the indexes (2 and 3) are different", "They can't be combined"]) ok(!T.canType(c), "not typable " + c);
// numbers and sets
yes("64", "64"); no("46", "64"); yes("-3", "−3"); no("3", "−3");
yes("No real", "Not a real number"); no("3", "Not a real number"); no("No real", "−3");
yes("±2", "x = ±2"); yes("2, -2", "x = ±2"); yes("-2 or 2", "x = ±2"); no("2", "x = ±2"); no("±2", "x = 2");
yes("14, 2", "x = 14 or x = 2"); no("14", "x = 14 or x = 2"); no("14, -2", "x = 14 or x = 2");
yes("10.95", "10.95"); yes("10.954", "10.95"); no("10.9", "10.95");
yes("1/6", "1/6"); no("6", "1/6"); yes("0.5", "1/2"); retry("2/4", "1/2");
// radicals: simplest form required
yes("7√11", "7√11"); no("11√7", "7√11"); retry("√539", "7√11"); retry("√98", "7√2");
yes("2√30", "2√30"); retry("√120", "2√30"); retry("9.899", "7√2"); retry("9.9", "7√2"); no("9.8", "7√2");
yes("∜2", "1∜2"); yes("4∜14", "4∜14"); retry("7∜14-3∜14", "4∜14");
yes("13·2^(1/6)", "13⁶√2"); yes("20∛2", "20(2<sup>1/3</sup>)"); yes("20(2^(1/3))", "20(2<sup>1/3</sup>)");
// exponents
yes("2^(11/6)", "2<sup>11/6</sup>"); retry("2·2^(5/6)", "2<sup>11/6</sup>"); retry("2^(22/12)", "2<sup>11/6</sup>");
yes("1/5^(4/3)", "1 / 5<sup>4/3</sup>"); retry("5^(-4/3)", "1 / 5<sup>4/3</sup>"); no("5^(4/3)", "1 / 5<sup>4/3</sup>");
yes("-243", "−243"); no("243", "−243");
// variables, incl. absolute value
yes("3m^4n^4", "3m<sup>4</sup>n<sup>4</sup>"); no("3m^4n^3", "3m<sup>4</sup>n<sup>4</sup>"); no("81m^4n^4", "3m<sup>4</sup>n<sup>4</sup>");
yes("k^6/(2|z|)", "k<sup>6</sup> / 2|z|"); yes("k^6/2|z|", "k<sup>6</sup> / 2|z|"); no("k^6/(2z)", "k<sup>6</sup> / 2|z|"); no("k^6/2", "k<sup>6</sup> / 2|z|");
yes("x^4/3|y|", "x<sup>4</sup> / 3|y|");
// junk
ok(T.check("((2", "2").retry, "unreadable asks again"); ok(T.check("", "2").empty, "empty");
ok(T.render("2^(1/3)").includes("<sup>1/3</sup>"), "render sup");
console.log(bad ? bad + " FAILED" : "all typed tests passed");
process.exit(bad ? 1 : 0);
