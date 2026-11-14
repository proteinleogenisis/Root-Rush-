/* Root Rush profile: the guy, his smart level, and the cosmetics shop.
   Plain script: sets globalThis.RRProfile. Touches document only inside mount(). */
(function () {
  "use strict";

  var CATALOG = [
    { id: "cap", slot: "hat", name: "Cap", price: 300, desc: "A red cap, worn straight" },
    { id: "beanie", slot: "hat", name: "Beanie", price: 400, desc: "Warm knit beanie with a pom-pom" },
    { id: "crown", slot: "hat", name: "Crown", price: 5000, desc: "Solid gold. Obviously." },
    { id: "sunglasses", slot: "shades", name: "Sunglasses", price: 350, desc: "Dark lenses, no squinting" },
    { id: "goldshades", slot: "shades", name: "Gold shades", price: 1500, desc: "Gold frames, amber lenses" },
    { id: "hoodie", slot: "outfit", name: "Hoodie", price: 500, desc: "Soft grey hoodie" },
    { id: "dripjacket", slot: "outfit", name: "Drip jacket", price: 1200, desc: "Orange puffer with a fur collar" },
    { id: "suit", slot: "outfit", name: "Suit", price: 2500, desc: "Sharp suit and a red tie" },
    { id: "silverchain", slot: "chain", name: "Silver chain", price: 800, desc: "Clean silver chain" },
    { id: "goldchain", slot: "chain", name: "Gold chain", price: 3000, desc: "Heavy gold chain" },
    { id: "diamondchain", slot: "chain", name: "Diamond chain", price: 8000, desc: "Icy diamond pendant" },
    { id: "sneakers", slot: "shoes", name: "Sneakers", price: 400, desc: "Fresh white sneakers" },
    { id: "designerkicks", slot: "shoes", name: "Designer kicks", price: 2000, desc: "Black and gold, limited drop" },
    { id: "bike", slot: "ride", name: "Bike", price: 700, desc: "A red road bike" },
    { id: "sportscar", slot: "ride", name: "Sports car", price: 9000, desc: "Low, red and fast" },
    { id: "cityview", slot: "place", name: "City view", price: 1000, desc: "Skyline at dusk" },
    { id: "penthouse", slot: "place", name: "Penthouse", price: 6000, desc: "Marble floors, night skyline" },
    { id: "yacht", slot: "place", name: "Yacht", price: 12000, desc: "Open water, sun on deck" }
  ];
  var SMART_NAMES = ["Clueless", "Learning", "Sharp", "Brainy", "Genius", "Professor"];
  var SMART_STEPS = [0, 2, 5, 9, 14, 20]; // score needed per level
  var PASSED_DAY_WEIGHT = 3;               // a passed day counts like this many mastered skills
  var TRY_ON_MS = 2000;                    // how long a try-on preview shows
  var SLOTS = [
    ["place", "Place", "🏠"], ["ride", "Ride", "🚗"], ["outfit", "Outfit", "👕"],
    ["hat", "Hats", "🧢"], ["shades", "Shades", "😎"], ["chain", "Chains", "⛓️"],
    ["shoes", "Shoes", "👟"]
  ];
  var ICONS = {
    cap: "🧢", beanie: "🧶", crown: "👑", sunglasses: "🕶️", goldshades: "🕶️",
    hoodie: "🧥", dripjacket: "🧥", suit: "🤵", silverchain: "📿", goldchain: "📿",
    diamondchain: "💎", sneakers: "👟", designerkicks: "👟", bike: "🚲", sportscar: "🏎️",
    cityview: "🌆", penthouse: "🏙️", yacht: "🛥️"
  };
  var BY_ID = {};
  CATALOG.forEach(function (c) { BY_ID[c.id] = c; });

  function score(stats) {
    stats = stats || {};
    return (Number(stats.mastered) || 0) + PASSED_DAY_WEIGHT * (Number(stats.passedDays) || 0);
  }
  function smartLevel(stats) {
    var s = score(stats), lv = 0;
    for (var i = 0; i < SMART_STEPS.length; i++) if (SMART_STEPS[i] <= s) lv = i;
    return lv;
  }
  function netWorth(owned) {
    var t = 0;
    (owned || []).forEach(function (id) { if (BY_ID[id]) t += BY_ID[id].price; });
    return t;
  }

  /* ---------------------------------------------------------------- avatar */
  var uid = 0;

  function spark(x, y, s, c) {
    return '<path class="pf-spk" d="M' + x + " " + (y - s) + " Q" + x + " " + y + " " + (x + s) + " " + y +
      " Q" + x + " " + y + " " + x + " " + (y + s) + " Q" + x + " " + y + " " + (x - s) + " " + y +
      " Q" + x + " " + y + " " + x + " " + (y - s) + 'Z" fill="' + (c || "#fff6b0") + '"/>';
  }

  function placeSVG(p, id) {
    var o = [];
    if (p === "cityview") {
      o.push('<defs><linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1055"/><stop offset=".7" stop-color="#d4547a"/><stop offset="1" stop-color="#ffb36b"/></linearGradient></defs>');
      o.push('<rect width="300" height="300" fill="url(#' + id + 'sky)"/>');
      o.push('<circle cx="236" cy="150" r="18" fill="#ffd9a0" opacity=".85"/>');
      var b = [[0, 140, 40], [38, 100, 36], [72, 160, 44], [114, 120, 34], [146, 170, 40], [184, 110, 38], [220, 150, 40], [258, 125, 42]];
      b.forEach(function (r, i) {
        o.push('<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + (252 - r[1]) + '" fill="' + (i % 2 ? "#2a1f4a" : "#35285a") + '"/>');
        for (var y = r[1] + 8; y < 240; y += 16) for (var x = r[0] + 6; x < r[0] + r[2] - 8; x += 12)
          if ((x * 7 + y * 3 + i) % 5 > 1) o.push('<rect x="' + x + '" y="' + y + '" width="6" height="8" fill="#ffd36b"/>');
      });
      o.push('<rect y="250" width="300" height="50" fill="#3a3745"/><rect y="250" width="300" height="5" fill="#57536a"/>');
      o.push('<rect x="20" y="288" width="40" height="4" fill="#d9d4a8"/><rect x="120" y="288" width="40" height="4" fill="#d9d4a8"/><rect x="220" y="288" width="40" height="4" fill="#d9d4a8"/>');
    } else if (p === "penthouse") {
      o.push('<rect width="300" height="300" fill="#2b2230"/>');
      o.push('<rect x="12" y="20" width="276" height="220" rx="4" fill="#0d1030"/>');
      var tw = [[14, 150, 30], [48, 120, 26], [78, 170, 34], [116, 135, 28], [148, 180, 30], [182, 110, 34], [220, 160, 28], [252, 140, 34]];
      tw.forEach(function (r) {
        o.push('<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + (240 - r[1]) + '" fill="#1b2150"/>');
        for (var y = r[1] + 6; y < 232; y += 12) for (var x = r[0] + 4; x < r[0] + r[2] - 5; x += 8)
          if ((x * 5 + y) % 7 > 2) o.push('<rect x="' + x + '" y="' + y + '" width="3" height="4" fill="#ffe08a"/>');
      });
      o.push('<circle cx="250" cy="48" r="11" fill="#f4f1de"/><circle cx="255" cy="45" r="10" fill="#0d1030"/>');
      o.push('<rect x="12" y="20" width="276" height="220" rx="4" fill="none" stroke="#c9a227" stroke-width="3"/><line x1="104" y1="20" x2="104" y2="240" stroke="#c9a227" stroke-width="3"/><line x1="196" y1="20" x2="196" y2="240" stroke="#c9a227" stroke-width="3"/>');
      o.push('<rect y="244" width="300" height="56" fill="#ddd8cf"/><rect y="244" width="300" height="5" fill="#c9a227"/>');
      o.push('<path d="M0 262 L300 262 M60 249 L30 300 M150 249 L150 300 M240 249 L270 300" stroke="#bdb7ab" stroke-width="1.5" fill="none"/>');
      o.push('<rect x="2" y="200" width="46" height="38" rx="8" fill="#6b2d3c"/><rect x="2" y="188" width="46" height="18" rx="8" fill="#823a4b"/>');
      o.push(spark(272, 70, 8, "#fff6b0"));
    } else if (p === "yacht") {
      o.push('<defs><linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb3ff"/><stop offset="1" stop-color="#d9f1ff"/></linearGradient></defs>');
      o.push('<rect width="300" height="300" fill="url(#' + id + 'sky)"/>');
      o.push('<circle cx="236" cy="52" r="22" fill="#fff3a8"/><circle cx="236" cy="52" r="32" fill="#fff3a8" opacity=".3"/>');
      o.push('<rect y="150" width="300" height="100" fill="#1d79b8"/>');
      o.push('<path d="M0 150 Q40 140 80 150 T160 150 T240 150 T300 150 L300 160 L0 160Z" fill="#2a92d6"/>');
      o.push('<path d="M20 185 q10 -6 20 0 M110 205 q10 -6 20 0 M200 180 q10 -6 20 0 M240 220 q10 -6 20 0 M50 230 q10 -6 20 0" stroke="#7cc4f2" stroke-width="3" fill="none" stroke-linecap="round"/>');
      o.push('<path d="M14 150 Q40 118 70 150Z" fill="#3c7a4a"/>');
      o.push('<rect y="250" width="300" height="50" fill="#b98550"/>');
      for (var k = 262; k < 300; k += 12) o.push('<rect y="' + k + '" width="300" height="2" fill="#8c5f35"/>');
      o.push('<rect y="244" width="300" height="7" fill="#f3f3f3"/>');
      for (var x2 = 6; x2 < 300; x2 += 40) o.push('<rect x="' + x2 + '" y="206" width="5" height="40" fill="#f3f3f3"/>');
      o.push('<rect y="206" width="300" height="5" fill="#f3f3f3"/><rect y="222" width="300" height="3" fill="#dcdcdc"/>');
    } else { // bedroom
      o.push('<rect width="300" height="300" fill="#4a5578"/>');
      o.push('<rect y="0" width="300" height="12" fill="#3d4766"/>');
      o.push('<rect x="14" y="64" width="64" height="74" rx="3" fill="#2a3150"/><rect x="19" y="69" width="54" height="64" fill="#8ec9ff"/>');
      o.push('<line x1="46" y1="69" x2="46" y2="133" stroke="#e9f2ff" stroke-width="3"/><line x1="19" y1="101" x2="73" y2="101" stroke="#e9f2ff" stroke-width="3"/>');
      o.push('<circle cx="60" cy="82" r="6" fill="#fff6c4"/>');
      o.push('<rect x="214" y="104" width="52" height="64" rx="3" fill="#f0e6d2"/><rect x="220" y="110" width="40" height="34" fill="#7F77DD"/>');
      o.push('<path d="M224 140 L238 122 L246 132 L252 124 L258 140Z" fill="#1D9E75"/><rect x="222" y="150" width="36" height="3" fill="#b5ad98"/><rect x="222" y="157" width="24" height="3" fill="#b5ad98"/>');
      o.push('<rect y="250" width="300" height="50" fill="#363c58"/><rect y="250" width="300" height="4" fill="#2b3048"/>');
      o.push('<ellipse cx="60" cy="278" rx="48" ry="9" fill="#7F77DD" opacity=".55"/>');
    }
    return o.join("");
  }

  function rideSVG(r) {
    var o = [];
    if (r === "bike") {
      o.push('<ellipse cx="238" cy="281" rx="52" ry="5" fill="#000" opacity=".25"/>');
      o.push('<g fill="none" stroke="#161616" stroke-width="4">');
      o.push('<circle cx="198" cy="258" r="21"/><circle cx="268" cy="258" r="21"/></g>');
      o.push('<g stroke="#8d8d8d" stroke-width="1">');
      [0, 45, 90, 135].forEach(function (a) {
        var dx = Math.round(Math.cos(a * Math.PI / 180) * 20), dy = Math.round(Math.sin(a * Math.PI / 180) * 20);
        o.push('<line x1="' + (198 - dx) + '" y1="' + (258 - dy) + '" x2="' + (198 + dx) + '" y2="' + (258 + dy) + '"/>');
        o.push('<line x1="' + (268 - dx) + '" y1="' + (258 - dy) + '" x2="' + (268 + dx) + '" y2="' + (258 + dy) + '"/>');
      });
      o.push('</g>');
      o.push('<g fill="none" stroke="#e63946" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">');
      o.push('<path d="M198 258 L222 232 L256 232 L268 258 M222 232 L236 258 L198 258 M256 232 L250 214"/></g>');
      o.push('<path d="M243 214 L262 214" stroke="#222" stroke-width="5" stroke-linecap="round"/>');
      o.push('<path d="M212 224 L230 224" stroke="#222" stroke-width="6" stroke-linecap="round"/>');
      o.push('<circle cx="236" cy="258" r="5" fill="#f1c40f"/><circle cx="198" cy="258" r="3" fill="#ccc"/><circle cx="268" cy="258" r="3" fill="#ccc"/>');
    } else { // sportscar
      o.push('<ellipse cx="232" cy="282" rx="66" ry="5" fill="#000" opacity=".3"/>');
      o.push('<path d="M166 266 L166 250 Q170 240 194 238 L214 224 Q236 214 262 224 L282 240 Q297 242 297 254 L297 266Z" fill="#e5252a"/>');
      o.push('<path d="M166 256 L297 256" stroke="#b01419" stroke-width="2"/>');
      o.push('<path d="M216 238 L228 227 Q244 222 258 227 L270 238Z" fill="#bfe6ff"/><path d="M243 226 L243 238" stroke="#e5252a" stroke-width="3"/>');
      o.push('<path d="M222 236 L230 229 L236 229 L230 236Z" fill="#fff" opacity=".55"/>');
      o.push('<rect x="288" y="246" width="9" height="6" rx="2" fill="#ffe66d"/><rect x="166" y="248" width="6" height="5" rx="2" fill="#ff8a8a"/>');
      o.push('<rect x="168" y="236" width="22" height="4" rx="2" fill="#a51217"/>');
      o.push('<circle cx="194" cy="268" r="15" fill="#151515"/><circle cx="194" cy="268" r="8" fill="#d8d8d8"/><circle cx="194" cy="268" r="3" fill="#555"/>');
      o.push('<circle cx="268" cy="268" r="15" fill="#151515"/><circle cx="268" cy="268" r="8" fill="#d8d8d8"/><circle cx="268" cy="268" r="3" fill="#555"/>');
      o.push(spark(284, 232, 7, "#ffffff"));
      o.push('<rect x="226" y="256" width="26" height="4" rx="2" fill="#ffc400"/>');
    }
    return o.join("");
  }

  function shoeSVG(s) {
    var c = { body: "#6d4c41", sole: "#3e2723" }, extra = "";
    if (s === "sneakers") { c = { body: "#fafafa", sole: "#d5d5d5" }; extra = '<path d="M76 270 L96 270 M118 270 L132 270" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/><path d="M84 264 L90 268 M86 262 L92 266 M110 264 L116 268 M112 262 L118 266" stroke="#999" stroke-width="1.4"/>'; }
    if (s === "designerkicks") { c = { body: "#15151a", sole: "#ffd54f" }; extra = '<path d="M74 272 Q88 262 100 270 M116 270 Q128 262 136 272" stroke="#ffd54f" stroke-width="3" fill="none" stroke-linecap="round"/>' + spark(72, 262, 6) + spark(134, 262, 7); }
    return '<ellipse cx="86" cy="271" rx="17" ry="9" fill="' + c.body + '"/><ellipse cx="114" cy="271" rx="17" ry="9" fill="' + c.body + '"/>' +
      '<rect x="69" y="276" width="34" height="5" rx="2.5" fill="' + c.sole + '"/><rect x="97" y="276" width="34" height="5" rx="2.5" fill="' + c.sole + '"/>' + extra;
  }

  function avatarSVG(o) {
    o = o || {};
    var smart = Math.max(0, Math.min(5, Math.floor(Number(o.smart)) || 0));
    var eq = o.equipped || {};
    var size = Number(o.size) > 0 ? Math.round(Number(o.size)) : 220;
    var crop = o.crop === "head";
    var id = "pf" + (++uid) + "-";
    var skin = "#f1c27d", skinD = "#d9a55f", hair = "#3b2a20";
    var outfit = eq.outfit, hat = eq.hat, shades = eq.shades, chain = eq.chain;
    var pants = outfit === "suit" ? "#23252d" : "#3d5a99";
    var s = [];
    s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (crop ? "66 34 88 88" : "0 0 300 300") + '" width="' + size + '" height="' + size + '" role="img" aria-label="Your guy, ' + SMART_NAMES[smart] + '">');
    s.push('<g class="pf-L-place">' + placeSVG(eq.place, id) + "</g>");
    if (eq.ride === "bike" || eq.ride === "sportscar") s.push('<g class="pf-L-ride">' + rideSVG(eq.ride) + "</g>");
    s.push('<g transform="translate(10,0)">');
    s.push('<ellipse cx="100" cy="281" rx="42" ry="6" fill="#000" opacity=".28"/>');
    // legs
    s.push('<g class="pf-L-legs"><rect x="82" y="192" width="17" height="80" rx="7" fill="' + pants + '"/><rect x="101" y="192" width="17" height="80" rx="7" fill="' + pants + '"/><line x1="100" y1="205" x2="100" y2="262" stroke="#000" stroke-opacity=".25" stroke-width="1.5"/></g>');
    s.push('<g class="pf-L-shoes">' + shoeSVG(eq.shoes) + "</g>");
    // neck + hood behind
    if (outfit === "hoodie") s.push('<ellipse cx="100" cy="118" rx="29" ry="14" fill="#6b7280"/>');
    s.push('<rect x="91" y="98" width="18" height="24" fill="' + skinD + '"/>');
    // arms
    var longSleeve = outfit === "hoodie" || outfit === "dripjacket" || outfit === "suit";
    var sleeve = outfit === "hoodie" ? "#8a919e" : outfit === "dripjacket" ? "#ff7b00" : outfit === "suit" ? "#2b2f3a" : "#3b9ae1";
    s.push('<g class="pf-L-arms" stroke-linecap="round" fill="none">');
    s.push('<path d="M72 132 L62 190" stroke="' + skin + '" stroke-width="13"/><path d="M128 132 L138 190" stroke="' + skin + '" stroke-width="13"/>');
    if (longSleeve) s.push('<path d="M72 132 L63 182" stroke="' + sleeve + '" stroke-width="17"/><path d="M128 132 L137 182" stroke="' + sleeve + '" stroke-width="17"/>');
    else s.push('<path d="M72 130 L67 154" stroke="' + sleeve + '" stroke-width="17"/><path d="M128 130 L133 154" stroke="' + sleeve + '" stroke-width="17"/>');
    s.push("</g>");
    // torso + outfit
    s.push('<g class="pf-L-outfit">');
    if (outfit === "hoodie") {
      s.push('<path d="M70 130 Q70 118 84 117 L116 117 Q130 118 130 130 L128 205 L72 205Z" fill="#8a919e"/>');
      s.push('<path d="M82 117 Q100 134 118 117 L112 112 Q100 122 88 112Z" fill="#6b7280"/>');
      s.push('<path d="M92 124 L90 150 M108 124 L110 150" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>');
      s.push('<path d="M82 170 L118 170 L124 200 L76 200Z" fill="#737a88"/>');
    } else if (outfit === "dripjacket") {
      s.push('<path d="M68 132 Q68 118 84 117 L116 117 Q132 118 132 132 L130 207 L70 207Z" fill="#ff7b00"/>');
      [140, 158, 176, 194].forEach(function (y) { s.push('<path d="M70 ' + y + ' Q100 ' + (y + 5) + ' 130 ' + y + '" stroke="#b34f00" stroke-width="2" fill="none"/>'); });
      s.push('<line x1="100" y1="122" x2="100" y2="207" stroke="#ffd54f" stroke-width="3"/>');
      s.push('<ellipse cx="100" cy="119" rx="26" ry="9" fill="#f5f0e6"/><ellipse cx="100" cy="117" rx="18" ry="5" fill="#d9d2c0"/>');
      s.push(spark(122, 150, 5));
    } else if (outfit === "suit") {
      s.push('<path d="M70 130 Q70 118 84 117 L116 117 Q130 118 130 130 L128 207 L72 207Z" fill="#2b2f3a"/>');
      s.push('<path d="M88 117 L100 152 L112 117Z" fill="#f4f4f4"/>');
      s.push('<path d="M88 117 L100 152 L80 170 L78 125Z" fill="#1f2230"/><path d="M112 117 L100 152 L120 170 L122 125Z" fill="#1f2230"/>');
      s.push('<path d="M95 121 L105 121 L108 128 L100 134 L92 128Z" fill="#c1272d"/><path d="M96 132 L104 132 L108 176 L100 184 L92 176Z" fill="#d7323a"/>');
      s.push('<circle cx="100" cy="196" r="2.5" fill="#c9a227"/><rect x="108" y="150" width="12" height="3" fill="#fff"/>');
    } else {
      s.push('<path d="M70 130 Q70 118 84 117 L116 117 Q130 118 130 130 L128 205 L72 205Z" fill="#3b9ae1"/>');
      s.push('<path d="M86 117 Q100 130 114 117 L110 115 Q100 124 90 115Z" fill="#2c7bb8"/>');
      s.push('<text x="100" y="168" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="22" fill="#fff" fill-opacity=".9">√</text>');
    }
    s.push("</g>");
    // chain
    if (chain) {
      var cc = chain === "silverchain" ? "#d3dae0" : chain === "goldchain" ? "#f5c518" : "#e7f7ff";
      var cw = chain === "silverchain" ? 3 : 4.5;
      s.push('<g class="pf-L-chain"><path d="M84 121 Q100 156 116 121" fill="none" stroke="' + cc + '" stroke-width="' + cw + '" stroke-linecap="round"' + (chain === "diamondchain" ? ' stroke-dasharray="5 2"' : "") + "/>");
      if (chain === "diamondchain") {
        s.push('<path d="M84 121 Q100 156 116 121" fill="none" stroke="#9fd8ff" stroke-width="2" stroke-linecap="round"/>');
        s.push('<path d="M100 146 L108 154 L100 168 L92 154Z" fill="#b9ecff" stroke="#5bb8e6" stroke-width="1.5"/><path d="M92 154 L108 154 M100 146 L100 168" stroke="#fff" stroke-width="1"/>');
        s.push(spark(112, 150, 7, "#ffffff") + spark(88, 164, 5, "#ffffff"));
      } else if (chain === "goldchain") {
        s.push('<circle cx="100" cy="146" r="5" fill="#ffd54f" stroke="#b8860b" stroke-width="1.5"/>' + spark(110, 142, 5));
      } else {
        s.push('<circle cx="100" cy="144" r="3.5" fill="#eef2f5" stroke="#9aa5ad" stroke-width="1"/>');
      }
      s.push("</g>");
    }
    // book under left arm
    if (smart >= 3) {
      s.push('<g class="pf-L-book" transform="rotate(-8 58 178)"><rect x="46" y="160" width="24" height="34" rx="2" fill="#2e7d32"/><rect x="46" y="160" width="5" height="34" fill="#1b5e20"/><rect x="52" y="166" width="14" height="3" fill="#ffd54f"/><rect x="52" y="172" width="10" height="2" fill="#ffd54f" opacity=".7"/><rect x="48" y="192" width="22" height="3" fill="#f4f1e8"/></g>');
    }
    // hands
    s.push('<circle cx="63" cy="190" r="7.5" fill="' + skin + '"/><circle cx="137" cy="190" r="7.5" fill="' + skin + '"/>');
    // head
    s.push('<g class="pf-L-head"><circle cx="66" cy="84" r="6" fill="' + skinD + '"/><circle cx="134" cy="84" r="6" fill="' + skinD + '"/>');
    s.push('<circle cx="100" cy="82" r="34" fill="' + skin + '"/>');
    s.push('<path d="M65 80 Q60 40 100 42 Q140 40 135 80 Q130 60 112 57 Q100 66 86 58 Q70 62 65 80Z" fill="' + hair + '"/>');
    // eyes
    var px = smart === 0 ? 2 : 0, py = smart === 0 ? -2 : 1;
    s.push('<ellipse cx="88" cy="85" rx="6" ry="7" fill="#fff"/><ellipse cx="112" cy="85" rx="6" ry="7" fill="#fff"/>');
    s.push('<circle cx="' + (88 + px) + '" cy="' + (85 + py) + '" r="3.2" fill="#1d1d1b"/><circle cx="' + (112 + px) + '" cy="' + (85 + py) + '" r="3.2" fill="#1d1d1b"/>');
    s.push('<circle cx="' + (89 + px) + '" cy="' + (83 + py) + '" r="1" fill="#fff"/><circle cx="' + (113 + px) + '" cy="' + (83 + py) + '" r="1" fill="#fff"/>');
    // brows
    if (smart === 0) s.push('<path d="M80 73 L96 76 M104 72 L120 66" stroke="' + hair + '" stroke-width="3" stroke-linecap="round" fill="none"/>');
    else s.push('<path d="M80 74 Q88 70 96 74 M104 74 Q112 70 120 74" stroke="' + hair + '" stroke-width="3" stroke-linecap="round" fill="none"/>');
    s.push('<path d="M99 90 Q101 96 97 97" stroke="' + skinD + '" stroke-width="2" fill="none" stroke-linecap="round"/>');
    // mouth
    if (smart === 0) s.push('<path d="M91 105 Q96 100 100 104 Q105 108 110 102" stroke="#7a3b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M125 70 Q128 76 125 78 Q122 76 125 70Z" fill="#6ec6ff"/>');
    else if (smart <= 2) s.push('<path d="M91 100 Q100 108 109 100" stroke="#7a3b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>');
    else if (smart <= 4) s.push('<path d="M89 99 Q100 113 111 99" stroke="#7a3b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>');
    else s.push('<path d="M88 98 Q100 116 112 98Z" fill="#7a1f2b"/><path d="M91 99 L109 99 L107 103 L93 103Z" fill="#fff"/>');
    if (smart >= 3) s.push('<circle cx="80" cy="97" r="4" fill="#ff8a80" opacity=".45"/><circle cx="120" cy="97" r="4" fill="#ff8a80" opacity=".45"/>');
    // glasses / shades
    if (shades === "sunglasses") {
      s.push('<g class="pf-L-shades"><rect x="75" y="76" width="22" height="16" rx="6" fill="#111"/><rect x="103" y="76" width="22" height="16" rx="6" fill="#111"/><path d="M97 82 L103 82 M75 80 L66 78 M125 80 L134 78" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M79 79 L85 79 M107 79 L113 79" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/></g>');
    } else if (shades === "goldshades") {
      s.push('<defs><linearGradient id="' + id + 'gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd54a"/><stop offset="1" stop-color="#a86b00"/></linearGradient></defs>');
      s.push('<g class="pf-L-shades"><rect x="75" y="76" width="22" height="16" rx="6" fill="url(#' + id + 'gl)" stroke="#f5c518" stroke-width="3"/><rect x="103" y="76" width="22" height="16" rx="6" fill="url(#' + id + 'gl)" stroke="#f5c518" stroke-width="3"/><path d="M97 82 L103 82 M75 80 L66 78 M125 80 L134 78" stroke="#f5c518" stroke-width="3" stroke-linecap="round"/><path d="M79 80 L85 80 M107 80 L113 80" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>' + spark(128, 74, 7) + "</g>");
    } else if (smart >= 2) {
      s.push('<g class="pf-L-glasses"><circle cx="88" cy="85" r="10" fill="#cfe9ff" fill-opacity=".3" stroke="#222" stroke-width="2.5"/><circle cx="112" cy="85" r="10" fill="#cfe9ff" fill-opacity=".3" stroke="#222" stroke-width="2.5"/><path d="M98 84 L102 84 M78 83 L68 80 M122 83 L132 80" stroke="#222" stroke-width="2.5" stroke-linecap="round"/><path d="M82 80 L86 78" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>');
    }
    s.push("</g>");
    // hats
    if (hat === "cap") {
      s.push('<g class="pf-L-hat"><path d="M64 64 Q64 34 100 34 Q136 34 136 64Z" fill="#e63946"/><path d="M58 63 Q100 82 142 63 Q100 70 58 63Z" fill="#a8212d"/><circle cx="100" cy="34" r="4" fill="#a8212d"/><path d="M100 36 L100 62" stroke="#a8212d" stroke-width="2"/></g>');
    } else if (hat === "beanie") {
      s.push('<g class="pf-L-hat"><path d="M64 66 Q62 30 100 28 Q138 30 136 66Z" fill="#2a9d8f"/><rect x="62" y="56" width="76" height="15" rx="7" fill="#1f7a70"/><path d="M72 58 L72 69 M84 58 L84 69 M96 58 L96 69 M108 58 L108 69 M120 58 L120 69 M130 58 L130 69" stroke="#2a9d8f" stroke-width="2"/><circle cx="100" cy="24" r="9" fill="#f1faee"/><circle cx="96" cy="21" r="2" fill="#d6e4dc"/><circle cx="104" cy="26" r="2" fill="#d6e4dc"/></g>');
    } else if (hat === "crown") {
      s.push('<g class="pf-L-hat"><path d="M68 52 L68 22 L85 38 L100 14 L115 38 L132 22 L132 52Z" fill="#ffc400" stroke="#b8860b" stroke-width="2.5" stroke-linejoin="round"/><rect x="68" y="44" width="64" height="9" rx="2" fill="#e6a800" stroke="#b8860b" stroke-width="2"/><circle cx="100" cy="30" r="4.5" fill="#e63946"/><circle cx="82" cy="48" r="3" fill="#4fc3f7"/><circle cx="100" cy="48" r="3" fill="#e63946"/><circle cx="118" cy="48" r="3" fill="#66bb6a"/><circle cx="68" cy="20" r="3" fill="#fff6b0"/><circle cx="132" cy="20" r="3" fill="#fff6b0"/><circle cx="100" cy="12" r="3" fill="#fff6b0"/>' + spark(112, 24, 8) + spark(86, 30, 5) + "</g>");
    } else if (smart >= 5) {
      s.push('<g class="pf-L-grad"><path d="M78 48 L78 62 Q100 72 122 62 L122 48Z" fill="#26262b"/><polygon points="58,44 100,28 142,44 100,58" fill="#1b1b1f" stroke="#444" stroke-width="1.5"/><circle cx="100" cy="43" r="3" fill="#ffc400"/><path d="M100 43 L136 47 L136 66" stroke="#ffc400" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M133 64 L139 64 L141 76 L131 76Z" fill="#ffc400"/></g>');
    }
    // pencil behind ear
    if (smart >= 1) {
      s.push('<g class="pf-L-pencil" transform="rotate(24 134 80)"><rect x="131" y="58" width="6" height="26" fill="#fbc02d"/><rect x="131" y="54" width="6" height="5" fill="#f48fb1"/><rect x="131" y="52" width="6" height="3" fill="#b0bec5"/><polygon points="131,84 137,84 134,92" fill="#f1d3a1"/><polygon points="133,89 135,89 134,92" fill="#333"/></g>');
    }
    s.push("</g>"); // translate group
    // thought bubble
    if (smart >= 4) {
      s.push('<g class="pf-L-bubble"><circle cx="172" cy="84" r="5" fill="#fff" stroke="#cfd8e3" stroke-width="1.5"/><circle cx="182" cy="70" r="7" fill="#fff" stroke="#cfd8e3" stroke-width="1.5"/>');
      s.push('<ellipse cx="236" cy="38" rx="54" ry="30" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>');
      s.push('<text x="208" y="52" font-family="Georgia,serif" font-style="italic" font-weight="700" font-size="34" fill="#2b2f3a">a</text>');
      s.push('<text x="230" y="34" font-family="Arial,sans-serif" font-weight="700" font-size="17" fill="#7F77DD">m/n</text></g>');
    }
    s.push("</svg>");
    return s.join("");
  }

  /* ----------------------------------------------------------------- mount */
  var CSS = [
    ".pf-wrap{width:100%;max-width:100%;padding:2px 0 28px;color:var(--ink,#1d1d1b);overflow-x:hidden}",
    ".pf-stage{display:flex;justify-content:center;margin:6px 0 12px}",
    ".pf-av{width:260px;max-width:100%;aspect-ratio:1;border-radius:22px;overflow:hidden;border:1px solid var(--line,#33332f);background:var(--card,#1f1f1d)}",
    ".pf-av svg{display:block;width:100%;height:100%}",
    ".pf-pop{animation:pf-pop .45s ease}",
    "@keyframes pf-pop{0%{transform:scale(1)}40%{transform:scale(1.07)}100%{transform:scale(1)}}",
    ".pf-spk{transform-box:fill-box;transform-origin:center;animation:pf-tw 1.8s ease-in-out infinite}",
    "@keyframes pf-tw{50%{opacity:.35;transform:scale(.6)}}",
    ".pf-name{text-align:center;font-size:26px;font-weight:700;letter-spacing:-.5px}",
    ".pf-name small{display:block;font-size:12px;font-weight:500;color:var(--mute,#a3a199);letter-spacing:0;text-transform:lowercase}",
    ".pf-meter{height:10px;border-radius:5px;background:var(--line,#33332f);margin:10px 4px 6px;overflow:hidden}",
    ".pf-meter i{display:block;height:100%;background:var(--root,#7F77DD);border-radius:5px;transition:width .6s ease}",
    ".pf-next{text-align:center;font-size:14px;color:var(--mute,#a3a199);min-height:20px}",
    ".pf-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0 6px}",
    ".pf-stat{background:var(--card,#1f1f1d);border:1px solid var(--line,#33332f);border-radius:12px;padding:10px 12px;min-width:0}",
    ".pf-stat small{display:block;font-size:11px;color:var(--mute,#a3a199);text-transform:lowercase}",
    ".pf-stat b{font-size:20px;font-family:\"JetBrains Mono\",ui-monospace,monospace;word-break:break-all}",
    ".pf-msg{min-height:24px;text-align:center;font-size:14px;font-weight:700;margin:6px 0}",
    ".pf-msg.bad{color:var(--bad,#F09595);animation:pf-shake .35s ease}",
    ".pf-msg.good{color:var(--good,#97C459)}",
    "@keyframes pf-shake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}",
    ".pf-h{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;margin:18px 2px 8px}",
    ".pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
    ".pf-card{display:flex;flex-direction:column;gap:4px;background:var(--card,#1f1f1d);border:1px solid var(--line,#33332f);border-radius:14px;padding:10px;min-width:0;cursor:pointer;transition:border-color .2s,transform .2s}",
    ".pf-card.own{cursor:default}",
    ".pf-card.on{border-color:var(--good,#97C459);box-shadow:0 0 0 1px var(--good,#97C459)}",
    ".pf-card.try{border-color:var(--root,#7F77DD);box-shadow:0 0 0 2px var(--root,#7F77DD)}",
    ".pf-ico{font-size:30px;line-height:1.1}",
    ".pf-iname{font-size:15px;font-weight:700}",
    ".pf-desc{font-size:12px;color:var(--mute,#a3a199);line-height:1.3;flex:1}",
    ".pf-price{font-size:13px;font-family:\"JetBrains Mono\",ui-monospace,monospace}",
    ".pf-btn{width:100%;min-height:44px;margin-top:4px;padding:8px;font-size:15px;font-weight:700;border-radius:10px;border:1px solid var(--root,#7F77DD);color:var(--root,#7F77DD);background:transparent;cursor:pointer}",
    ".pf-btn.buy{background:var(--hot,#D85A30);border-color:var(--hot,#D85A30);color:#fff}",
    ".pf-btn.poor{background:transparent;border-color:var(--line,#33332f);color:var(--mute,#a3a199)}",
    ".pf-btn.off{border-color:var(--good,#97C459);color:var(--good,#97C459)}",
    "@media (prefers-reduced-motion:reduce){.pf-pop,.pf-spk,.pf-msg.bad{animation:none}.pf-meter i,.pf-card{transition:none}}"
  ].join("\n");

  function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  function mount(el, api) {
    if (typeof document === "undefined" || !el) return;
    if (!document.getElementById("pf-style")) {
      var st = document.createElement("style");
      st.id = "pf-style";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var preview = null, timer = null, msg = null, pop = false;

    function render() {
      var stats = api.stats() || {};
      var lv = smartLevel(stats), sc = score(stats);
      var owned = api.owned() || [], eq = api.equipped() || {}, coins = api.coins();
      var shown = {}, k;
      for (k in eq) if (eq[k]) shown[k] = eq[k];
      if (preview) shown[preview.slot] = preview.id;
      var h = [];
      h.push('<div class="pf-wrap">');
      h.push('<div class="pf-stage"><div class="pf-av' + (pop ? " pf-pop" : "") + '">' + avatarSVG({ smart: lv, equipped: shown, size: 260 }) + "</div></div>");
      pop = false;
      h.push('<div class="pf-name">' + SMART_NAMES[lv] + "<small>smart level " + lv + " of 5</small></div>");
      var pct = 100, nextTxt = "Top level reached. You are a Professor.";
      if (lv < 5) {
        var lo = SMART_STEPS[lv], hi = SMART_STEPS[lv + 1];
        pct = Math.round(100 * (sc - lo) / (hi - lo));
        nextTxt = "Master skills to level up: " + (hi - sc) + " more";
      }
      h.push('<div class="pf-meter"><i style="width:' + pct + '%"></i></div><div class="pf-next">' + nextTxt + "</div>");
      h.push('<div class="pf-stats"><div class="pf-stat"><small>net worth</small><b>' + fmt(netWorth(owned)) + ' 🪙</b></div><div class="pf-stat"><small>coins now</small><b>' + fmt(coins) + ' 🪙</b></div></div>');
      h.push('<div class="pf-msg' + (msg ? " " + msg.kind : "") + '">' + (msg ? msg.text : (preview ? "Trying it on... buy it to keep it." : "Tap an item to try it on.")) + "</div>");
      SLOTS.forEach(function (sl) {
        h.push('<div class="pf-h"><span>' + sl[2] + "</span>" + sl[1] + '</div><div class="pf-grid">');
        CATALOG.filter(function (c) { return c.slot === sl[0]; }).forEach(function (c) {
          var has = owned.indexOf(c.id) >= 0, wearing = eq[c.slot] === c.id;
          var cls = "pf-card" + (has ? " own" : "") + (wearing ? " on" : "") + (preview && preview.id === c.id ? " try" : "");
          h.push('<div class="' + cls + '"' + (has ? "" : ' data-act="try" data-id="' + c.id + '"') + ">");
          h.push('<div class="pf-ico">' + ICONS[c.id] + '</div><div class="pf-iname">' + c.name + '</div><div class="pf-desc">' + c.desc + "</div>");
          h.push('<div class="pf-price">' + fmt(c.price) + " 🪙</div>");
          if (!has) h.push('<button class="pf-btn ' + (coins >= c.price ? "buy" : "poor") + '" data-act="buy" data-id="' + c.id + '">Buy</button>');
          else if (wearing) h.push('<button class="pf-btn off" data-act="unequip" data-id="' + c.id + '">Unequip</button>');
          else h.push('<button class="pf-btn" data-act="equip" data-id="' + c.id + '">Equip</button>');
          h.push("</div>");
        });
        h.push("</div>");
      });
      h.push("</div>");
      el.innerHTML = h.join("");
      msg = null;
    }

    function snd(kind) { try { if (api.sound) api.sound(kind); } catch (e) { /* ignore */ } }

    el.onclick = function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      if (!t || !el.contains(t)) return;
      var item = BY_ID[t.getAttribute("data-id")];
      if (!item) return; // never pass an unknown id to the api
      var act = t.getAttribute("data-act");
      if (timer) { clearTimeout(timer); timer = null; }
      if (act === "try") {
        preview = { slot: item.slot, id: item.id };
        snd("click");
        render();
        timer = setTimeout(function () {
          timer = null; preview = null;
          if (el.isConnected) render();
        }, TRY_ON_MS);
        return;
      }
      preview = null;
      if (act === "buy") {
        if (api.buyItem(item.id)) {
          api.equip(item.slot, item.id);
          snd("buy");
          msg = { kind: "good", text: "Bought " + item.name + "! Now wearing it." };
          pop = true;
        } else {
          var need = Math.max(0, item.price - (Number(api.coins()) || 0));
          snd("lose");
          msg = { kind: "bad", text: "Not enough coins: " + fmt(need) + " more to go." };
        }
      } else if (act === "equip") {
        api.equip(item.slot, item.id);
        snd("click");
        pop = true;
      } else if (act === "unequip") {
        api.equip(item.slot, null);
        snd("click");
      }
      render();
    };
    render();
  }

  globalThis.RRProfile = {
    CATALOG: CATALOG,
    SMART_NAMES: SMART_NAMES,
    SMART_STEPS: SMART_STEPS,
    smartLevel: smartLevel,
    netWorth: netWorth,
    avatarSVG: avatarSVG,
    mount: mount
  };
})();
