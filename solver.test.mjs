import "./solver.js";
const S = globalThis.RRSolve.solve;
let pass = 0, fail = 0;
// html -> plain text: <sup class="hk-ix">3</sup>√<span class="hk-ov">2</span> -> 3√(2), x<sup>2</sup> -> x^2
function plain(h) {
  return String(h || "")
    .replace(/<sup class="hk-ix">(.*?)<\/sup>/g, "[$1]")
    .replace(/<span class="hk-ov">(.*?)<\/span><\/span>/g, "($1)")
    .replace(/<sup>(.*?)<\/sup>/g, "^$1")
    .replace(/<[^>]+>/g, "");
}
function t(input, want, field = "answer") {
  const r = S(input), got = r.ok ? plain(r[field]) : "ERR:" + r.msg;
  if (got === want) { pass++; } else { fail++; console.log("FAIL", JSON.stringify(input), "→", JSON.stringify(got), "want", JSON.stringify(want)); }
}
// 5.1 evaluate by hand
t("∛-27", "−3");
t("16^(3/4)", "8");
t("27^(-2/3)", "1/9");
t("(-32)^(1/5)", "−2");
t("-16^(1/4)", "−2");
t("(-16)^(1/4)", "Not a real number");
t("root(4, 81)", "3");
t("⁴√81", "3");
t("32^(2/5)", "4");
// calculator values
t("7^(1/3)", "[3]√(7)");
t("7^(1/3)", "1.91", "decimal");
t("5^(3/4)", "[4]√(125)");
// simplest form
t("√72", "6√(2)");
t("∛54", "3[3]√(2)");
t("√80/√5", "4");
t("√(18)*√2", "6");
t("∛4*∛16", "4");
t("1/√2", "√(2)/2");
t("3/√5", "3√(5)/5");
t("∛(2/3)", "[3]√(18)/3");
t("2/(1+√3)", "−1 + √(3)");
// properties of exponents
t("6^(2/3)*6^(1/3)", "6");
t("(5^(1/3))^3", "5");
t("(4^3)^(1/2)", "8");
t("8^(-1/3)", "1/2");
t("6^(1/2)*6^(1/3)", "[6]√(7776)");
// like radicals
t("2√12+3√27", "13√(3)");
t("5*3^(1/4)+2*3^(1/4)", "7[4]√(3)");
t("5*3^(1/4)+2*3^(1/4)", "7·3^1/4", "alt");
t("√50 - √18", "2√(2)");
t("∛81 + ∛24", "5[3]√(3)");
// variables
t("√(x^3)", "x√(x)");
t("∛(27y^6)", "3y^2");
t("x^(1/2)*x^(1/3)", "[6]√(x^5)");
t("√(49x^4 y^5)", "7x^2y^2√(y)");
t("x^(-1/2)", "√(x)/x");
// equations
t("x^3 = -64", "x = −4");
t("x^4 = 16", "x = ±2");
t("x^4 = -16", "No real solution");
t("3x^4 + 5 = 53", "x = ±2");
t("4x^5 = 128", "x = 2");
t("(x-2)^3 = 8", "x = 4");
t("(x+3)^2 = 16", "x = 1 or x = −7");
t("2(x+3)^3 - 5 = 49", "x = 0");
t("(x-2)^2 = 3", "x = 2 ± √(3)");
t("(x+1)^2 = 8", "x = −1 ± 2√(2)");
t("x^2 = 7", "x = ±√(7)");
t("x^(2/3) = 4", "x = ±8");
t("x^(3/2) = 27", "x = 9");
t("√x = 5", "x = 25");
t("√x = -5", "No real solution");
t("x^5 + 10 = 42", "x = 2");
t("6x^3 = 48", "x = 2");
t("5 = x^3 - 3", "x = 2");
t("x^3=10", "x ≈ 2.15", "decimal");
// errors
t("2+", "ERR:Something is missing near the end");
t("x^2 = x", "ERR:Put the x on one side only (e.g. move everything to the left)");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
