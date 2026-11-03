// Data layer: loads the lexicon (expert knowledge) and works (NGA data with
// pre-computed attribute evidence), and provides the small analytics the views use.

export const MEDIA = {
  all: { label: 'All media', test: () => true },
  painting: { label: 'Paintings', test: (w) => w.c === 'Painting' },
  paper: { label: 'Prints & drawings', test: (w) => w.c === 'Print' || w.c === 'Drawing' },
  sculpture: { label: 'Sculpture & objects', test: (w) => w.c === 'Sculpture' || w.c === 'Decorative Art' },
};

// Two styles of visual description appear in the NGA data: long, expert-written texts
// (mostly for paintings) and brief texts with formulaic openings ("The image shows…").
const BRIEF = /^(The (image|artwork|print|drawing|painting|sculpture|engraving|etching|woodcut|photograph)\b|This (is|image|artwork|print|drawing|painting|engraving|etching|woodcut|sculpture|photograph)\b)/;
export const isBrief = (w) => BRIEF.test(w.alt);
export const STYLES = {
  all: { label: 'Any description', test: () => true },
  detailed: { label: 'Detailed descriptions', test: (w) => w.alt && !isBrief(w) },
  brief: { label: 'Brief descriptions', test: (w) => w.alt && isBrief(w) },
};

let state = null;

export async function loadData() {
  if (state) return state;
  const [lex, data] = await Promise.all([
    fetch('data/lexicon.json').then((r) => r.json()),
    fetch('data/works.json').then((r) => r.json()),
  ]);
  const compile = (a) => ({ ...a, rx: a.patterns.map((p) => new RegExp(p, 'i')) });
  const universal = lex.universal.map(compile);
  const saints = lex.saints.map((s) => ({
    ...s,
    attrs: [...s.attributes.map(compile), ...universal],
    nameRx: new RegExp(s.title, 'gi'),
  }));
  const byId = Object.fromEntries(saints.map((s) => [s.id, s]));
  const works = data.works;
  const workById = new Map(works.map((w) => [w.id, w]));
  state = { saints, byId, works, workById, meta: data, universal };
  return state;
}

/** Works for one saint, after the user's filters. */
export function worksFor(saintId, { solo = true, medium = 'all', needDesc = false } = {}) {
  const test = MEDIA[medium].test;
  return state.works.filter(
    (w) => w.saints.includes(saintId) && (!solo || w.solo) && test(w) && (!needDesc || w.alt)
  );
}

/** Half-century bin label for a year, e.g. 1487 -> 1450. */
export const bin50 = (y) => Math.floor(y / 50) * 50;
export const bin100 = (y) => Math.floor(y / 100) * 100;

export function binLabel(start, size = 50) {
  if (size === 100) return `${start}s`;
  return `${start}–${String(start + size - 1).slice(-2)}`;
}

/** Share of works (with a description) that show each attribute, per time bin. */
export function attributeMatrix(saint, works, size = 50) {
  const withDesc = works.filter((w) => w.alt);
  const bins = new Map();
  for (const w of withDesc) {
    const b = Math.floor(w.y / size) * size;
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(w);
  }
  const cols = [...bins.keys()].sort((a, b) => a - b);
  const rows = saint.attrs.map((a) => ({
    attr: a,
    total: withDesc.filter((w) => w.hits[saint.id][a.id]).length,
    cells: cols.map((c) => {
      const ws = bins.get(c);
      const k = ws.filter((w) => w.hits[saint.id][a.id]).length;
      return { bin: c, n: ws.length, k, p: ws.length ? k / ws.length : 0 };
    }),
  }));
  return { cols, rows, n: withDesc.length, size };
}

/** Pick a representative image for a saint card: a single-saint work with the most clues. */
export function representative(saint) {
  const ws = worksFor(saint.id, { solo: true }).filter((w) => w.alt);
  const score = (w) =>
    Object.keys(w.hits[saint.id]).filter((k) => k !== 'halo').length * 2 +
    (w.c === 'Painting' ? 3 : 0) + (w.w && w.w > 1500 ? 1 : 0);
  return ws.sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
}

export function iiif(w, size = 400) {
  return `${w.img}/full/!${size},${size}/0/default.jpg`;
}

export function ngaUrl(w) {
  return `https://www.nga.gov/collection/art-object-page.${w.id}.html`;
}

/** All attribute matches in a description, as non-overlapping spans, for highlighting. */
export function highlightSpans(text, saint) {
  const spans = [];
  for (const a of saint.attrs) {
    for (const rx of a.rx) {
      const g = new RegExp(rx.source, 'gi');
      let m;
      while ((m = g.exec(text))) {
        if (m[0].length === 0) { g.lastIndex++; continue; }
        spans.push({ start: m.index, end: m.index + m[0].length, attr: a });
      }
    }
  }
  spans.sort((x, y) => x.start - y.start || y.end - x.end);
  const out = [];
  let last = -1;
  for (const s of spans) if (s.start >= last) { out.push(s); last = s.end; }
  return out;
}

/** Deterministic shuffle helper for the game (seeded so a session is reproducible). */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
