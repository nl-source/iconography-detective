import {
  loadData, worksFor, attributeMatrix, representative, iiif, ngaUrl, highlightSpans,
  MEDIA, STYLES, isBrief, bin50, bin100, binLabel, rng,
} from './data.js';
import { heatmap, bars, hbars, bindTips } from './charts.js';

const $main = document.getElementById('main');
const $dlg = document.getElementById('work-dialog');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (p) => `${Math.round(p * 100)}%`;
let D; // loaded data

// ---------------------------------------------------------------- router
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
}

async function route() {
  if (!D) D = await loadData();
  const { parts, q } = parseHash();
  const view = parts[0] || 'casebook';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === (view === 'saint' ? 'casebook' : view);
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (view === 'saint' && D.byId[parts[1]]) renderSaint(D.byId[parts[1]], q);
  else if (view === 'game') renderGame();
  else if (view === 'patterns') renderPatterns(q);
  else if (view === 'method') renderMethod();
  else renderCasebook();
  const w = q.get('work');
  if (!w && $dlg.open) $dlg.close();
  if (w && D.workById.get(+w)) openWork(D.workById.get(+w), q.get('saint') || parts[1]);
  bindTips($main);
}

function setTitle(t) {
  document.title = t ? `${t} · Iconography Detective` : 'Iconography Detective';
}
function scrollTop() {
  window.scrollTo({ top: 0 });
  $main.focus({ preventScroll: true });
}

function img(w, size, cls = '', alt = '') {
  return `<img class="${cls}" src="${iiif(w, size)}" alt="${esc(alt)}" loading="lazy" decoding="async"
    width="${w.w && w.h ? Math.round(size * Math.min(1, w.w / w.h)) : size}"
    height="${w.w && w.h ? Math.round(size * Math.min(1, w.h / w.w)) : size}"
    onerror="this.classList.add('img-failed');this.removeAttribute('src')">`;
}

function clueChips(w, saint, { limit = 99, withHalo = true } = {}) {
  const hits = w.hits[saint.id] || {};
  return saint.attrs
    .filter((a) => hits[a.id] && (withHalo || a.id !== 'halo'))
    .slice(0, limit)
    .map((a) => `<span class="chip${a.id === 'halo' ? ' chip-halo' : ''}">${esc(a.label)}</span>`)
    .join('');
}

// ---------------------------------------------------------------- casebook
function renderCasebook() {
  setTitle('');
  const total = D.works.length;
  const described = D.works.filter((w) => w.alt).length;
  const cards = D.saints
    .map((s) => {
      const rep = representative(s);
      const ws = worksFor(s.id, { solo: false });
      const top = s.attributes.slice(0, 3).map((a) => a.label).join(' · ');
      return `<a class="saint-card" href="#/saint/${s.id}">
        <div class="thumb">${rep ? img(rep, 400, '', `${rep.t}, ${rep.a}`) : ''}</div>
        <div class="saint-card-text">
          <h3>${esc(s.name)}</h3>
          <p class="muted">${esc(s.dates)} · ${ws.length} works</p>
          <p class="attrs">${esc(top)}</p>
        </div>
      </a>`;
    })
    .join('');
  $main.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Module 5 · Art History</p>
      <h1>How do you know who you're looking at?</h1>
      <p class="lede">For most of European history, a painted saint was identified the way we identify a logo: by an <em>attribute</em>. A lion means Jerome. A spiked wheel means Catherine. Arrows mean Sebastian. Art historians call the reading of these signs <strong>iconography</strong>.</p>
      <p>This site follows ${D.saints.length} saints through <strong>${total.toLocaleString()} works</strong> in the National Gallery of Art, from ${D.meta.years[0]} to ${D.meta.years[1]}. For ${described.toLocaleString()} of them the museum has published a written visual description. A deterministic text search looks through those descriptions for each saint's traditional attributes, so you can see <em>which clues artists kept, which they dropped, and when</em>.</p>
      <div class="hero-actions">
        <a class="btn primary" href="#/game">Test your eye: Who is this saint?</a>
        <a class="btn" href="#/patterns">See the patterns across six centuries</a>
      </div>
    </section>
    <section>
      <h2 class="section-title">The casebook</h2>
      <p class="muted">Pick a saint to see their field guide, a timeline of their attributes, and every work in the dataset.</p>
      <div class="saint-grid">${cards}</div>
    </section>`;
  scrollTop();
}

// ---------------------------------------------------------------- saint page
function renderSaint(s, q) {
  setTitle(s.name);
  const medium = MEDIA[q.get('m')] ? q.get('m') : 'all';
  const solo = q.get('group') !== '1';
  const ws = worksFor(s.id, { solo, medium });
  const mtx = attributeMatrix(s, ws, 50);
  const link = (patch) => {
    const p = new URLSearchParams({ ...(medium !== 'all' && { m: medium }), ...(!solo && { group: '1' }), ...patch });
    for (const [k, v] of [...p]) if (v === '' || v == null) p.delete(k);
    const qs = p.toString();
    return `#/saint/${s.id}${qs ? `?${qs}` : ''}`;
  };

  const guide = mtx.rows
    .map(({ attr, total }) => {
      const p = mtx.n ? total / mtx.n : 0;
      return `<li class="guide-item">
        <div class="guide-head"><strong>${esc(attr.label)}</strong><span class="guide-pct" title="${total} of ${mtx.n} described works">${pct(p)}</span></div>
        <div class="meter" aria-hidden="true"><span style="width:${(p * 100).toFixed(1)}%"></span></div>
        <p>${esc(attr.why)}</p>
      </li>`;
    })
    .join('');

  // timeline grouped by century
  const byCentury = new Map();
  for (const w of ws) {
    const c = bin100(w.y);
    if (!byCentury.has(c)) byCentury.set(c, []);
    byCentury.get(c).push(w);
  }
  const timeline = [...byCentury.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([c, list]) => `<section class="century">
        <h3 class="century-label"><span>${c}s</span><small>${list.length} work${list.length === 1 ? '' : 's'}</small></h3>
        <div class="work-grid">${list
          .map(
            (w) => `<button class="work-card" data-work="${w.id}" aria-label="Open ${esc(w.t)}">
              <div class="thumb">${img(w, 300, '', '')}</div>
              <div class="work-meta">
                <span class="date">${esc(w.d || w.y)}</span>
                <span class="title">${esc(w.t)}</span>
                <span class="artist">${esc(w.a)}</span>
                <span class="chips">${w.alt ? clueChips(w, s, { limit: 4 }) : '<span class="chip chip-none">No description</span>'}</span>
              </div>
            </button>`
          )
          .join('')}</div>
      </section>`
    )
    .join('');

  const filters = `
    <div class="filters" role="group" aria-label="Filters">
      <div class="seg" role="group" aria-label="Medium">${Object.entries(MEDIA)
        .map(([k, m]) => `<a class="seg-btn${k === medium ? ' on' : ''}" href="${link({ m: k === 'all' ? '' : k })}" ${k === medium ? 'aria-current="true"' : ''}>${m.label}</a>`)
        .join('')}</div>
      <a class="toggle${!solo ? ' on' : ''}" href="${link({ group: solo ? '1' : '' })}" role="switch" aria-checked="${!solo}">
        <span class="switch" aria-hidden="true"></span> Include group scenes
      </a>
    </div>`;

  $main.innerHTML = `
    <p class="crumb"><a href="#/">← Casebook</a></p>
    <header class="saint-header">
      <h1>${esc(s.name)}</h1>
      <p class="muted">${esc(s.dates)}</p>
      <p class="lede">${esc(s.blurb)}</p>
    </header>
    ${filters}
    <p class="filter-note muted">${ws.length} works (${mtx.n} with a written description). ${solo ? `Showing works where ${esc(s.name)} is the only saint named in the title, so the clues are most likely theirs.` : 'Group scenes included: some clues may belong to other figures in the picture.'}</p>
    ${ws.length === 0 ? '<p class="empty">No works match these filters.</p>' : `
    <div class="two-col">
      <section class="panel">
        <h2>Field guide</h2>
        <p class="muted small">Traditional attributes, and the share of described works where the text search found each one.</p>
        <ol class="guide">${guide}</ol>
      </section>
      <section class="panel">
        <h2>When do the clues appear?</h2>
        <p class="muted small">Each cell: share of works from that half-century whose description mentions the attribute. Hover or focus a cell for counts.</p>
        ${mtx.n ? heatmap(mtx, s.name) : '<p class="empty">No described works with these filters.</p>'}
      </section>
    </div>
    <h2 class="section-title">Case files</h2>
    <p class="muted">Every work in the dataset, in date order. Select one to read its description with the clues highlighted.</p>
    ${timeline}`}`;

  $main.querySelectorAll('[data-work]').forEach((b) =>
    b.addEventListener('click', () => openWork(D.workById.get(+b.dataset.work), s.id))
  );
  scrollTop();
}

// ---------------------------------------------------------------- work dialog
function describeWithHighlights(text, saint) {
  const spans = highlightSpans(text, saint);
  let out = '', i = 0;
  for (const sp of spans) {
    out += esc(text.slice(i, sp.start));
    out += `<mark title="${esc(sp.attr.label)}">${esc(text.slice(sp.start, sp.end))}</mark>`;
    i = sp.end;
  }
  return out + esc(text.slice(i));
}

function openWork(w, saintId) {
  const sid = w.saints.includes(saintId) ? saintId : w.saints[0];
  const s = D.byId[sid];
  const hits = w.hits[sid] || {};
  const evidence = s.attrs
    .filter((a) => hits[a.id])
    .map((a) => {
      const [src, sent, i, j] = hits[a.id];
      const srcLabel = { desc: 'description', kw: 'NGA keyword', title: 'title' }[src];
      return `<li><span class="chip${a.id === 'halo' ? ' chip-halo' : ''}">${esc(a.label)}</span>
        <q>${esc(sent.slice(0, i))}<mark>${esc(sent.slice(i, j))}</mark>${esc(sent.slice(j))}</q> <small class="muted">(${srcLabel})</small></li>`;
    })
    .join('');
  const others = w.saints.filter((x) => x !== sid).map((x) => D.byId[x]);
  $dlg.querySelector('.dlg-body').innerHTML = `
    <button class="dlg-close" aria-label="Close">×</button>
    <div class="dlg-grid">
      <figure class="dlg-figure">
        <a href="${w.img}/full/full/0/default.jpg" target="_blank" rel="noopener">${img(w, 900, 'dlg-img', `${w.t}, ${w.a}`)}</a>
        <figcaption class="muted small">Image: National Gallery of Art, Washington (open access). Select to open full size.</figcaption>
      </figure>
      <div class="dlg-text">
        <p class="eyebrow">${esc(w.c)} · ${esc(w.d || w.y)}</p>
        <h2 id="dlg-title">${esc(w.t)}</h2>
        <p class="artist">${esc(w.a)}</p>
        <p class="muted small">${esc(w.m)}</p>
        ${others.length ? `<p class="small">Also in this work: ${others.map((o) => `<a href="#/saint/${o.id}?work=${w.id}">${esc(o.name)}</a>`).join(', ')}</p>` : ''}
        <h3>Clues found for ${esc(s.name)}</h3>
        ${evidence ? `<ul class="evidence">${evidence}</ul>` : '<p class="muted">None of the attributes in the field guide were found in the text.</p>'}
        ${w.alt ? `<h3>The museum's visual description</h3><p class="desc">${describeWithHighlights(w.alt, s)}</p>` : '<p class="muted">The museum has not published a visual description for this image.</p>'}
        ${w.kw.length ? `<p class="small"><strong>NGA keywords:</strong> ${w.kw.map(esc).join(', ')}</p>` : ''}
        <p><a class="btn" href="${ngaUrl(w)}" target="_blank" rel="noopener">View on nga.gov ↗</a></p>
      </div>
    </div>`;
  $dlg.querySelector('.dlg-close').addEventListener('click', () => $dlg.close());
  if (!$dlg.open) $dlg.showModal();
}
$dlg.addEventListener('click', (e) => { if (e.target === $dlg) $dlg.close(); });
$dlg.addEventListener('close', () => {
  const { parts, q } = parseHash();
  if (q.has('work')) {
    q.delete('work'); q.delete('saint');
    const qs = q.toString();
    history.replaceState(null, '', `#/${parts.join('/')}${qs ? `?${qs}` : ''}`);
  }
});

// ---------------------------------------------------------------- game
const game = { mode: 'image', score: 0, total: 0, streak: 0, best: 0, rand: rng(Date.now() % 100000), current: null };

function gamePool() {
  return D.works.filter(
    (w) => w.solo && w.alt && Object.keys(w.hits[w.saints[0]]).filter((k) => k !== 'halo').length >= 2
  );
}

function redact(text) {
  let out = text;
  for (const s of D.saints) {
    const rx = new RegExp(`\\b(?:(?:Saint|St\\.)\\s+)?(?:${s.title})\\w*`, 'gi');
    out = out.replace(rx, '▇▇▇▇');
  }
  return out.replace(/\b(Saint|St\.)\s+[A-Z]\w+/g, '▇▇▇▇');
}

function newCase() {
  const pool = gamePool();
  const r = game.rand;
  const w = pool[Math.floor(r() * pool.length)];
  const correct = w.saints[0];
  const ids = D.saints.map((s) => s.id).filter((id) => id !== correct);
  const choices = [correct];
  while (choices.length < 4) {
    const c = ids.splice(Math.floor(r() * ids.length), 1)[0];
    choices.push(c);
  }
  choices.sort(() => r() - 0.5);
  game.current = { w, correct, choices, hints: 0, answered: null };
}

function renderGame() {
  setTitle('Who is this saint?');
  if (!game.current) newCase();
  const { w, correct, choices, hints, answered } = game.current;
  const s = D.byId[correct];
  const clues = s.attrs.filter((a) => a.id !== 'halo' && w.hits[correct][a.id]);
  const shownHints = clues.slice(0, hints).map((a) => `<span class="chip">${esc(a.label)}</span>`).join('');

  const subject = game.mode === 'image'
    ? `<div class="game-img">${img(w, 800, '', 'An artwork showing an unidentified saint')}</div>`
    : `<blockquote class="game-desc">${esc(redact(w.alt))}</blockquote>`;

  const choiceBtns = choices
    .map((id) => {
      let cls = '';
      if (answered) cls = id === correct ? ' right' : id === answered ? ' wrong' : ' dim';
      return `<button class="choice${cls}" data-choice="${id}" ${answered ? 'disabled' : ''}>${esc(D.byId[id].name)}</button>`;
    })
    .join('');

  const reveal = answered
    ? `<div class="reveal ${answered === correct ? 'ok' : 'no'}" role="status">
        <h3>${answered === correct ? 'Correct.' : `Not quite — this is ${esc(s.name)}.`}</h3>
        <p><strong>${esc(w.t)}</strong>, ${esc(w.a)}, ${esc(w.d || w.y)}</p>
        <p class="small muted">The clues in the museum's description:</p>
        <ul class="evidence">${s.attrs
          .filter((a) => w.hits[correct][a.id])
          .map((a) => {
            const [, sent, i, j] = w.hits[correct][a.id];
            return `<li><span class="chip${a.id === 'halo' ? ' chip-halo' : ''}">${esc(a.label)}</span> <q>${esc(sent.slice(0, i))}<mark>${esc(sent.slice(i, j))}</mark>${esc(sent.slice(j))}</q><br><small class="muted">${esc(a.why)}</small></li>`;
          })
          .join('')}</ul>
        <div class="hero-actions">
          <button class="btn primary" id="next-case">Next case →</button>
          <a class="btn" href="#/saint/${correct}?work=${w.id}">Open the case file</a>
        </div>
      </div>`
    : `<div class="hint-row">
        <button class="btn" id="hint" ${hints >= clues.length ? 'disabled' : ''}>${hints ? 'Another clue' : 'Give me a clue'}</button>
        <span class="chips">${shownHints}</span>
      </div>`;

  $main.innerHTML = `
    <header class="game-header">
      <div>
        <p class="eyebrow">Detective mode</p>
        <h1>Who is this saint?</h1>
        <p class="muted">Every picture below has exactly one saint named in its title. Read the attributes.</p>
      </div>
      <div class="scoreboard" aria-live="polite">
        <div><b>${game.score}</b><span>/${game.total}</span><small>solved</small></div>
        <div><b>${game.streak}</b><small>streak</small></div>
        <div><b>${game.best}</b><small>best</small></div>
      </div>
    </header>
    <div class="seg mode" role="group" aria-label="Clue mode">
      <button class="seg-btn${game.mode === 'image' ? ' on' : ''}" data-mode="image" aria-pressed="${game.mode === 'image'}">Look at the image</button>
      <button class="seg-btn${game.mode === 'text' ? ' on' : ''}" data-mode="text" aria-pressed="${game.mode === 'text'}">Read the description only</button>
    </div>
    ${game.mode === 'text' ? '<p class="small muted">Description-only mode uses the museum\'s accessibility text with names blacked out. It asks: does the description carry enough iconography for a listener to identify the saint?</p>' : ''}
    <div class="game">
      <div class="game-subject">${subject}</div>
      <div class="game-side">
        <div class="choices">${choiceBtns}</div>
        ${reveal}
      </div>
    </div>`;

  $main.querySelectorAll('[data-choice]').forEach((b) =>
    b.addEventListener('click', () => {
      const pick = b.dataset.choice;
      game.current.answered = pick;
      game.total++;
      if (pick === correct) { game.score++; game.streak++; game.best = Math.max(game.best, game.streak); }
      else game.streak = 0;
      renderGame();
      document.querySelector('.reveal')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    })
  );
  $main.querySelector('#hint')?.addEventListener('click', () => { game.current.hints++; renderGame(); });
  $main.querySelector('#next-case')?.addEventListener('click', () => { newCase(); renderGame(); scrollTop(); });
  $main.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => { game.mode = b.dataset.mode; renderGame(); })
  );
}

// ---------------------------------------------------------------- patterns
function renderPatterns(q) {
  setTitle('Patterns');
  const medium = MEDIA[q.get('m')] ? q.get('m') : 'all';
  const style = STYLES[q.get('s')] ? q.get('s') : 'all';
  const keep = (w) => w.alt && MEDIA[medium].test(w) && STYLES[style].test(w);
  const hasHalo = (w) => w.saints.some((sid) => w.hits[sid].halo);
  const rate = (ws, f) => (ws.length ? ws.filter(f).length / ws.length : 0);
  const href = (patch) => {
    const p = new URLSearchParams({ ...(medium !== 'all' && { m: medium }), ...(style !== 'all' && { s: style }), ...patch });
    for (const [k, v] of [...p]) if (!v || v === 'all') p.delete(k);
    return `#/patterns${p.toString() ? `?${p}` : ''}`;
  };

  // 1. The disappearing halo
  const described = D.works.filter(keep);
  const hb = new Map();
  for (const w of described) {
    const b = bin50(w.y);
    if (!hb.has(b)) hb.set(b, { k: 0, n: 0 });
    const e = hb.get(b);
    e.n++;
    if (hasHalo(w)) e.k++;
  }
  const haloGroups = [...hb.entries()].sort((a, b) => a[0] - b[0])
    .map(([b, e]) => ({ label: binLabel(b), values: [{ ...e, p: e.n ? e.k / e.n : 0 }] }));
  const early = described.filter((w) => w.y < 1400), late = described.filter((w) => w.y >= 1500);

  // 2. Recognizability: signature attribute found in single-saint works
  const sig = D.saints
    .map((s) => {
      const ws = worksFor(s.id, { solo: true }).filter(keep);
      const a = s.attributes[0];
      const k = ws.filter((w) => w.hits[s.id][a.id]).length;
      return { label: s.name, sub: a.label, k, n: ws.length, p: ws.length ? k / ws.length : 0, href: `#/saint/${s.id}${medium !== 'all' ? `?m=${medium}` : ''}` };
    })
    .filter((x) => x.n >= 5)
    .sort((a, b) => b.p - a.p);
  const list = (xs) => xs.map((x) => `${esc(x.label.replace(/^Saint /, ''))} (${esc(x.sub)}, ${pct(x.p)})`).join(', ');

  // 3. Jerome: scholar vs penitent
  const jer = D.byId.jerome;
  const jws = worksFor('jerome', { solo: true }).filter(keep);
  const scholar = (w) => !!(w.hits.jerome.study || w.hits.jerome.cardinal || /study/i.test(w.t));
  const penitent = (w) => !!(w.hits.jerome.stone || w.hits.jerome.barechest || w.hits.jerome.wilderness || /penit|wilderness/i.test(w.t));
  const jb = new Map();
  for (const w of jws) {
    const b = w.y >= 1600 ? 1600 : Math.max(1400, bin100(w.y));
    if (!jb.has(b)) jb.set(b, []);
    jb.get(b).push(w);
  }
  const jGroups = [...jb.entries()].sort((a, b) => a[0] - b[0]).map(([b, ws]) => {
    const n = ws.length, ks = ws.filter(scholar).length, kp = ws.filter(penitent).length;
    return { label: b === 1600 ? '1600+' : b === 1400 ? 'before 1500' : `${b}s`, values: [{ k: ks, n, p: n ? ks / n : 0 }, { k: kp, n, p: n ? kp / n : 0 }] };
  });
  const jScholar = rate(jws, scholar), jPen = rate(jws, penitent);

  // 4. Who describes? Detailed vs brief descriptions (ignores the style filter)
  const solo = D.works.filter((w) => w.solo && w.alt && MEDIA[medium].test(w));
  const styleStats = ['detailed', 'brief'].map((st) => {
    const ws = solo.filter(STYLES[st].test);
    const sid = (w) => w.saints[0];
    const clues = ws.reduce((a, w) => a + Object.keys(w.hits[sid(w)]).filter((k) => k !== 'halo').length, 0);
    const named = ws.filter((w) => new RegExp(`\\b(Saint|St\\.)\\b|${D.byId[sid(w)].title}`, 'i').test(w.alt)).length;
    const paintings = ws.filter((w) => w.c === 'Painting').length;
    const words = ws.reduce((a, w) => a + w.alt.split(/\s+/).length, 0);
    return { st, n: ws.length, clues: ws.length ? clues / ws.length : 0, named: ws.length ? named / ws.length : 0, paintings: ws.length ? paintings / ws.length : 0, words: ws.length ? Math.round(words / ws.length) : 0 };
  });
  const [det, brf] = styleStats;
  const haloByStyle = ['detailed', 'brief'].map((st) => {
    const ws = D.works.filter((w) => w.alt && MEDIA[medium].test(w) && STYLES[st].test(w));
    return { st, early: ws.filter((w) => w.y < 1400), late: ws.filter((w) => w.y >= 1500) };
  });

  const seg = (key, opts, cur) => `<div class="seg" role="group" aria-label="${key === 'm' ? 'Medium' : 'Description style'}">${Object.entries(opts)
    .map(([k, o]) => `<a class="seg-btn${k === cur ? ' on' : ''}" href="${href({ [key]: k })}" ${k === cur ? 'aria-current="true"' : ''}>${o.label}</a>`)
    .join('')}</div>`;

  $main.innerHTML = `
    <header class="saint-header">
      <p class="eyebrow">Across the collection</p>
      <h1>Patterns</h1>
      <p class="lede">Questions an art historian might ask of the whole corpus, answered by counting. Every number below is recomputed live from the data. Use the filters to check whether a pattern survives when you hold the medium, or the kind of description, constant.</p>
    </header>
    <div class="filters">${seg('m', MEDIA, medium)}${seg('s', STYLES, style)}</div>
    <p class="filter-note muted">${described.length} described works match these filters.</p>

    <section class="panel finding">
      <h2>1. The disappearing halo</h2>
      <p>Share of works (any of the ${D.saints.length} saints) whose description mentions a halo, nimbus or rays of light. Before 1400: <strong>${pct(rate(early, hasHalo))}</strong> of ${early.length} works. From 1500 on: <strong>${pct(rate(late, hasHalo))}</strong> of ${late.length}.</p>
      ${bars({ groups: haloGroups, series: [{ name: 'Halo described', cls: 's1' }], title: 'Share of works with a halo, by half-century' })}
      <p class="small muted"><strong>Reading it:</strong> gold-ground panels of the 1300s give every saint a tooled gold disk. As Renaissance artists pursued natural light and space, the halo shrank to a thin ellipse or a faint glow, and often vanished, so holiness had to be shown through attributes, gesture and light. <strong>Is it real?</strong> Early works here are mostly paintings with detailed descriptions; later ones are mostly prints with brief descriptions. Use the filters: the decline should hold within each medium and each description style (see finding 4).</p>
    </section>

    <section class="panel finding">
      <h2>2. Which saints are easiest to recognize?</h2>
      <p>For each saint, the share of single-saint works whose description mentions their <em>signature</em> attribute (the first in their field guide). A high score means the defining sign was both depicted and noticed by whoever wrote the description.</p>
      ${sig.length ? hbars(sig) : '<p class="empty">Too few works with these filters.</p>'}
      ${sig.length >= 6 ? `<p class="small muted"><strong>Reading it:</strong> most recognizable here: ${list(sig.slice(0, 3))}. Least: ${list(sig.slice(-3).reverse())}. Saints whose attribute <em>is</em> the story, a dragon to fight or a child to carry, are described reliably. Small handheld objects are often missed or described generically ("holding an object", "a staff"). A score of zero can also mean the museum's works show a different episode: the NGA's images of Gregory are almost all the <em>Mass of Saint Gregory</em>, which has no dove.</p>` : ''}
    </section>

    <section class="panel finding">
      <h2>3. Jerome: scholar or penitent?</h2>
      <p>Single-saint works of ${esc(jer.name)} (${jws.length} described). <em>Scholar</em>: a study or interior, a cardinal's hat, or "study" in the title. <em>Penitent</em>: a stone, a bare chest, a wilderness, or "penitent/wilderness" in the title. A work can be both or neither. Overall: scholar ${pct(jScholar)}, penitent ${pct(jPen)}.</p>
      ${jws.length ? bars({ groups: jGroups, series: [{ name: 'Scholar', cls: 's1' }, { name: 'Penitent', cls: 's2' }], title: 'Jerome as scholar versus penitent, by century' }) : '<p class="empty">No works with these filters.</p>'}
      <p class="small muted"><strong>Reading it:</strong> the penitent hermit, beating his breast with a stone before a crucifix, was a favourite subject of 15th- and 16th-century devotion; the scholar in his study is the type of Antonello da Messina's panel and Dürer's 1514 engraving. In this collection the penitent type ${jPen > jScholar ? 'outnumbers' : 'does not outnumber'} the scholar overall. The book is left out of both definitions because Jerome carries it in both personas. Numbers per century are small; read the shape, not the decimals.</p>
    </section>

    <section class="panel finding">
      <h2>4. Who is doing the looking?</h2>
      <p>The NGA's descriptions come in two very different styles. <em>Detailed</em> descriptions are long, often name the saint, and explain what they hold. <em>Brief</em> descriptions open with a formula ("The image shows…", "This is a drawing…") and describe shapes and objects without naming anyone. (The dataset doesn't say who or what wrote each one.)</p>
      <div class="stat-row">
        ${styleStats.map((s) => `<div class="stat"><p class="eyebrow">${s.st === 'detailed' ? 'Detailed' : 'Brief'} · ${s.n} single-saint works</p>
          <p><b>${s.clues.toFixed(1)}</b> attributes found per work</p>
          <p><b>${s.words}</b> words on average</p>
          <p><b>${pct(s.named)}</b> name the saint</p>
          <p><b>${pct(s.paintings)}</b> are paintings</p></div>`).join('')}
      </div>
      <p class="small muted"><strong>Reading it:</strong> ${det.n && brf.n ? `detailed descriptions surface ${(det.clues / Math.max(brf.clues, 0.01)).toFixed(1)}× as many attributes per work.` : ''} Since detailed descriptions are mostly of paintings, and paintings are concentrated early, the style of description could fake a historical trend. Check: halos before 1400 → from 1500 on, within each style: ${haloByStyle.map((h) => `${h.st} ${pct(rate(h.early, hasHalo))} (n=${h.early.length}) → ${pct(rate(h.late, hasHalo))} (n=${h.late.length})`).join('; ')}. ${haloByStyle.every((h) => h.early.length >= 4 && rate(h.late, hasHalo) < rate(h.early, hasHalo)) ? 'The decline survives within both styles.' : 'With these filters there are too few works to tell whether the decline holds in each style.'} For blind and low-vision visitors, this matters: a description that says "a man with a lion" without "Saint Jerome" leaves the listener to do the iconography themselves. Try the <a href="#/game">description-only mode</a> of the game to feel the difference.</p>
    </section>`;
  scrollTop();
}

// ---------------------------------------------------------------- method
function renderMethod() {
  setTitle('Method');
  const n = D.works.length, nd = D.works.filter((w) => w.alt).length;
  const nAttrs = D.saints.reduce((a, s) => a + s.attributes.length, 0);
  $main.innerHTML = `
    <article class="prose">
      <p class="eyebrow">How it works</p>
      <h1>Method, and its limits</h1>
      <p class="lede">Iconography Detective combines two kinds of knowledge: an <strong>expert lexicon</strong> of what each saint's attributes are and why, and a <strong>museum dataset</strong> that describes what is actually in each picture. The program connects the two with plain, deterministic text search.</p>

      <ol class="pipeline">
        <li><b>Data.</b> The National Gallery of Art publishes its collection as open data (CC0) on GitHub: object records, subject keywords, and IIIF image links. Many images also have a written visual description made for blind and low-vision visitors.</li>
        <li><b>Selection.</b> A build script keeps works whose title names one of ${D.saints.length} saints, dated ${D.meta.years[0]}–${D.meta.years[1]}, with an open-access image: <b>${n.toLocaleString()} works</b>, ${nd.toLocaleString()} with descriptions. A work is <em>single-saint</em> if only one saint is named in its title and the title has no group words (Madonna, Holy Family, Saints…).</li>
        <li><b>Lexicon.</b> ${nAttrs} attributes, each with its meaning and a set of search patterns (for example, Jerome's cardinal's hat matches "red hat", "wide-brimmed hat", "galero", "cardinal"). Sources: James Hall, <i>Dictionary of Subjects and Symbols in Art</i>; George Ferguson, <i>Signs &amp; Symbols in Christian Art</i>; Jacobus de Voragine, <i>The Golden Legend</i>.</li>
        <li><b>Detection.</b> For each work and saint, every pattern is searched in the description, the keywords, and the title. The first matching sentence is saved as <em>evidence</em>, so every claim on this site can be checked by a person.</li>
        <li><b>Analysis.</b> The browser counts the evidence by period and medium to draw the heatmaps and charts. Nothing runs on a server; the site is static and is hosted on GitHub Pages.</li>
      </ol>

      <h2>What this can and cannot see</h2>
      <ul>
        <li><b>It reads words, not pixels.</b> An attribute counts as "present" only if the description mentions it. A small or faint attribute may be in the picture but not in the text. So the percentages measure <em>what a describer noticed and named</em>, which is interesting in its own right, but not the same as what the artist painted.</li>
        <li><b>Descriptions vary.</b> Some descriptions are long and expert (they name the saint and explain the gridiron); others are brief and generic ("a person holding an object"). Changes in description style can look like changes in art.</li>
        <li><b>Words are ambiguous.</b> "Palm" can be a hand or a martyr's frond; "cross" can be a crucifix or a gesture. The patterns try to avoid known traps, and every match shows its sentence so you can judge it.</li>
        <li><b>Group scenes are noisy.</b> In a picture with Jerome <em>and</em> Mark, a lion could belong to either. That is why the analysis defaults to single-saint works.</li>
        <li><b>The corpus is one museum.</b> The NGA's collection is strong in Italian painting and northern prints. Other collections, such as the Harvard Art Museums, would tell a somewhat different story.</li>
      </ul>

      <h2>Why deterministic search, and not an AI model?</h2>
      <p>In CS 85 we contrasted <em>deterministic</em> programs, which give the same output for the same input every time, with generative AI, which does not. I built this tool with an AI coding partner, but the analysis itself is deterministic on purpose: an art-historical claim ("halos decline after 1400") should be reproducible, and every data point should trace back to a sentence a human can read. An LLM could probably recognize more attributes, especially in generic descriptions. That is a good next step, provided its answers are logged as evidence the same way.</p>

      <h2>Reproduce it</h2>
      <p>Source code, the lexicon, and the build script are on GitHub. Running <code>python3 scripts/build_data.py</code> downloads the NGA data and rebuilds <code>data/works.json</code>. To change what counts as an attribute, edit <code>data/lexicon.json</code> and rebuild.</p>
    </article>`;
  scrollTop();
}

window.addEventListener('hashchange', route);
route().catch((e) => {
  console.error(e);
  $main.innerHTML = `<p class="empty">Could not load the data. ${esc(e.message)}</p>`;
});
