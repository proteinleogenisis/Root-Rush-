/* Root Rush profile: the guy and the cosmetics shop.
   Plain script: sets globalThis.RRProfile. Touches document only inside mount(). */
(function () {
  "use strict";

  var CATALOG = [
    { id: "cap", slot: "hat", name: "Cap", price: 300, desc: "A red cap, worn straight" },
    { id: "beanie", slot: "hat", name: "Beanie", price: 400, desc: "Warm knit beanie with a pom-pom" },
    { id: "headphones", slot: "hat", name: "Headphones", price: 700, desc: "Big red cans. Music on." },
    { id: "crown", slot: "hat", name: "Crown", price: 5000, desc: "Solid gold. Obviously." },
    { id: "nerdglasses", slot: "shades", name: "Nerd glasses", price: 150, desc: "Round frames. Smart look." },
    { id: "sunglasses", slot: "shades", name: "Sunglasses", price: 350, desc: "Dark lenses, no squinting" },
    { id: "goldshades", slot: "shades", name: "Gold shades", price: 1500, desc: "Gold frames, amber lenses" },
    { id: "cleantee", slot: "outfit", name: "Clean tee", price: 100, desc: "A fresh tee. No holes." },
    { id: "hoodie", slot: "outfit", name: "Hoodie", price: 500, desc: "Soft grey hoodie" },
    { id: "varsity", slot: "outfit", name: "Varsity jacket", price: 900, desc: "Red and white, letter on the chest" },
    { id: "dripjacket", slot: "outfit", name: "Drip jacket", price: 1200, desc: "Orange puffer with a fur collar" },
    { id: "suit", slot: "outfit", name: "Suit", price: 2500, desc: "Sharp suit and a red tie" },
    { id: "dogtag", slot: "chain", name: "Dog tag", price: 200, desc: "A simple tag on a thin chain" },
    { id: "silverchain", slot: "chain", name: "Silver chain", price: 800, desc: "Clean silver chain" },
    { id: "goldchain", slot: "chain", name: "Gold chain", price: 3000, desc: "Heavy gold chain" },
    { id: "diamondchain", slot: "chain", name: "Diamond chain", price: 8000, desc: "Icy diamond pendant" },
    { id: "slides", slot: "shoes", name: "Slides", price: 120, desc: "Slides with white socks" },
    { id: "sneakers", slot: "shoes", name: "Sneakers", price: 400, desc: "Fresh white sneakers" },
    { id: "designerkicks", slot: "shoes", name: "Designer kicks", price: 2000, desc: "Black and gold, limited drop" },
    { id: "skateboard", slot: "ride", name: "Skateboard", price: 250, desc: "Purple deck, yellow wheels" },
    { id: "bike", slot: "ride", name: "Bike", price: 700, desc: "A red road bike" },
    { id: "sportscar", slot: "ride", name: "Sports car", price: 9000, desc: "Low, red and fast" },
    { id: "room", slot: "place", name: "Small room", price: 150, desc: "A tiny room. Off the street." },
    { id: "cityview", slot: "place", name: "City view", price: 1000, desc: "Skyline at dusk" },
    { id: "penthouse", slot: "place", name: "Penthouse", price: 6000, desc: "Marble floors, night skyline" },
    { id: "yacht", slot: "place", name: "Yacht", price: 12000, desc: "Open water, sun on deck" },
    { id: "mansion", slot: "place", name: "Mansion", price: 20000, desc: "Columns, a lawn and a pool" },
    { id: "cat", slot: "pet", name: "Cat", price: 400, desc: "Orange, judges you quietly" },
    { id: "dog", slot: "pet", name: "Dog", price: 600, desc: "Good boy, always happy" },
    { id: "tiger", slot: "pet", name: "Tiger", price: 15000, desc: "The ultimate flex" }
  ];
  // Life stages (Nov 16): the shop is now one ladder, homeless to owning islands. Each stage is a whole new look
  // (place, clothes, ride, pet). You buy the next stage in order; nothing is bought separately any more.
  var STAGES = [
    { name: "Homeless", line: "Sleeping on the road", price: 0, look: {} },
    { name: "Broke", line: "A tiny room, finally off the street", price: 300, look: { place: "room", outfit: "cleantee", shoes: "slides" } },
    { name: "Poor", line: "A warm hoodie and a skateboard", price: 1000, look: { place: "room", outfit: "hoodie", shoes: "sneakers", hat: "beanie", chain: "dogtag", ride: "skateboard" } },
    { name: "Getting by", line: "A city apartment, a bike and a cat", price: 2500, look: { place: "cityview", outfit: "varsity", shoes: "sneakers", hat: "cap", shades: "nerdglasses", ride: "bike", pet: "cat" } },
    { name: "Middle class", line: "A nice jacket, a dog, a view", price: 5000, look: { place: "cityview", outfit: "dripjacket", shoes: "sneakers", hat: "headphones", shades: "sunglasses", chain: "silverchain", ride: "bike", pet: "dog" } },
    { name: "Well-off", line: "Penthouse living, suit and tie", price: 10000, look: { place: "penthouse", outfit: "suit", shoes: "designerkicks", shades: "sunglasses", chain: "silverchain", pet: "dog" } },
    { name: "Rich", line: "Gold everything and a sports car", price: 20000, look: { place: "penthouse", outfit: "suit", shoes: "designerkicks", shades: "goldshades", chain: "goldchain", ride: "sportscar", pet: "dog" } },
    { name: "Millionaire", line: "Life on a yacht with a pet tiger", price: 40000, look: { place: "yacht", outfit: "suit", shoes: "designerkicks", shades: "goldshades", chain: "goldchain", pet: "tiger" } },
    { name: "Multi-millionaire", line: "A mansion with a pool", price: 75000, look: { place: "mansion", outfit: "suit", shoes: "designerkicks", shades: "goldshades", chain: "diamondchain", ride: "sportscar", pet: "tiger" } },
    { name: "Billionaire", line: "Your own private jet and a crown", price: 125000, look: { place: "jet", outfit: "suit", shoes: "designerkicks", hat: "crown", shades: "goldshades", chain: "diamondchain", pet: "tiger" } },
    { name: "Filthy rich", line: "You own islands", price: 200000, look: { place: "island", outfit: "suit", shoes: "designerkicks", hat: "crown", shades: "goldshades", chain: "diamondchain", pet: "tiger" } }
  ];
  var EXTRA_NAMES = { jet: "Private jet", island: "Private island" };
  // total coins to reach stage n from homeless
  function stageCost(n) { var c = 0; for (var i = 1; i <= n && i < STAGES.length; i++) c += STAGES[i].price; return c; }
  // turn coins already spent on old shop items into a stage, plus coins handed back for the part that doesn't fill a stage
  function stageFromSpent(v) {
    v = Math.max(0, Math.floor(+v || 0));
    var n = 0; while (n + 1 < STAGES.length && stageCost(n + 1) <= v) n++;
    return { stage: n, refund: v - stageCost(n) };
  }
  function clampStage(n) { return Math.max(0, Math.min(STAGES.length - 1, Math.floor(+n || 0))); }
  function stageLook(n) { var o = {}, l = STAGES[clampStage(n)].look; for (var k in l) o[k] = l[k]; return o; }
  // what's new at stage n compared to the one before, as names ("City view", "Bike", "Cat")
  function stageGets(n) {
    n = clampStage(n); if (n === 0) return [];
    var a = STAGES[n].look, b = STAGES[n - 1].look, out = [];
    SLOTS.forEach(function (sl) { var id = a[sl[0]]; if (id && id !== b[sl[0]]) out.push(EXTRA_NAMES[id] || (BY_ID[id] ? BY_ID[id].name : id)); });
    return out;
  }
  var TRY_ON_MS = 2000;                    // how long a try-on preview shows
  var NEXT_UP = 4;                          // "Can buy" tab: how many cheapest items to show when you can't afford any
  var SLOTS = [
    ["place", "Place", "🏠"], ["ride", "Ride", "🚗"], ["outfit", "Outfit", "👕"],
    ["hat", "Hats", "🧢"], ["shades", "Shades", "😎"], ["chain", "Chains", "⛓️"],
    ["shoes", "Shoes", "👟"], ["pet", "Pets", "🐾"]
  ];
  var ICONS = {
    cap: "🧢", beanie: "🧶", crown: "👑", sunglasses: "🕶️", goldshades: "🕶️",
    hoodie: "🧥", dripjacket: "🧥", suit: "🤵", silverchain: "📿", goldchain: "📿",
    diamondchain: "💎", sneakers: "👟", designerkicks: "👟", bike: "🚲", sportscar: "🏎️",
    cityview: "🌆", headphones: "🎧", nerdglasses: "👓", varsity: "🧥", dogtag: "🏷️", slides: "🩴", skateboard: "🛹", mansion: "🏰", cat: "🐈", dog: "🐕", tiger: "🐅", room: "🛏️", cleantee: "👕", penthouse: "🏙️", yacht: "🛥️"
  };
  // Status by net worth (coins spent on cosmetics). He starts broke, on the road.
  var STATUS = [
    [0, "Broke", "Living on the road"], [100, "Scraping by", "Got something"],
    [1000, "Getting by", "Off the street"], [5000, "Comfortable", "Doing alright"],
    [15000, "Rich", "Money talks"], [35000, "Rolling in it", "Top of the city"], [75000, "Legend", "Owns the whole city"]
  ];
  function status(owned) {
    var w = netWorth(owned), i = 0;
    while (i + 1 < STATUS.length && w >= STATUS[i + 1][0]) i++;
    var nx = STATUS[i + 1];
    return { name: STATUS[i][1], line: STATUS[i][2], level: i, next: nx ? nx[1] : null,
      toNext: nx ? nx[0] - w : 0, frac: nx ? (w - STATUS[i][0]) / (nx[0] - STATUS[i][0]) : 1 };
  }
  var BY_ID = {};
  CATALOG.forEach(function (c) { BY_ID[c.id] = c; });

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
    } else if (p === "room") {
      o.push('<rect width="300" height="300" fill="#4a5578"/>');
      o.push('<rect y="0" width="300" height="12" fill="#3d4766"/>');
      o.push('<rect x="14" y="64" width="64" height="74" rx="3" fill="#2a3150"/><rect x="19" y="69" width="54" height="64" fill="#8ec9ff"/>');
      o.push('<line x1="46" y1="69" x2="46" y2="133" stroke="#e9f2ff" stroke-width="3"/><line x1="19" y1="101" x2="73" y2="101" stroke="#e9f2ff" stroke-width="3"/>');
      o.push('<circle cx="60" cy="82" r="6" fill="#fff6c4"/>');
      o.push('<rect x="214" y="104" width="52" height="64" rx="3" fill="#f0e6d2"/><rect x="220" y="110" width="40" height="34" fill="#7F77DD"/>');
      o.push('<path d="M224 140 L238 122 L246 132 L252 124 L258 140Z" fill="#1D9E75"/><rect x="222" y="150" width="36" height="3" fill="#b5ad98"/><rect x="222" y="157" width="24" height="3" fill="#b5ad98"/>');
      o.push('<rect y="250" width="300" height="50" fill="#363c58"/><rect y="250" width="300" height="4" fill="#2b3048"/>');
      o.push('<ellipse cx="60" cy="278" rx="48" ry="9" fill="#7F77DD" opacity=".55"/>');
    } else if (p === "mansion") {
      o.push('<defs><linearGradient id="' + id + 'msky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a76"/><stop offset="1" stop-color="#ffd9a8"/></linearGradient></defs>');
      o.push('<rect width="300" height="300" fill="url(#' + id + 'msky)"/>');
      o.push('<rect x="22" y="104" width="256" height="136" fill="#f6f1e7"/><path d="M12 106 L150 52 L288 106Z" fill="#8a5a44"/><path d="M110 106 L150 80 L190 106Z" fill="#f6f1e7"/>');
      [118, 140, 160, 182].forEach(function (x) { o.push('<rect x="' + x + '" y="106" width="9" height="134" fill="#ffffff" stroke="#d8d0c0"/>'); });
      [[34, 120], [74, 120], [210, 120], [250, 120], [34, 178], [74, 178], [210, 178], [250, 178]].forEach(function (w) { o.push('<rect x="' + w[0] + '" y="' + w[1] + '" width="20" height="28" fill="#ffd36b" stroke="#8a5a44" stroke-width="2"/>'); });
      o.push('<rect x="138" y="190" width="24" height="50" fill="#5b3a29"/><circle cx="157" cy="216" r="2" fill="#ffd36b"/>');
      o.push('<rect y="240" width="300" height="60" fill="#4caf50"/><rect y="240" width="300" height="6" fill="#3d8b40"/>');
      o.push('<ellipse cx="236" cy="282" rx="56" ry="12" fill="#4fc3f7" stroke="#e0f7ff" stroke-width="3"/><path d="M206 282 q8 -4 16 0 M236 286 q8 -4 16 0" stroke="#e0f7ff" stroke-width="2" fill="none"/>');
      o.push('<circle cx="16" cy="230" r="16" fill="#2e7d32"/><circle cx="286" cy="226" r="18" fill="#2e7d32"/>' + spark(262, 40, 7, "#fffbe0"));
    } else if (p === "jet") { // Billionaire: a private jet on the runway at sunset, red carpet to the door
      o.push('<defs><linearGradient id="' + id + 'jsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a6e"/><stop offset=".55" stop-color="#f08a5d"/><stop offset="1" stop-color="#ffd59a"/></linearGradient></defs>');
      o.push('<rect width="300" height="300" fill="url(#' + id + 'jsky)"/><circle cx="60" cy="150" r="26" fill="#ffe2a8" opacity=".9"/>');
      o.push('<rect y="196" width="300" height="104" fill="#3b3f4a"/><rect y="196" width="300" height="4" fill="#5b606d"/>');
      for (var rx = 0; rx < 300; rx += 44) o.push('<rect x="' + rx + '" y="262" width="26" height="4" fill="#f4f1e6"/>');
      o.push('<g transform="translate(150 150)"><path d="M-130 30 Q-140 14 -112 10 L96 6 Q132 6 140 22 Q132 36 96 38 L-112 40 Q-132 40 -130 30Z" fill="#f7f7f9" stroke="#c8ccd6" stroke-width="1.5"/>' +
        '<path d="M-112 10 L-128 -26 L-108 -26 L-80 10Z" fill="#f7f7f9" stroke="#c8ccd6" stroke-width="1.5"/><path d="M-120 -20 L-104 -20" stroke="#c9a227" stroke-width="3"/>' +
        '<path d="M-20 30 L-60 62 L-36 62 L20 32Z" fill="#e6e8ee"/><rect x="-96" y="16" width="160" height="5" fill="#c9a227"/>');
      for (var wx = -86; wx < 70; wx += 18) o.push('<ellipse cx="' + wx + '" cy="25" rx="5" ry="4" fill="#22304a"/>');
      o.push('<path d="M112 14 Q128 16 132 24 L112 24Z" fill="#22304a"/><rect x="70" y="20" width="14" height="22" rx="2" fill="#d9dde6" stroke="#b9bfcc"/></g>');
      o.push('<path d="M226 192 L242 192 L262 238 L236 238Z" fill="#c9a227"/><path d="M228 196 L240 196 M231 205 L244 205 M234 214 L248 214 M237 223 L252 223" stroke="#8a6d17" stroke-width="2"/>');
      o.push('<path d="M236 238 L262 238 L300 300 L240 300Z" fill="#b3122e"/>' + spark(250, 46, 7, "#fffbe0"));
    } else if (p === "island") { // Filthy rich: your own island, villa, palms, helipad, a yacht offshore
      o.push('<defs><linearGradient id="' + id + 'isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb6ff"/><stop offset="1" stop-color="#bdeaff"/></linearGradient>' +
        '<linearGradient id="' + id + 'isea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19b6c9"/><stop offset="1" stop-color="#0b6f9e"/></linearGradient></defs>');
      o.push('<rect width="300" height="300" fill="url(#' + id + 'isky)"/><circle cx="250" cy="48" r="20" fill="#fff6b8"/><circle cx="250" cy="48" r="32" fill="#fff6b8" opacity=".3"/>');
      o.push('<rect y="150" width="300" height="150" fill="url(#' + id + 'isea)"/><path d="M0 150 Q50 144 100 150 T200 150 T300 150 L300 156 L0 156Z" fill="#5fd6e6"/>');
      // a second island far off
      o.push('<path d="M206 152 Q228 136 254 152Z" fill="#2f8f4e"/><path d="M226 140 l0 -12 M226 128 q-8 2 -12 8 M226 128 q8 2 12 8" stroke="#2f6e3a" stroke-width="2" fill="none"/>');
      // the main island: sand, villa with infinity pool, palms, helipad
      o.push('<path d="M-10 250 Q40 176 150 178 Q250 176 310 250 L310 300 L-10 300Z" fill="#f2d48b"/><path d="M10 236 Q70 188 150 190 Q236 188 292 236Z" fill="#3fa65a"/>');
      o.push('<rect x="96" y="160" width="96" height="40" fill="#fbfbf7" stroke="#d9d4c4"/><rect x="108" y="150" width="72" height="12" fill="#fbfbf7" stroke="#d9d4c4"/><rect x="104" y="170" width="20" height="16" fill="#7ecbf2"/><rect x="134" y="170" width="20" height="16" fill="#7ecbf2"/><rect x="164" y="170" width="20" height="16" fill="#7ecbf2"/>');
      o.push('<rect x="100" y="200" width="88" height="10" rx="2" fill="#4fd0f5" stroke="#e8fbff"/>');
      [[44, 210], [70, 196], [236, 200], [262, 214]].forEach(function (pp) {
        o.push('<path d="M' + pp[0] + ' ' + pp[1] + ' q4 -30 -2 -52" stroke="#8a5a2b" stroke-width="5" fill="none"/><g transform="translate(' + (pp[0] - 2) + ' ' + (pp[1] - 52) + ')"><path d="M0 0 q-20 -4 -28 10 M0 0 q20 -4 28 10 M0 0 q-12 -16 -26 -12 M0 0 q12 -16 26 -12 M0 0 q0 -14 4 -20" stroke="#2f8f4e" stroke-width="5" fill="none" stroke-linecap="round"/></g>');
      });
      o.push('<circle cx="214" cy="226" r="15" fill="#3a3f48"/><text x="214" y="231" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="14" fill="#f4f1e6">H</text>');
      // yacht offshore
      o.push('<g transform="translate(40 158)"><path d="M0 0 L46 0 L40 8 L4 8Z" fill="#f7f7f9"/><rect x="12" y="-7" width="22" height="7" fill="#f7f7f9"/><rect x="15" y="-5" width="16" height="3" fill="#22304a"/></g>');
      o.push(spark(70, 40, 7, "#fffbe0") + spark(150, 110, 6, "#fffbe0"));
    } else { // the road: where he starts, broke
      o.push('<defs><linearGradient id="' + id + 'dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232842"/><stop offset="1" stop-color="#6a5878"/></linearGradient></defs>');
      o.push('<rect width="300" height="300" fill="url(#' + id + 'dusk)"/>');
      o.push('<circle cx="250" cy="44" r="1.5" fill="#fff" opacity=".6"/><circle cx="200" cy="26" r="1.2" fill="#fff" opacity=".5"/><circle cx="150" cy="56" r="1" fill="#fff" opacity=".5"/>');
      o.push('<path d="M0 236 L0 196 L30 196 L30 178 L64 178 L64 204 L96 204 L96 188 L140 188 L140 210 L176 210 L176 182 L214 182 L214 200 L252 200 L252 172 L300 172 L300 236Z" fill="#2a2d44"/>');
      o.push('<rect x="20" y="70" width="6" height="168" fill="#4a4f63"/><path d="M23 72 Q23 58 44 58" stroke="#4a4f63" stroke-width="5" fill="none"/>');
      o.push('<circle cx="46" cy="64" r="22" fill="#ffd98a" opacity=".18"/><rect x="38" y="58" width="16" height="7" rx="3" fill="#ffe7a8"/>');
      o.push('<rect y="232" width="300" height="20" fill="#5d5964"/><rect y="250" width="300" height="6" fill="#8a8590"/>');
      o.push('<rect y="256" width="300" height="44" fill="#2e2e34"/>');
      for (var dx = 6; dx < 300; dx += 48) o.push('<rect x="' + dx + '" y="279" width="26" height="4" fill="#d9b44a" opacity=".8"/>');
      o.push('<path d="M60 240 L76 236 L70 244Z" fill="#7d7a86"/><path d="M150 246 l10 -3 l2 4z" fill="#9b8f7a"/>');
      o.push('<g class="pf-box"><rect x="196" y="196" width="72" height="54" fill="#b98a55"/><path d="M196 196 L184 182 L250 182 L268 196Z" fill="#cfa06a"/><path d="M232 196 L232 250" stroke="#8c6438" stroke-width="2"/>');
      o.push('<rect x="204" y="204" width="56" height="30" fill="#e8d3a8" transform="rotate(-4 232 219)"/>');
      o.push('<text x="232" y="216" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7.5" fill="#3a2a18" transform="rotate(-4 232 219)">WILL DO MATH</text>');
      o.push('<text x="232" y="228" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7.5" fill="#3a2a18" transform="rotate(-4 232 219)">FOR COINS</text></g>');
      o.push('<path d="M172 236 L186 236 L184 252 L174 252Z" fill="#9aa3ad"/><path d="M172 240 L186 240" stroke="#6c757d" stroke-width="1.5"/><circle cx="179" cy="235" r="2.5" fill="#f5c518"/>');
    }
    return o.join("");
  }

  function rideSVG(r) {
    var o = [];
    if (r === "skateboard") {
      o.push('<ellipse cx="236" cy="286" rx="50" ry="4" fill="#000" opacity=".25"/>');
      o.push('<path d="M188 270 Q186 262 196 264 L276 264 Q286 262 284 270 Q282 276 272 276 L200 276 Q190 276 188 270Z" fill="#7b3fe4" stroke="#4b1fa0" stroke-width="2"/>');
      o.push('<path d="M206 268 L262 268" stroke="#c8b2ff" stroke-width="2" stroke-dasharray="6 4"/>');
      o.push('<circle cx="204" cy="281" r="6" fill="#f5c518"/><circle cx="268" cy="281" r="6" fill="#f5c518"/>');
    } else if (r === "bike") {
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

  function petSVG(k) {
    if (k === "cat") return '<g class="pf-L-pet"><ellipse cx="38" cy="286" rx="22" ry="3" fill="#000" opacity=".25"/><path d="M20 276 Q6 262 16 252" stroke="#f4a261" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="36" cy="274" rx="17" ry="11" fill="#f4a261"/><circle cx="54" cy="260" r="10" fill="#f4a261"/><path d="M46 254 L47 243 L54 251Z M56 251 L62 243 L63 255Z" fill="#e07b39"/><circle cx="51" cy="259" r="1.6" fill="#222"/><circle cx="58" cy="259" r="1.6" fill="#222"/><path d="M53 264 q1.5 1.5 3 0" stroke="#222" stroke-width="1.2" fill="none"/><path d="M28 268 l4 6 M36 266 l3 7" stroke="#e07b39" stroke-width="2"/></g>';
    if (k === "dog") return '<g class="pf-L-pet"><ellipse cx="38" cy="287" rx="24" ry="3" fill="#000" opacity=".25"/><path d="M16 268 Q8 258 14 252" stroke="#a0703f" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="36" cy="272" rx="19" ry="12" fill="#c68b52"/><rect x="22" y="278" width="6" height="9" rx="2" fill="#a0703f"/><rect x="44" y="278" width="6" height="9" rx="2" fill="#a0703f"/><circle cx="56" cy="256" r="11" fill="#c68b52"/><ellipse cx="47" cy="258" rx="4" ry="8" fill="#7a5230"/><ellipse cx="64" cy="261" rx="5" ry="4" fill="#e3b98a"/><circle cx="67" cy="259" r="2" fill="#222"/><circle cx="57" cy="253" r="1.7" fill="#222"/><path d="M62 266 q2 4 4 0" fill="#e85d75"/></g>';
    if (k === "tiger") return '<g class="pf-L-pet"><ellipse cx="44" cy="288" rx="34" ry="4" fill="#000" opacity=".3"/><path d="M12 268 Q0 250 10 240" stroke="#f08a24" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="38" cy="268" rx="28" ry="16" fill="#f08a24"/><path d="M24 254 l4 12 M34 252 l3 13 M44 253 l2 12 M54 256 l0 10" stroke="#1d1d1b" stroke-width="3" stroke-linecap="round"/><rect x="18" y="276" width="8" height="12" rx="3" fill="#f08a24"/><rect x="50" y="276" width="8" height="12" rx="3" fill="#f08a24"/><circle cx="66" cy="250" r="15" fill="#f08a24"/><circle cx="56" cy="238" r="5" fill="#f08a24"/><circle cx="76" cy="238" r="5" fill="#f08a24"/><ellipse cx="68" cy="256" rx="8" ry="6" fill="#fff3e0"/><circle cx="61" cy="247" r="2" fill="#222"/><circle cx="72" cy="247" r="2" fill="#222"/><circle cx="67" cy="253" r="2" fill="#222"/><path d="M58 240 l3 4 M66 237 l0 5 M74 240 l-3 4" stroke="#1d1d1b" stroke-width="2"/>' + spark(84, 232, 6) + '</g>';
    return "";
  }

  function shoeSVG(s) {
    var c = { body: "#5a4636", sole: "#2e231b" }, extra = '<circle cx="73" cy="270" r="3.2" fill="#f1c27d"/><path d="M120 266 L126 270 M98 268 L102 266" stroke="#2e231b" stroke-width="1.5"/>';
    if (s === "sneakers") { c = { body: "#fafafa", sole: "#d5d5d5" }; extra = '<path d="M76 270 L96 270 M118 270 L132 270" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/><path d="M84 264 L90 268 M86 262 L92 266 M110 264 L116 268 M112 262 L118 266" stroke="#999" stroke-width="1.4"/>'; }
    if (s === "slides") { c = { body: "#f4f4f4", sole: "#1d1d1d" }; extra = '<rect x="72" y="263" width="28" height="8" rx="3" fill="#1d1d1d"/><rect x="100" y="263" width="28" height="8" rx="3" fill="#1d1d1d"/><path d="M80 267 h12 M108 267 h12" stroke="#fff" stroke-width="1.6"/>'; }
    if (s === "designerkicks") { c = { body: "#15151a", sole: "#ffd54f" }; extra = '<path d="M74 272 Q88 262 100 270 M116 270 Q128 262 136 272" stroke="#ffd54f" stroke-width="3" fill="none" stroke-linecap="round"/>' + spark(72, 262, 6) + spark(134, 262, 7); }
    return '<ellipse cx="86" cy="271" rx="17" ry="9" fill="' + c.body + '"/><ellipse cx="114" cy="271" rx="17" ry="9" fill="' + c.body + '"/>' +
      '<rect x="69" y="276" width="34" height="5" rx="2.5" fill="' + c.sole + '"/><rect x="97" y="276" width="34" height="5" rx="2.5" fill="' + c.sole + '"/>' + extra;
  }

  function avatarSVG(o) {
    o = o || {};
    var eq = o.equipped || {};
    var size = Number(o.size) > 0 ? Math.round(Number(o.size)) : 220;
    var crop = o.crop === "head";
    var id = "pf" + (++uid) + "-";
    var skin = "#f1c27d", skinD = "#d9a55f", hair = "#3b2a20";
    var outfit = eq.outfit, hat = eq.hat, shades = eq.shades, chain = eq.chain;
    var broke = !outfit;
    var pants = outfit === "suit" ? "#23252d" : "#3d5a99";
    var s = [];
    s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (crop ? "66 34 88 88" : "0 0 300 300") + '" width="' + size + '" height="' + size + '" role="img" aria-label="Your guy">');
    s.push('<g class="pf-L-place">' + placeSVG(eq.place, id) + "</g>");
    if (eq.ride === "bike" || eq.ride === "sportscar" || eq.ride === "skateboard") s.push('<g class="pf-L-ride">' + rideSVG(eq.ride) + "</g>");
    s.push('<g transform="translate(10,0)">');
    s.push('<ellipse cx="100" cy="281" rx="42" ry="6" fill="#000" opacity=".28"/>');
    // legs
    s.push('<g class="pf-L-legs"><rect x="82" y="192" width="17" height="80" rx="7" fill="' + pants + '"/><rect x="101" y="192" width="17" height="80" rx="7" fill="' + pants + '"/><line x1="100" y1="205" x2="100" y2="262" stroke="#000" stroke-opacity=".25" stroke-width="1.5"/>' + (broke ? '<rect x="85" y="232" width="11" height="10" fill="#7a5c42"/><path d="M85 232 h11 M85 242 h11" stroke="#d9c7a6" stroke-width="1" stroke-dasharray="2 2"/>' : "") + '</g>');
    s.push('<g class="pf-L-shoes">' + shoeSVG(eq.shoes) + "</g>");
    // neck + hood behind
    if (outfit === "hoodie") s.push('<ellipse cx="100" cy="118" rx="29" ry="14" fill="#6b7280"/>');
    s.push('<rect x="91" y="98" width="18" height="24" fill="' + skinD + '"/>');
    // arms
    var longSleeve = outfit === "varsity" || outfit === "hoodie" || outfit === "dripjacket" || outfit === "suit";
    var sleeve = outfit === "varsity" ? "#f2f2f2" : outfit === "hoodie" ? "#8a919e" : outfit === "dripjacket" ? "#ff7b00" : outfit === "suit" ? "#2b2f3a" : broke ? "#7b8794" : "#3b9ae1";
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
    } else if (outfit === "varsity") {
      s.push('<path d="M70 130 Q70 118 84 117 L116 117 Q130 118 130 130 L128 205 L72 205Z" fill="#b3202a"/>');
      s.push('<path d="M84 117 Q100 130 116 117" stroke="#f2f2f2" stroke-width="5" fill="none"/><rect x="72" y="198" width="56" height="7" fill="#f2f2f2"/>');
      [140, 154, 168, 182].forEach(function (y) { s.push('<circle cx="100" cy="' + y + '" r="2" fill="#f2f2f2"/>'); });
      s.push('<text x="84" y="160" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="20" fill="#ffd54f" stroke="#f2f2f2" stroke-width=".8">R</text>');
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
    } else if (outfit === "cleantee") {
      s.push('<path d="M70 130 Q70 118 84 117 L116 117 Q130 118 130 130 L128 205 L72 205Z" fill="#3b9ae1"/>');
      s.push('<path d="M86 117 Q100 130 114 117 L110 115 Q100 124 90 115Z" fill="#2c7bb8"/>');
      s.push('<text x="100" y="168" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="22" fill="#fff" fill-opacity=".9">√</text>');
    } else { // ragged tee: faded, patched, torn hem
      s.push('<path d="M70 130 Q70 118 84 117 L116 117 Q130 118 130 130 L128 198 L122 205 L116 198 L110 205 L104 198 L98 205 L92 198 L86 205 L80 198 L72 204Z" fill="#7b8794"/>');
      s.push('<path d="M86 117 Q100 128 114 117" stroke="#5f6a76" stroke-width="3" fill="none"/>');
      s.push('<rect x="106" y="150" width="15" height="14" fill="#8d6e52" transform="rotate(8 113 157)"/><path d="M106 150 l15 2 M106 164 l15 2" stroke="#e8d9c0" stroke-width="1" stroke-dasharray="2 2" transform="rotate(8 113 157)"/>');
      s.push('<ellipse cx="86" cy="178" rx="4" ry="3" fill="#f1c27d"/><path d="M80 138 q6 4 4 10" stroke="#66717d" stroke-width="1.5" fill="none"/>');
    }
    s.push("</g>");
    // chain
    if (chain === "dogtag") {
      s.push('<g class="pf-L-chain"><path d="M86 121 Q100 150 114 121" fill="none" stroke="#9aa5ad" stroke-width="1.6"/><rect x="95" y="141" width="11" height="15" rx="3" fill="#c9d1d6" stroke="#8a949b" stroke-width="1"/><path d="M98 147 h5 M98 151 h4" stroke="#8a949b" stroke-width="1"/></g>');
    } else if (chain) {
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
    // hands
    s.push('<circle cx="63" cy="190" r="7.5" fill="' + skin + '"/><circle cx="137" cy="190" r="7.5" fill="' + skin + '"/>');
    // head
    s.push('<g class="pf-L-head"><circle cx="66" cy="84" r="6" fill="' + skinD + '"/><circle cx="134" cy="84" r="6" fill="' + skinD + '"/>');
    s.push('<circle cx="100" cy="82" r="34" fill="' + skin + '"/>');
    s.push('<path d="M65 80 Q60 40 100 42 Q140 40 135 80 Q130 60 112 57 Q100 66 86 58 Q70 62 65 80Z" fill="' + hair + '"/>');
    // eyes
    var px = 0, py = 1;
    s.push('<ellipse cx="88" cy="85" rx="6" ry="7" fill="#fff"/><ellipse cx="112" cy="85" rx="6" ry="7" fill="#fff"/>');
    s.push('<circle cx="' + (88 + px) + '" cy="' + (85 + py) + '" r="3.2" fill="#1d1d1b"/><circle cx="' + (112 + px) + '" cy="' + (85 + py) + '" r="3.2" fill="#1d1d1b"/>');
    s.push('<circle cx="' + (89 + px) + '" cy="' + (83 + py) + '" r="1" fill="#fff"/><circle cx="' + (113 + px) + '" cy="' + (83 + py) + '" r="1" fill="#fff"/>');
    // brows
    s.push('<path d="M80 74 Q88 70 96 74 M104 74 Q112 70 120 74" stroke="' + hair + '" stroke-width="3" stroke-linecap="round" fill="none"/>');
    s.push('<path d="M99 90 Q101 96 97 97" stroke="' + skinD + '" stroke-width="2" fill="none" stroke-linecap="round"/>');
    // mouth
    s.push(broke && !eq.place ? '<path d="M92 102 Q100 99 108 102" stroke="#7a3b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>' : '<path d="M91 100 Q100 108 109 100" stroke="#7a3b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>');
    // glasses / shades
    if (shades === "nerdglasses") {
      s.push('<g class="pf-L-shades"><circle cx="87" cy="85" r="10" fill="#cfe8ff" fill-opacity=".25" stroke="#222" stroke-width="2.6"/><circle cx="113" cy="85" r="10" fill="#cfe8ff" fill-opacity=".25" stroke="#222" stroke-width="2.6"/><path d="M97 84 Q100 81 103 84 M77 83 L67 80 M123 83 L133 80" stroke="#222" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>');
    } else if (shades === "sunglasses") {
      s.push('<g class="pf-L-shades"><rect x="75" y="76" width="22" height="16" rx="6" fill="#111"/><rect x="103" y="76" width="22" height="16" rx="6" fill="#111"/><path d="M97 82 L103 82 M75 80 L66 78 M125 80 L134 78" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M79 79 L85 79 M107 79 L113 79" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/></g>');
    } else if (shades === "goldshades") {
      s.push('<defs><linearGradient id="' + id + 'gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd54a"/><stop offset="1" stop-color="#a86b00"/></linearGradient></defs>');
      s.push('<g class="pf-L-shades"><rect x="75" y="76" width="22" height="16" rx="6" fill="url(#' + id + 'gl)" stroke="#f5c518" stroke-width="3"/><rect x="103" y="76" width="22" height="16" rx="6" fill="url(#' + id + 'gl)" stroke="#f5c518" stroke-width="3"/><path d="M97 82 L103 82 M75 80 L66 78 M125 80 L134 78" stroke="#f5c518" stroke-width="3" stroke-linecap="round"/><path d="M79 80 L85 80 M107 80 L113 80" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>' + spark(128, 74, 7) + "</g>");
    }
    s.push("</g>");
    // hats
    if (hat === "headphones") {
      s.push('<g class="pf-L-hat"><path d="M66 84 Q62 36 100 36 Q138 36 134 84" stroke="#222" stroke-width="7" fill="none" stroke-linecap="round"/><rect x="56" y="72" width="17" height="27" rx="7" fill="#e63946" stroke="#a8212d" stroke-width="2"/><rect x="127" y="72" width="17" height="27" rx="7" fill="#e63946" stroke="#a8212d" stroke-width="2"/></g>');
    } else if (hat === "cap") {
      s.push('<g class="pf-L-hat"><path d="M64 64 Q64 34 100 34 Q136 34 136 64Z" fill="#e63946"/><path d="M58 63 Q100 82 142 63 Q100 70 58 63Z" fill="#a8212d"/><circle cx="100" cy="34" r="4" fill="#a8212d"/><path d="M100 36 L100 62" stroke="#a8212d" stroke-width="2"/></g>');
    } else if (hat === "beanie") {
      s.push('<g class="pf-L-hat"><path d="M64 66 Q62 30 100 28 Q138 30 136 66Z" fill="#2a9d8f"/><rect x="62" y="56" width="76" height="15" rx="7" fill="#1f7a70"/><path d="M72 58 L72 69 M84 58 L84 69 M96 58 L96 69 M108 58 L108 69 M120 58 L120 69 M130 58 L130 69" stroke="#2a9d8f" stroke-width="2"/><circle cx="100" cy="24" r="9" fill="#f1faee"/><circle cx="96" cy="21" r="2" fill="#d6e4dc"/><circle cx="104" cy="26" r="2" fill="#d6e4dc"/></g>');
    } else if (hat === "crown") {
      s.push('<g class="pf-L-hat"><path d="M68 52 L68 22 L85 38 L100 14 L115 38 L132 22 L132 52Z" fill="#ffc400" stroke="#b8860b" stroke-width="2.5" stroke-linejoin="round"/><rect x="68" y="44" width="64" height="9" rx="2" fill="#e6a800" stroke="#b8860b" stroke-width="2"/><circle cx="100" cy="30" r="4.5" fill="#e63946"/><circle cx="82" cy="48" r="3" fill="#4fc3f7"/><circle cx="100" cy="48" r="3" fill="#e63946"/><circle cx="118" cy="48" r="3" fill="#66bb6a"/><circle cx="68" cy="20" r="3" fill="#fff6b0"/><circle cx="132" cy="20" r="3" fill="#fff6b0"/><circle cx="100" cy="12" r="3" fill="#fff6b0"/>' + spark(112, 24, 8) + spark(86, 30, 5) + "</g>");
    }
    s.push("</g>"); // translate group
    if (eq.pet) s.push(petSVG(eq.pet));
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
    ".pf-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:stretch;margin:4px 0 6px}",
    ".pf-top .pf-av{width:100%}",
    ".pf-side{display:flex;flex-direction:column;gap:3px;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:16px;background:var(--card)}",
    ".pf-sline{font-size:12px;color:var(--mute)}",
    ".pf-money{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-top:2px}",
    ".pf-money small{font-size:11px;color:var(--mute)}",
    ".pf-money b{font-size:15px;font-family:\"JetBrains Mono\",ui-monospace,monospace}",
    ".pf-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}",
    ".pf-tab{min-height:40px;padding:6px 11px;border-radius:20px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:14px;font-weight:700;cursor:pointer}",
    ".pf-tab small{font-weight:400;color:var(--mute);font-size:11px}",
    ".pf-tab.on{border-color:var(--pow);background:color-mix(in srgb,var(--pow) 18%,transparent);color:var(--pow)}",
    ".pf-note{font-size:13px;color:var(--mute);margin:0 2px 8px}",
    ".pf-status{margin:10px 0 4px;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}",
    ".pf-sname{font-size:19px;font-weight:700;color:var(--pow);line-height:1.1}",
    ".pf-sname small{font-size:13px;font-weight:400;color:var(--mute)}",
    ".pf-sbar{height:8px;border-radius:6px;background:var(--line);margin:8px 0 6px;overflow:hidden}",
    ".pf-sbar i{display:block;height:100%;background:var(--pow);border-radius:6px;transition:width .6s}",
    ".pf-snext{font-size:13px;color:var(--mute)}",
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
    ".pf-reb{font-size:12px;font-weight:700;color:var(--hot,#D85A30);margin-top:2px}",
    ".pf-lvl{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}",
    ".pf-next{display:flex;gap:12px;align-items:center;padding:12px;border:1px solid var(--pow,#1D9E75);border-radius:16px;background:color-mix(in srgb,var(--pow,#1D9E75) 10%,var(--card,#1f1f1d));margin:4px 0 6px}",
    ".pf-next.top{justify-content:center;text-align:center}",
    ".pf-nav{width:120px;flex:none;aspect-ratio:1;border-radius:14px;overflow:hidden}.pf-nav svg{display:block;width:100%;height:100%}",
    ".pf-nb{flex:1;min-width:0}.pf-nlab{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}",
    ".pf-nname{font-size:20px;font-weight:700;line-height:1.15}.pf-nline{font-size:13px;color:var(--mute);margin-top:2px}",
    ".pf-ngets{font-size:12px;margin-top:6px;line-height:1.35}",
    ".pf-ladder{display:flex;flex-direction:column;gap:6px}",
    ".pf-rung{display:flex;align-items:center;gap:10px;padding:6px 10px 6px 6px;border:1px solid var(--line);border-radius:12px;background:var(--card)}",
    ".pf-rav{width:44px;height:44px;flex:none;border-radius:10px;overflow:hidden}.pf-rav svg{display:block;width:100%;height:100%}",
    ".pf-rb{flex:1;min-width:0;display:flex;flex-direction:column}.pf-rb b{font-size:14px}.pf-rb small{font-size:11px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".pf-rp{font-size:13px;font-family:\"JetBrains Mono\",ui-monospace,monospace;white-space:nowrap}",
    ".pf-rung.now{border-color:var(--pow,#1D9E75);box-shadow:0 0 0 1px var(--pow,#1D9E75)}.pf-rung.now .pf-rp{color:var(--pow,#1D9E75);font-weight:700}",
    ".pf-rung.done{opacity:.65}.pf-rung.done .pf-rp{color:var(--good,#97C459)}.pf-rung.lock .pf-rav{filter:grayscale(.85) brightness(.8)}",
    "@media (prefers-reduced-motion:reduce){.pf-pop,.pf-spk,.pf-msg.bad{animation:none}.pf-card{transition:none}}"
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
    var msg = null, pop = false, sure = false;
    function num(f, d) { try { return api[f] ? Number(api[f]()) : d; } catch (e) { return d; } }
    function cur() { return clampStage(api.stage ? api.stage() : 0); }
    function render() {
      var n = cur(), coins = Number(api.coins()) || 0, S = STAGES[n], last = STAGES.length - 1, h = [];
      h.push('<div class="pf-wrap">');
      h.push('<div class="pf-top"><div class="pf-av' + (pop ? " pf-pop" : "") + '">' + avatarSVG({ equipped: stageLook(n), size: 200 }) + "</div>");
      h.push('<div class="pf-side"><div class="pf-lvl">Stage ' + (n + 1) + " of " + STAGES.length + '</div><div class="pf-sname">' + S.name + '</div><div class="pf-sline">' + S.line + "</div>" +
        (num("rebirths", 0) ? '<div class="pf-reb">Rebirth ' + num("rebirths", 0) + " · Rush coins ×" + num("coinMult", 1) + "</div>" : "") +
        '<div class="pf-sbar"><i style="width:' + Math.round(n / last * 100) + '%"></i></div>' +
        '<div class="pf-money"><small>coins</small><b>' + fmt(coins) + " 🪙</b></div></div></div>");
      pop = false;
      h.push('<div class="pf-msg' + (msg ? " " + msg.kind : "") + '">' + (msg ? msg.text : "") + "</div>");
      if (n < last) {
        var N = STAGES[n + 1], can = coins >= N.price, gets = stageGets(n + 1);
        h.push('<div class="pf-next"><div class="pf-nav">' + avatarSVG({ equipped: stageLook(n + 1), size: 120 }) + '</div><div class="pf-nb">' +
          '<div class="pf-nlab">Next life</div><div class="pf-nname">' + N.name + '</div><div class="pf-nline">' + N.line + "</div>" +
          (gets.length ? '<div class="pf-ngets">New: ' + gets.join(", ") + "</div>" : "") +
          '<button class="pf-btn ' + (can ? "buy" : "poor") + '" data-act="up">' + (can ? "Move up · " + fmt(N.price) + " 🪙" : fmt(N.price - coins) + " more 🪙 to go") + "</button></div></div>");
      } else {
        var nm = num("nextMult", 1.5), same = nm === num("coinMult", 1);
        h.push('<div class="pf-next top"><div class="pf-nb"><div class="pf-nname">You made it. Rebirth?</div><div class="pf-nline">Start over as Homeless with <b>0 coins</b>. ' +
          (same ? "You're at the max boost already, so this is just for the climb." : "Every coin you earn in Root Rush is worth <b>×" + nm + "</b> from then on, forever.") +
          " Casino wins don't get the boost.</div>" +
          '<button class="pf-btn ' + (sure ? "buy" : "") + '" data-act="rebirth">' + (sure ? "Tap again: lose all coins and restart" : "♻ Rebirth" + (same ? "" : " · coins ×" + nm)) + "</button></div></div>");
      }
      // the whole ladder, top first
      h.push('<div class="pf-h">The ladder</div><div class="pf-ladder">');
      for (var i = last; i >= 0; i--) {
        var cls = i < n ? "done" : i === n ? "now" : "lock";
        h.push('<div class="pf-rung ' + cls + '"><div class="pf-rav">' + avatarSVG({ equipped: stageLook(i), size: 44, crop: "head" }) + '</div><div class="pf-rb"><b>' + STAGES[i].name + "</b><small>" + STAGES[i].line + "</small></div>" +
          '<div class="pf-rp">' + (i <= n ? (i === n ? "You" : "✓") : fmt(STAGES[i].price) + " 🪙") + "</div></div>");
      }
      h.push("</div></div>");
      el.innerHTML = h.join("");
      msg = null;
    }
    function snd(kind) { try { if (api.sound) api.sound(kind); } catch (e) { /* ignore */ } }
    el.onclick = function (e) {
      var tg = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      if (!tg || !el.contains(tg)) return;
      if (tg.getAttribute("data-act") === "rebirth") {
        if (!sure) { sure = true; snd("click"); render(); return; }
        sure = false;
        if (api.rebirth && api.rebirth()) { snd("buy"); pop = true; msg = { kind: "good", text: "Reborn! Back on the road, Rush coins ×" + num("coinMult", 1) + "." }; }
        render(); return;
      }
      if (tg.getAttribute("data-act") !== "up") return;
      var n = cur(); if (n >= STAGES.length - 1) return;
      var N = STAGES[n + 1];
      if (api.buyStage && api.buyStage(n + 1)) { snd("buy"); pop = true; msg = { kind: "good", text: "You're " + (/^[AEIOU]/.test(N.name) ? "an " : "") + N.name.toLowerCase().replace(/^(an |a )/, "") + " now!" }; }
      else { snd("lose"); msg = { kind: "bad", text: "Not enough coins: " + fmt(Math.max(0, N.price - (Number(api.coins()) || 0))) + " more to go." }; }
      render();
    };
    render();
  }

  globalThis.RRProfile = {
    STAGES: STAGES, stageCost: stageCost, stageFromSpent: stageFromSpent, stageLook: stageLook, stageGets: stageGets,
    CATALOG: CATALOG,
    netWorth: netWorth,
    status: status,
    STATUS: STATUS,
    avatarSVG: avatarSVG,
    mount: mount
  };
})();
