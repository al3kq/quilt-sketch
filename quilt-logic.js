/* Quilt Sketch: pure logic (geometry, cutting and yardage estimates). No DOM, so it can be tested in Node.
 * Units are inches unless noted. Blocks are drawn in a 100 x 100 unit square.
 */
(function (root) {
  'use strict';

  var FR = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
  function eighths(x) { return Math.round(x * 8); }
  function ceilEighth(x) { return Math.ceil(x * 8 - 1e-9) / 8; }
  /** 6.5 -> "6½", 8.875 -> "8⅞", 0.5 -> "½", 3 -> "3" */
  function fmtIn(x) {
    var e = eighths(x), w = Math.floor(e / 8), f = e % 8;
    return (w || !f ? String(w) : '') + FR[f];
  }

  // ---------- geometry ----------
  var SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100]];
  var LOWER_RIGHT = [[100, 0], [100, 100], [0, 100]];
  /** Quarter turns clockwise about the block centre (screen coordinates, y down). */
  function turn(pts, r) {
    var out = pts.map(function (p) { return [p[0], p[1]]; });
    for (var i = 0; i < ((r % 4) + 4) % 4; i++) out = out.map(function (p) { return [100 - p[1], p[0]]; });
    return out;
  }
  /** Shapes to paint for one block, bottom to top. A square, or a half-square triangle. */
  function shapes(b) {
    if (b.k === 's') return [{ fab: b.a, pts: SQUARE }];
    return [{ fab: b.a, pts: SQUARE }, { fab: b.b, pts: turn(LOWER_RIGHT, b.r) }];
  }

  // ---------- cutting and yardage ----------
  /**
   * Estimate for the quilt top, borders, binding and backing.
   * q: { rows, cols, inches, blocks:[{k,a,b,r}], borders:[{w,f}] }   (borders[0] is innermost)
   * o: { usable: usable fabric width in inches (default 40), extra: waste allowance (default 0.10) }
   * Assumptions: 1/4" seams; squares cut at finished + 1/2"; half-square triangles made two at a time from
   * a pair of squares cut at finished + 7/8"; borders cut strips of finished width + 1/2" and joined end to end.
   */
  function plan(q, o) {
    o = o || {};
    var usable = o.usable || 40, extra = o.extra == null ? 0.10 : o.extra;
    var f = q.inches, byFab = {};
    function slot(fab) { return byFab[fab] || (byFab[fab] = { fab: fab, cuts: [], inches: 0 }); }
    function cutEntry(fab, kind, cut) {
      var s = slot(fab);
      for (var i = 0; i < s.cuts.length; i++) if (s.cuts[i].kind === kind && s.cuts[i].cut === cut) return s.cuts[i];
      var e = { kind: kind, cut: cut, count: 0, blocks: 0, mates: [], strips: 0, perStrip: 0 };
      s.cuts.push(e); return e;
    }

    var pairs = {};
    q.blocks.forEach(function (b) {
      if (b.k === 's' || b.a === b.b) { cutEntry(b.a, 'square', f + 0.5).count += 1; }
      else { var lo = Math.min(b.a, b.b), hi = Math.max(b.a, b.b), key = lo + ',' + hi; pairs[key] = (pairs[key] || 0) + 1; }
    });
    Object.keys(pairs).forEach(function (key) {
      var ab = key.split(',').map(Number), n = pairs[key], sq = Math.ceil(n / 2);
      [[ab[0], ab[1]], [ab[1], ab[0]]].forEach(function (pr) {
        var e = cutEntry(pr[0], 'hst', f + 7 / 8);
        e.count += sq; e.blocks += n; if (e.mates.indexOf(pr[1]) < 0) e.mates.push(pr[1]);
      });
    });

    var W = q.cols * f, H = q.rows * f;
    var borders = (q.borders || []).map(function (b) {
      var cut = b.w + 0.5, total = 2 * H + 2 * (W + 2 * b.w) + 4;
      var strips = Math.ceil(total / (usable - 1));
      var e = cutEntry(b.f, 'border', cut); e.count += strips; e.strips += strips;
      W += 2 * b.w; H += 2 * b.w;
      return { fab: b.f, w: b.w, cut: cut, strips: strips, length: total };
    });

    var fabrics = Object.keys(byFab).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
      var s = byFab[k];
      s.cuts.forEach(function (c) {
        if (c.kind === 'border') { s.inches += c.strips * c.cut; return; }
        c.perStrip = Math.max(1, Math.floor(usable / c.cut));
        c.strips = Math.ceil(c.count / c.perStrip);
        s.inches += c.strips * c.cut;
      });
      s.yards = ceilEighth(s.inches / 36);
      s.buy = ceilEighth(s.inches / 36 * (1 + extra));
      return s;
    });

    var perim = 2 * (W + H) + 10, bStrips = Math.ceil(perim / (usable - 1));
    var binding = { strips: bStrips, cut: 2.5, yards: ceilEighth(bStrips * 2.5 / 36) };

    var bw = W + 8, bh = H + 8;
    var a = { panels: Math.ceil(bw / usable), length: bh }, b2 = { panels: Math.ceil(bh / usable), length: bw };
    a.yards = ceilEighth(a.panels * a.length / 36); b2.yards = ceilEighth(b2.panels * b2.length / 36);
    var backing = a.yards <= b2.yards ? { panels: a.panels, length: a.length, yards: a.yards, seams: a.panels - 1, runs: 'top to bottom' }
                                      : { panels: b2.panels, length: b2.length, yards: b2.yards, seams: b2.panels - 1, runs: 'side to side' };
    return { usable: usable, extra: extra, top: { w: W, h: H }, fabrics: fabrics, borders: borders, binding: binding, backing: backing };
  }

  var api = { fmtIn: fmtIn, fmtYd: fmtIn, ceilEighth: ceilEighth, turn: turn, shapes: shapes, plan: plan, SQUARE: SQUARE, LOWER_RIGHT: LOWER_RIGHT };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QuiltLogic = api;
})(typeof self !== 'undefined' ? self : this);
