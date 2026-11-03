// Small, dependency-free charts: an attribute heatmap (HTML table), a vertical
// bar chart with one or two series (SVG), and a horizontal bar list (HTML).
// Every mark has a hover/focus tooltip, and every chart has a text alternative.

import { binLabel } from './data.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (p) => `${Math.round(p * 100)}%`;

// ---------- shared tooltip ----------
let tip;
function tooltip() {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.setAttribute('role', 'status');
    document.body.appendChild(tip);
  }
  return tip;
}
export function bindTips(root) {
  const t = tooltip();
  const show = (el, x, y) => {
    t.innerHTML = el.dataset.tip;
    t.style.display = 'block';
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    t.style.left = `${Math.max(8, left)}px`;
    t.style.top = `${Math.max(8, top)}px`;
  };
  root.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('mousemove', (e) => show(el, e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => (t.style.display = 'none'));
    el.addEventListener('focus', () => {
      const r = el.getBoundingClientRect();
      show(el, r.right, r.top);
    });
    el.addEventListener('blur', () => (t.style.display = 'none'));
  });
}

// ---------- heatmap ----------
// rows: [{attr, total, cells:[{bin,n,k,p}]}]; cols: [bin starts]
export function heatmap({ cols, rows, n, size }, saintName) {
  const MIN_N = 4;
  const head = cols.map((c) => `<th scope="col"><span>${binLabel(c, size)}</span></th>`).join('');
  const nrow = rows[0]
    ? rows[0].cells.map((c) => `<td class="n">${c.n}</td>`).join('')
    : '';
  const body = rows
    .filter((r) => r.total > 0 || r.attr.id !== 'halo')
    .map((r) => {
      const tds = r.cells
        .map((c) => {
          const few = c.n < MIN_N;
          const t = `<b>${esc(r.attr.label)}</b> · ${binLabel(c.bin, size)}<br>${c.k} of ${c.n} descriptions (${pct(c.p)})${few ? '<br><i>Too few works to read a trend</i>' : ''}`;
          const lvl = few ? 'few' : Math.min(6, Math.ceil(c.p * 6));
          return `<td class="cell l${lvl}" tabindex="0" data-tip="${esc(t)}"><span class="sr">${c.k} of ${c.n}</span></td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(r.attr.label)}<small>${n ? pct(r.total / n) : '–'}</small></th>${tds}</tr>`;
    })
    .join('');
  return `
  <div class="heat-wrap">
    <table class="heat" aria-label="How often each attribute of ${esc(saintName)} is described, by half-century">
      <thead><tr><th scope="col" class="corner">Attribute <small>overall</small></th>${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><th scope="row">Works described</th>${nrow}</tr></tfoot>
    </table>
  </div>
  <div class="heat-legend" aria-hidden="true">
    <span>0%</span>${[0, 1, 2, 3, 4, 5, 6].map((l) => `<i class="cell l${l}"></i>`).join('')}<span>100%</span>
    <i class="cell lfew"></i><span>fewer than ${MIN_N} works</span>
  </div>`;
}

// ---------- vertical bars (1 or 2 series) ----------
// groups: [{label, values:[{p,k,n}]}], series: [{name, cls}]
export function bars({ groups, series, height = 240, title }) {
  const W = Math.max(320, groups.length * (series.length * 26 + 22) + 40);
  const H = height, padL = 36, padB = 34, padT = 14;
  const plotH = H - padB - padT;
  const gw = (W - padL - 8) / groups.length;
  const bw = Math.min(26, (gw - 10) / series.length);
  const y = (p) => padT + plotH * (1 - p);
  let svg = '';
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    svg += `<line class="grid" x1="${padL}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text class="axis" x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${t * 100}%</text>`;
  }
  groups.forEach((g, i) => {
    const gx = padL + i * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
    g.values.forEach((v, j) => {
      const x = gx + j * (bw + 2);
      const few = v.n < 4;
      const h = Math.max(v.p > 0 ? 2 : 0, plotH * v.p);
      const t = `<b>${esc(g.label)}</b>${series.length > 1 ? ` · ${esc(series[j].name)}` : ''}<br>${v.k} of ${v.n} works (${pct(v.p)})${few ? '<br><i>Too few works to read a trend</i>' : ''}`;
      svg += `<g class="bar-hit" tabindex="0" data-tip="${esc(t)}">
        <rect class="hit" x="${x - 1}" y="${padT}" width="${bw + 2}" height="${plotH}"/>
        <path class="bar ${series[j].cls}${few ? ' few' : ''}" d="${roundTop(x, y(0), bw, h)}"/>
      </g>`;
    });
    svg += `<text class="axis" x="${padL + i * gw + gw / 2}" y="${H - padB + 16}" text-anchor="middle">${esc(g.label)}</text>`;
    svg += `<text class="axis n" x="${padL + i * gw + gw / 2}" y="${H - padB + 29}" text-anchor="middle">n=${g.values[0].n}</text>`;
  });
  svg += `<line class="baseline" x1="${padL}" x2="${W - 4}" y1="${y(0)}" y2="${y(0)}"/>`;
  const legend = series.length > 1
    ? `<div class="legend">${series.map((s) => `<span><i class="sw ${s.cls}"></i>${esc(s.name)}</span>`).join('')}</div>`
    : '';
  const table = `<details class="table-view"><summary>Show as table</summary><table><thead><tr><th>Period</th>${series.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${groups.map((g) => `<tr><th>${esc(g.label)}</th>${g.values.map((v) => `<td>${v.k}/${v.n} (${pct(v.p)})</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
  return `${legend}<div class="chart-scroll"><svg class="bars" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">${svg}</svg></div>${table}`;
}

function roundTop(x, base, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  const top = base - h;
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

// ---------- horizontal bar list ----------
// items: [{label, sub, p, k, n, href}]
export function hbars(items) {
  return `<ol class="hbars">${items
    .map(
      (it) => `<li>
      <a class="hb-label" href="${it.href}">${esc(it.label)}<small>${esc(it.sub)}</small></a>
      <span class="hb-track" tabindex="0" data-tip="${esc(`<b>${esc(it.label)}</b><br>${esc(it.sub)}: ${it.k} of ${it.n} single-saint works (${pct(it.p)})`)}"><span class="hb-bar" style="width:${(it.p * 100).toFixed(1)}%"></span></span>
      <span class="hb-val">${pct(it.p)}</span>
    </li>`
    )
    .join('')}</ol>`;
}
