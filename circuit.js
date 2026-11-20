/*
 * Scheda madre della landing (stessa geometria del promo ecosistema: fasci paralleli, angoli a 45 gradi, lime).
 *
 * È lo scorrimento a dare energia al sistema:
 * - la corrente scende solo fin dove si è scorso, e accende i componenti uno dopo l'altro;
 * - più si scorre, più il flusso sulle piste in vista è veloce e luminoso; quando ci si ferma, si calma;
 * - il componente al centro dello schermo è "a fuoco": il suo video parte, la targhetta diventa lime e i piedini
 *   si riempiono finché si resta lì; quando il fuoco cambia, nel nuovo componente arriva un pacchetto.
 *
 * Il racconto della scheda: la stessa carta (Tocasia, quella della clip di scansione) passa da acquisto a magazzino
 * a prezzo; dal prezzo in poi viaggia il suo prezzo verso ordine e numeri. Fuori dalla scheda un'unica pista
 * collega in ordine video, scheda, metodo, chi siamo, FAQ e modulo.
 *
 * Decorativo (aria-hidden). Con "riduci movimento": circuito già acceso e fermo, niente pacchetti né flusso.
 */
(function () {
  'use strict';
  if (!document.querySelector || !window.requestAnimationFrame || !document.createElementNS) return;
  document.documentElement.classList.add('js-circuit');

  var NS = 'http://www.w3.org/2000/svg';
  var FERMO = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var CARTA = 'media/carte/tocasia.jpg';
  var PREZZO = '0,27 €';                 // Trend CM di Tocasia foil, come nella clip degli acquisti
  var CHAMFER = 22, TAN = Math.tan(Math.PI / 8);

  // ---------- geometria (dal promo)
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function unit(a, c) { var dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  function normal(a, c) { var u = unit(a, c); return [-u[1], u[0]]; }
  function offsetLine(pts, d) {
    return pts.map(function (p, i) {
      var nP = i > 0 ? normal(pts[i - 1], p) : null, nN = i < pts.length - 1 ? normal(p, pts[i + 1]) : null;
      if (!nP) return [p[0] + nN[0] * d, p[1] + nN[1] * d];
      if (!nN) return [p[0] + nP[0] * d, p[1] + nP[1] * d];
      var mx = nP[0] + nN[0], my = nP[1] + nN[1], ml = Math.hypot(mx, my) || 1, ux = mx / ml, uy = my / ml, cos = ux * nP[0] + uy * nP[1];
      return [p[0] + ux * d / cos, p[1] + uy * d / cos];
    });
  }
  function chamfered(base, pts) {
    var s = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length - 1; i++) {
      var e1 = unit(pts[i - 1], pts[i]), e2 = unit(pts[i], pts[i + 1]);
      var disp = [pts[i][0] - base[i][0], pts[i][1] - base[i][1]];
      var inner = disp[0] * (e2[0] - e1[0]) + disp[1] * (e2[1] - e1[1]) > 0;
      var seg = Math.min(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
      var c = Math.min(CHAMFER + (inner ? -1 : 1) * Math.hypot(disp[0], disp[1]) * TAN * 0.7071, seg * 0.45);
      s += ' L ' + (pts[i][0] - e1[0] * c).toFixed(1) + ' ' + (pts[i][1] - e1[1] * c).toFixed(1) +
           ' L ' + (pts[i][0] + e2[0] * c).toFixed(1) + ' ' + (pts[i][1] + e2[1] * c).toFixed(1);
    }
    var L = pts[pts.length - 1];
    return s + ' L ' + L[0].toFixed(1) + ' ' + L[1].toFixed(1);
  }
  function clean(pts) {
    var out = [];
    pts.forEach(function (p) {
      p = [Math.round(p[0]), Math.round(p[1])];
      var q = out[out.length - 1];
      if (q && Math.abs(q[0] - p[0]) < 1 && Math.abs(q[1] - p[1]) < 1) return;
      if (out.length >= 2) {
        var a = out[out.length - 2];
        if ((a[0] === q[0] && q[0] === p[0]) || (a[1] === q[1] && q[1] === p[1])) out.pop();
      }
      out.push(p);
    });
    return out;
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function ease(u) { u = clamp(u, 0, 1); return 1 - Math.pow(1 - u, 3); }
  function docRect(e) {
    var r = e.getBoundingClientRect(), sx = window.pageXOffset, sy = window.pageYOffset;
    return {l: r.left + sx, t: r.top + sy, r: r.right + sx, b: r.bottom + sy, w: r.width, h: r.height, cx: (r.left + r.right) / 2 + sx, cy: (r.top + r.bottom) / 2 + sy};
  }

  // ---------- strato della scheda: sopra gli sfondi delle sezioni, sotto i contenuti
  var board = document.createElement('div');
  board.className = 'board';
  board.setAttribute('aria-hidden', 'true');
  var svg = svgEl('svg', {class: 'board-svg'});
  board.appendChild(svg);
  var fx = document.createElement('div');
  fx.className = 'board-fx';
  board.appendChild(fx);
  document.body.insertBefore(board, document.body.firstChild);

  var acceso = {};          // piste e componenti già accesi: sopravvivono al ricalcolo
  var S = null;
  var focus = null, focusAt = 0;
  var energy = 0, lastY = window.pageYOffset, lastT = 0, phase = 0;

  function build() {
    board.style.height = '0px';
    var W = document.documentElement.clientWidth;
    var H = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    board.style.height = H + 'px';
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    while (fx.firstChild) fx.removeChild(fx.firstChild);

    var q = function (s) { return document.querySelector(s); };
    var grid = q('.mb');
    // la corrente parte da sotto il claim (i pulsanti dell'apertura); il video in alto non fa parte del circuito
    var defsEls = {hero: [q('.hero-copy .btn-row')], a: [q('.comp-a'), q('.comp-a .pkg')], b: [q('.comp-b'), q('.comp-b .pkg')],
      c: [q('.comp-c'), q('.comp-c .pkg')], d: [q('.comp-d'), q('.comp-d .pkg')], e: [q('.comp-e'), q('.comp-e .pkg')],
      // su telefono e tablet il mazzo è una fila che scorre di lato e parte dal bordo dello schermo: la pista si aggancia alla prima carta
      gantt: W >= 1100 ? [q('#metodo .deck')] : [q('#metodo .deck'), q('#metodo .pcard')], people: [q('#chi-siamo .people')], faq: [q('#faq .faq-list')], form: [q('#contatti form.sheet')]};
    if (!grid) return null;
    for (var k0 in defsEls) if (!defsEls[k0][0] || (defsEls[k0].length > 1 && !defsEls[k0][1])) return null;

    var col = docRect(grid);
    var wide = W >= 1100;                    // stessa soglia del CSS della scheda madre (chip affiancati alle note)
    var gut = wide ? clamp(Math.round(col.l / 2), 12, 64) : Math.max(8, Math.round(col.l / 2));
    var xL = wide ? col.l - gut : gut, xR = col.r + gut;
    var nT = wide ? 4 : 3, spT = wide ? 6 : 5;     // pista principale: un fascio spesso e ben visibile

    var defs = svgEl('defs', {}, svg);
    var pat = svgEl('pattern', {id: 'bdots', width: 22, height: 22, patternUnits: 'userSpaceOnUse'}, defs);
    svgEl('circle', {cx: 11, cy: 11, r: 1.1, class: 'b-dot'}, pat);
    var mbR = docRect(q('.mb'));
    svgEl('rect', {x: 0, y: mbR.t, width: W, height: mbR.h, fill: 'url(#bdots)', class: 'b-pcb'}, svg);
    var gOff = svgEl('g', {class: 'b-off'}, svg);
    var gPins = svgEl('g', {class: 'b-pins'}, svg);
    var gOn = svgEl('g', {class: 'b-on'}, svg);
    var gRoute = svgEl('g', {class: 'b-route'}, svg);

    var sc = {W: W, H: H, wide: wide, wires: [], nodes: {}, list: [], packets: []};
    var N = sc.nodes;
    ['hero', 'a', 'b', 'c', 'd', 'e', 'gantt', 'people', 'faq', 'form'].forEach(function (k) {
      var el = defsEls[k][0], box = defsEls[k][1] || el, r = docRect(box);
      var nd = {k: k, el: el, box: box, r: r, lit: false, pins: [], in: null, out: null,
        inY: Math.round(r.t + clamp(r.h * 0.2, 22, 80)), outY: Math.round(r.b - clamp(r.h * 0.2, 22, 80))};
      N[k] = nd; sc.list.push(nd);
      if (el.classList.contains('is-lit')) el.classList.remove('is-lit');
    });

    function wire(key, pts, n, sp, opt) {
      pts = clean(pts);
      var w = {key: key, pts: pts, n: n, sp: sp, deps: [], state: 0, delay: 0, into: null, from: null, paths: [], flows: []};
      for (var o in opt) w[o] = opt[o];
      var ys = pts.map(function (p) { return p[1]; });
      w.y0 = Math.min.apply(null, ys); w.y1 = Math.max.apply(null, ys); w.y = pts[0][1];
      var gO = svgEl('g', {class: w.cls || ''}, gOff), g = svgEl('g', {class: 'w ' + (w.cls || '')}, gOn);
      for (var i = 0; i < n; i++) {
        var off = (i - (n - 1) / 2) * sp, p = offsetLine(pts, off), d = chamfered(pts, p);
        svgEl('path', {d: d, class: 'w-off'}, gO);
        var glow = svgEl('path', {d: d, class: 'w-glow'}, g);
        var base = svgEl('path', {d: d, class: 'w-base'}, g);
        w.flows.push(svgEl('path', {d: d, class: 'w-flow'}, g));
        var len = base.getTotalLength();
        if (w.cls !== 'sig') [glow, base].forEach(function (pth) { pth.style.strokeDasharray = len + ' ' + (len + 40); pth.style.strokeDashoffset = len; });
        w.paths.push({glow: glow, base: base, len: len});
      }
      w.len = w.paths[0].len;
      var square = w.cls === 'data' || w.cls === 'sig';
      [pts[0], pts[pts.length - 1]].forEach(function (p) {
        if (square) svgEl('rect', {x: p[0] - 3.5, y: p[1] - 3.5, width: 7, height: 7, class: 'w-pad'}, g);
        else svgEl('circle', {cx: p[0], cy: p[1], r: 3.4, class: 'w-pad'}, g);
      });
      if (w.cls === 'data') for (var v = 1; v < pts.length - 1; v++) svgEl('rect', {x: pts[v][0] - 3, y: pts[v][1] - 3, width: 6, height: 6, class: 'w-via'}, g);
      w.mid = svgEl('path', {d: chamfered(pts, pts)}, gRoute);
      w.midLen = w.mid.getTotalLength();
      w.head = svgEl('circle', {r: 4.2, class: 'w-head'}, g);
      w.halo = svgEl('circle', {r: 10, class: 'w-halo'}, g);
      w.g = g;
      sc.wires.push(w);
      return w;
    }

    // ---------- pista principale: lungo i margini, da un componente al successivo
    var trunkX = function (side) { return side === 'R' ? xR : xL; };
    function exitPts(n, side) {
      var r = n.r;
      if (side === 'B') { var g = r.b + 30, x = Math.round(Math.min(r.cx, r.l + 60)); return [[x, r.b], [x, g], [xL, g]]; }
      return [[side === 'R' ? r.r : r.l, n.outY], [trunkX(side), n.outY]];
    }
    function entryPts(n, side) {
      var r = n.r;
      if (side === 'T') { var g = r.t - 30, x = Math.round(r.l + 56); return [[xL, g], [x, g], [x, r.t]]; }
      return [[trunkX(side), n.inY], [side === 'R' ? r.r : r.l, n.inY]];
    }
    function link(key, A, fs, B, ts, crossY, opt) {
      var a = exitPts(A, fs), z = entryPts(B, ts), xa = a[a.length - 1][0], xz = z[0][0], mid = [];
      if (Math.abs(xa - xz) > 2) { mid.push([xa, crossY]); mid.push([xz, crossY]); }
      opt = opt || {}; opt.cls = 'main';
      var w = wire(key, a.concat(mid, z), nT, spT, opt);
      w.from = A; w.into = B; A.out = w; B.in = w;
      return w;
    }
    // tra due chip della scheda.
    // Desktop: esce dal basso, scende a gradino nello spazio libero tra i chip, entra dall'alto.
    // Telefono e tablet: la nota sta sotto il chip, quindi la pista esce dal lato libero, scende nel margine
    // della pagina ed entra dal lato del chip successivo (i chip sono sfalsati a sinistra e a destra).
    function boardLink(key, A, B) {
      var a = A.r, b = B.r;
      if (!wide) {
        var right = b.cx >= a.cx, xg = right ? xR : xL;
        var w2 = wire(key, [[right ? a.r : a.l, A.outY], [xg, A.outY], [xg, B.inY], [right ? b.r : b.l, B.inY]], nT, spT, {board: true, cls: 'main'});
        w2.from = A; w2.into = B; A.out = w2; B.in = w2;
        return w2;
      }
      var xa = Math.round(a.cx), xb = b.cx >= a.cx ? Math.round(b.l + Math.min(b.w * 0.28, 120)) : Math.round(b.r - Math.min(b.w * 0.28, 120));
      var m = Math.round(a.b + (b.t - a.b) * 0.5);
      var w = wire(key, [[xa, a.b], [xa, m], [xb, m], [xb, b.t]], nT, spT, {board: true, cls: 'main'});
      w.from = A; w.into = B; A.out = w; B.in = w;
      return w;
    }

    var sides;
    if (wide) sides = {hero: 'B', a: 'L', e: 'L', gantt: ['L', 'R'], people: ['R', 'R'], faq: ['R', 'R'], form: 'R'};
    else {
      var off = function (n) { return n.r.l > col.l + 40; };
      sides = {hero: 'B', a: 'L', e: 'L', gantt: ['L', 'L'], people: off(N.people) ? ['T', 'B'] : ['L', 'L'], faq: ['L', 'L'], form: off(N.form) ? 'T' : 'L'};
    }
    var vt = docRect(document.getElementById('vantaggi')).t;
    var P0 = link('p0', N.hero, sides.hero, N.a, sides.a, 0);
    var AB = boardLink('ab', N.a, N.b), BC = boardLink('bc', N.b, N.c), CD = boardLink('cd', N.c, N.d), DE = boardLink('de', N.d, N.e);
    var P1 = link('p1', N.e, sides.e, N.gantt, sides.gantt[0], 0);
    var P2 = link('p2', N.gantt, sides.gantt[1], N.people, sides.people[0], 0, {delay: 1.6});
    var P3 = link('p3', N.people, sides.people[1], N.faq, sides.faq[0], 0);
    var P4 = link('p4', N.faq, sides.faq[1], N.form, sides.form, 0);
    var chain = [P0, AB, BC, CD, DE, P1, P2, P3, P4];
    for (var c = 1; c < chain.length; c++) { chain[c].deps = [chain[c - 1]]; if (!chain[c].delay) chain[c].delay = 0.3; }

    // ---------- collegamenti trasversali, sottili, solo dove nel lavoro c'è un legame vero (desktop)
    // prezzi -> acquisti: la buylist offre in linea con il mercato; magazzino -> ordini: il prelievo usa le posizioni;
    // prezzi -> numeri: i margini dipendono dai prezzi. Si accendono quando entrambi i componenti sono accesi.
    if (wide) {
      var laneL = Math.round(col.l - 22), laneR = Math.round(col.r + 22);
      var thin = function (key, A, B, pts) { var w = wire(key, pts, 2, 5, {cls: 'data', both: [A, B]}); return w; };
      thin('ca', N.c, N.a, [[N.c.r.l, N.c.inY], [laneL, N.c.inY], [laneL, N.a.outY], [N.a.r.l, N.a.outY]]);
      thin('bd', N.b, N.d, [[N.b.r.r, N.b.outY], [laneR, N.b.outY], [laneR, N.d.inY], [N.d.r.r, N.d.inY]]);
      thin('ce', N.c, N.e, [[N.c.r.l, N.c.outY], [laneL, N.c.outY], [laneL, N.e.inY], [N.e.r.l, N.e.inY]]);

      // ---------- collegamenti tra sezioni lontane, su corsie più esterne del margine (solo dove c'è spazio)
      // linea dati = due cose che si scambiano informazioni; linea di segnale = un'azione e il punto dove porta.
      var LB = Math.round(col.l - 104), LC = Math.round(col.l - 150), RB = Math.round(col.r + 104), RC = Math.round(col.r + 150);
      var okL = function (x) { return x > 10; }, okR = function (x) { return x < W - 10; };
      var dk = docRect(q('#metodo .deck')), c1 = docRect(q('#metodo .pcard')), c2 = docRect(q('#metodo .pcard:nth-child(2)'));
      // i titoli: la pista si ferma poco prima della prima lettera
      var h2c = docRect(q('.contact-txt h2')), faq3 = docRect(q('#faq .h2'));
      h2c.l -= 14; faq3.l -= 14;
      // carta "Prima chiamata" -> "La prima chiamata" nei contatti: sono la stessa cosa
      var laneD1 = okL(LC) ? LC : (okL(LB) ? LB : 0);
      if (laneD1) wire('x-chiamata', [[c1.l, Math.round(c1.t + c1.h * 0.58)], [laneD1, Math.round(c1.t + c1.h * 0.58)], [laneD1, Math.round(h2c.t + h2c.h / 2)], [h2c.l, Math.round(h2c.t + h2c.h / 2)]], 2, 5, {cls: 'data', both: [N.gantt, N.form]});
      // prezzi -> FAQ sui marketplace
      if (okL(LB)) wire('x-marketplace', [[N.c.r.l, N.c.r.t + 40], [LB, N.c.r.t + 40], [LB, Math.round(faq3.t + faq3.h / 2)], [faq3.l, Math.round(faq3.t + faq3.h / 2)]], 2, 5, {cls: 'data', both: [N.c, N.faq]});
      // numeri -> carta "Analisi e proposta": l'analisi parte dai numeri
      wire('x-analisi', [[N.e.r.l, N.e.r.b - 30], [laneL, N.e.r.b - 30], [laneL, dk.t - 18], [Math.round(c2.l + c2.w / 2), dk.t - 18], [Math.round(c2.l + c2.w / 2), c2.t]], 2, 5, {cls: 'data', both: [N.e, N.gantt]});
      // chi siamo -> carta "Prima chiamata": la prima chiamata la fate voi
      if (okR(RB)) wire('x-noi', [[N.people.r.r, N.people.r.t + 60], [RB, N.people.r.t + 60], [RB, dk.t - 34], [Math.round(c1.l + c1.w * 0.35), dk.t - 34], [Math.round(c1.l + c1.w * 0.35), c1.t]], 1, 0, {cls: 'sig', both: [N.people, N.gantt]});
    }

    // ---------- condensatori lungo la pista principale: si accendono quando passa la corrente
    function cap(w, frac) {
      var L = w.midLen * frac, p = w.mid.getPointAtLength(L), q2 = w.mid.getPointAtLength(Math.min(w.midLen, L + 4));
      var t = unit([p.x, p.y], [q2.x, q2.y]), n = [-t[1], t[0]];
      var half = (w.n - 1) / 2 * w.sp + 3, r = wide ? 9 : 7, d = half + 10 + r;
      var cx = p.x + n[0] * d, cy = p.y + n[1] * d;
      var g = svgEl('g', {class: 'cap'}, w.g);
      svgEl('line', {x1: (p.x + n[0] * half).toFixed(1), y1: (p.y + n[1] * half).toFixed(1), x2: (cx - n[0] * r).toFixed(1), y2: (cy - n[1] * r).toFixed(1), class: 'cap-leg'}, g);
      svgEl('circle', {cx: cx.toFixed(1), cy: cy.toFixed(1), r: r, class: 'cap-body'}, g);
      svgEl('path', {d: 'M ' + (cx - r * 0.55).toFixed(1) + ' ' + (cy - r * 0.15).toFixed(1) + ' A ' + (r * 0.6) + ' ' + (r * 0.6) + ' 0 0 1 ' + (cx + r * 0.55).toFixed(1) + ' ' + (cy - r * 0.15).toFixed(1), class: 'cap-mark'}, g);
    }
    if (wide) { [P0, AB, BC, CD, DE, P1, P3].forEach(function (w, i) { cap(w, i % 2 ? 0.62 : 0.4); }); }
    else { [P0, P1, P3].forEach(function (w) { cap(w, 0.5); }); }

    // ---------- piedini: la forma del chip decide dove stanno
    function pinsRow(nd, x0, x1, y, horiz, size) {
      var count = Math.max(4, Math.floor((x1 - x0) / (size.step)));
      for (var i = 0; i < count; i++) {
        var p = x0 + (i + 0.5) * (x1 - x0) / count;
        var attrs = horiz ? {x: (p - size.w / 2).toFixed(1), y: y, width: size.w, height: size.h}
                          : {x: y, y: (p - size.w / 2).toFixed(1), width: size.h, height: size.w};
        attrs.rx = 1.4; attrs.class = 'b-pin';
        nd.pins.push(svgEl('rect', attrs, gPins));
      }
    }
    function pins(nd, shape) {
      var r = nd.r, std = {w: 6, h: 9, step: 26};
      if (shape === 'cpu') {
        pinsRow(nd, r.l + 20, r.r - 20, r.t - 11, true, std); pinsRow(nd, r.l + 20, r.r - 20, r.b + 2, true, std);
        pinsRow(nd, r.t + 20, r.b - 20, r.l - 11, false, std); pinsRow(nd, r.t + 20, r.b - 20, r.r + 2, false, std);
      } else if (shape === 'ram') {
        pinsRow(nd, r.l + 14, r.r - 14, r.b + 2, true, {w: 4, h: 10, step: 10});
      } else if (shape === 'small') {
        pinsRow(nd, r.t + 18, r.b - 18, r.l - 11, false, std); pinsRow(nd, r.t + 18, r.b - 18, r.r + 2, false, std);
      } else {
        pinsRow(nd, r.l + 24, r.r - 24, r.t - 11, true, std); pinsRow(nd, r.l + 24, r.r - 24, r.b + 2, true, std);
      }
    }
    ['a', 'b', 'c', 'd', 'e'].forEach(function (k) { pins(N[k], N[k].el.getAttribute('data-shape')); });

    // cosa arriva in ogni componente quando va a fuoco
    N.a.cargo = 'card'; N.b.cargo = 'card'; N.c.cargo = 'card'; N.d.cargo = 'price'; N.e.cargo = 'price';
    ['gantt', 'people', 'faq', 'form'].forEach(function (k) { N[k].cargo = 'dot'; });

    light(N.hero);
    N.gantt.open = N.gantt.el.classList.contains('is-open');
    if (FERMO) { N.gantt.open = true; N.gantt.el.classList.add('is-open'); }
    sc.wires.forEach(function (w) { if (acceso[w.key] || FERMO) finish(w); });
    if (FERMO) sc.list.forEach(light);
    return sc;
  }

  function finish(w) {
    w.state = 2;
    w.paths.forEach(function (p) { p.glow.style.strokeDashoffset = 0; p.base.style.strokeDashoffset = 0; });
    w.g.classList.add('on');
    w.head.style.opacity = 0; w.halo.style.opacity = 0;
    acceso[w.key] = true;
    if (w.into) light(w.into);
  }
  function light(nd) {
    if (!nd || nd.lit) return;
    nd.lit = true;
    nd.litAt = performance.now() / 1000;
    nd.el.classList.add('is-lit');
    nd.pins.forEach(function (p) { p.classList.add('lit'); });
  }
  function hit(nd) {
    if (!nd) return;
    nd.el.classList.add('is-hit');
    clearTimeout(nd.hitT);
    nd.hitT = setTimeout(function () { nd.el.classList.remove('is-hit'); }, 500);
  }
  function video(nd) { return nd && nd.el.querySelector ? nd.el.querySelector('.pkg-media video') : null; }
  function play(v) { if (!v || v.hasAttribute('data-fermo')) return; var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  function setFocus(sc, nd, t) {
    if (nd === focus) return;
    if (focus) {
      focus.el.classList.remove('is-focus');
      focus.pins.forEach(function (p) { p.classList.remove('on'); });
      var v0 = video(focus); if (v0) v0.pause();
    }
    focus = nd; focusAt = t;
    if (!nd) return;
    nd.el.classList.add('is-focus');
    play(video(nd));
    if (FERMO) { nd.pins.forEach(function (p) { p.classList.add('on'); }); return; }
    // arriva qualcosa dal componente precedente
    var w = nd.in;
    if (w && w.state === 2 && nd.cargo && sc.packets.length < 3) packet(sc, w, nd.cargo);
  }

  function packet(sc, w, kind) {
    var e = document.createElement('div');
    if (kind === 'card') { e.className = 'pk pk-card'; e.style.backgroundImage = 'url(' + CARTA + ')'; }
    else if (kind === 'price') { e.className = 'pk pk-price'; e.textContent = PREZZO; }
    else e.className = 'pk pk-dot';
    fx.appendChild(e);
    sc.packets.push({e: e, w: w, dur: clamp(w.midLen / 520, 0.8, 2.4), t0: performance.now() / 1000});
  }

  var raf = 0;
  function tick(nowMs) {
    raf = 0;
    var sc = S;
    if (!sc || document.hidden) return;
    var t = nowMs / 1000, dt = lastT ? Math.min(0.1, t - lastT) : 0.016;
    lastT = t;
    var vy = window.pageYOffset, vh = window.innerHeight;

    // energia dallo scorrimento: sale con i pixel scorsi, cala da sola
    energy = clamp(energy * Math.exp(-dt / 0.9) + Math.abs(vy - lastY) / 900, 0, 1);
    lastY = vy;
    phase += (10 + 260 * energy) * dt;

    var front = vy + vh * 0.75;
    for (var i = 0; i < sc.wires.length; i++) {
      var w = sc.wires[i];
      if (w.state === 0) {
        var dep = w.deps[0];
        var ready = w.both ? (w.both[0].lit && w.both[1].lit && t - Math.max(w.both[0].litAt, w.both[1].litAt) > 0.6)
          : !dep || (dep.state === 2 && dep.into && dep.into.litAt != null && t - dep.into.litAt >= w.delay);
        if (ready && front >= w.y) {
          if (w.cls === 'sig') finish(w);
          else { w.state = 1; w.t0 = t; w.dur = clamp(w.len / 1200, 0.35, 1.4); }
        }
      }
      if (w.state === 1) {
        var u = ease((t - w.t0) / w.dur);
        for (var k = 0; k < w.paths.length; k++) {
          var p = w.paths[k];
          p.glow.style.strokeDashoffset = p.len * (1 - u); p.base.style.strokeDashoffset = p.len * (1 - u);
        }
        var hp = w.mid.getPointAtLength(w.midLen * u);
        w.head.setAttribute('cx', hp.x); w.head.setAttribute('cy', hp.y); w.head.style.opacity = 1;
        w.halo.setAttribute('cx', hp.x); w.halo.setAttribute('cy', hp.y); w.halo.style.opacity = 1;
        if (u >= 1) finish(w);
      }
      // piste accese in vista: perla tenue; lime solo quelle che entrano ed escono dal componente a fuoco.
      // Il flusso corre con l'energia dello scorrimento.
      var near = !!(w.state === 2 && focus && (w.into === focus || w.from === focus));
      if (near !== !!w.hot) { w.hot = near; w.g.classList.toggle('hot', near); }
      if (w.state === 2 && w.y1 > vy - 80 && w.y0 < vy + vh + 80) {
        w.g.style.opacity = near ? 1 : (0.55 + 0.45 * energy).toFixed(3);
        var fo = (near ? 0.45 : 0.15) + 0.5 * energy;
        if (w.cls === 'sig') { w.paths[0].base.style.strokeDashoffset = (-phase * 0.7).toFixed(1); continue; }
        if (w.cls === 'data' && sc.packets.length < 6 && t - (w.lastPk || 0) > 3.2 + (w.key.length % 3)) { w.lastPk = t; packet(sc, w, 'dot'); }
        for (var f = 0; f < w.flows.length; f++) {
          w.flows[f].style.strokeDashoffset = (-phase - f * 7).toFixed(1);
          w.flows[f].style.opacity = fo.toFixed(3);
        }
      }
    }

    // fuoco: il componente acceso più vicino al centro dello schermo
    var yc = vy + vh * 0.5, best = null, bd = Infinity;
    for (var n = 0; n < sc.list.length; n++) {
      var nd = sc.list[n];
      if (!nd.lit) continue;
      var r = nd.r, d = yc < r.t ? r.t - yc : yc > r.b ? yc - r.b : 0;
      if (d < bd) { bd = d; best = nd; }
    }
    if (bd > vh * 0.42) best = null;
    setFocus(sc, best, t);
    // il mazzo del metodo si scopre quando è sullo schermo e si richiude quando lo si lascia
    var dk = sc.nodes.gantt;
    if (dk && dk.lit) {
      var dr = dk.r, dc = (dr.t + dr.b) / 2, inMid = dc > vy + vh * 0.2 && dc < vy + vh * 0.7, gone = dr.b < vy || dr.t > vy + vh;
      if (inMid && !dk.open) { dk.open = true; dk.el.classList.add('is-open'); }
      else if (gone && dk.open) { dk.open = false; dk.el.classList.remove('is-open'); }
    }
    if (focus && focus.pins.length) {               // i piedini si riempiono finché si resta sul componente
      var on = Math.floor(focus.pins.length * clamp((t - focusAt) / 2.4, 0, 1));
      for (var pi = 0; pi < focus.pins.length; pi++) focus.pins[pi].classList.toggle('on', pi < on);
    }

    for (var j = sc.packets.length - 1; j >= 0; j--) {
      var pk = sc.packets[j], uu = (t - pk.t0) / pk.dur;
      if (uu >= 1) { hit(pk.w.into); pk.e.remove(); sc.packets.splice(j, 1); continue; }
      var s = (uu < 0.5 ? 2 * uu * uu : 1 - Math.pow(-2 * uu + 2, 2) / 2) * pk.w.midLen;
      var pt = pk.w.mid.getPointAtLength(s);
      var scl = uu < 0.1 ? 0.6 + uu / 0.1 * 0.4 : uu > 0.9 ? 1 - (uu - 0.9) / 0.1 * 0.5 : 1;
      pk.e.style.transform = 'translate(' + pt.x.toFixed(1) + 'px,' + pt.y.toFixed(1) + 'px) translate(-50%,-50%) scale(' + scl.toFixed(3) + ')';
      pk.e.style.opacity = uu > 0.9 ? (1 - (uu - 0.9) / 0.1).toFixed(3) : 1;
    }
    loop();
  }
  function loop() { if (!raf) raf = requestAnimationFrame(FERMO ? still : tick); }
  // con "riduci movimento" si aggiorna solo il fuoco, senza animazioni
  function still() {
    raf = 0;
    var sc = S;
    if (!sc) return;
    var vy = window.pageYOffset, vh = window.innerHeight, yc = vy + vh * 0.5, best = null, bd = Infinity;
    sc.list.forEach(function (nd) { var r = nd.r, d = yc < r.t ? r.t - yc : yc > r.b ? yc - r.b : 0; if (d < bd) { bd = d; best = nd; } });
    setFocus(sc, bd > vh * 0.42 ? null : best, 0);
  }

  // ---------- ricalcolo quando cambia l'impaginazione
  var lastW = 0, lastH = 0, rebuildT = 0;
  function rebuild(force) {
    var W = document.documentElement.clientWidth, H = document.body.scrollHeight;
    if (!force && W === lastW && Math.abs(H - lastH) < 8) return;
    lastW = W; lastH = H;
    if (S) S.packets.forEach(function (p) { p.e.remove(); });
    if (focus) { focus.el.classList.remove('is-focus'); var v = video(focus); if (v) v.pause(); focus = null; }
    S = build();
    loop();
  }
  function soon() { clearTimeout(rebuildT); rebuildT = setTimeout(function () { rebuild(false); }, 180); }

  rebuild(true);
  window.addEventListener('resize', soon);
  window.addEventListener('load', function () { rebuild(true); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { rebuild(true); });
  if ('ResizeObserver' in window) new ResizeObserver(soon).observe(document.body);
  window.addEventListener('scroll', loop, {passive: true});
  document.addEventListener('visibilitychange', loop);
})();
