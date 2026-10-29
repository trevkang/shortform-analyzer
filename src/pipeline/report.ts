import type { Analysis } from "../primitives.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const sec = (t: number) => `${t.toFixed(1)}s`;
const words = (s: string) => s.replace(/_/g, " ");
const answer = (v: boolean | string) => (v === true ? "yes" : v === false ? "no" : v);

/** A self-contained HTML page: the role strip, then one row per scene with its frame. */
export function reportHtml(a: Analysis, title = "Video analysis"): string {
  const photos = a.media === "photos";
  const when = (start: number, end: number) => (photos ? `photo ${start + 1}` : `${sec(start)}-${sec(end)}`);
  const strip = a.scenes.map((s) =>
    `<div class="seg r-${s.role}" style="flex:${Math.max(s.end - s.start, 0.3)}" title="${when(s.start, s.end)}">${s.role}</div>`).join("");
  const rows = a.scenes.map((s) => `
  <article>
    <img src="${esc(s.frame)}" alt="Scene ${s.index + 1}">
    <div>
      <h3>Scene ${s.index + 1} <span>${when(s.start, s.end)}${s.cut ? "" : " · same take"}</span></h3>
      <p class="tags"><b class="r-${s.role}">${s.role}</b> <i>${words(s.footage)}</i>${s.showsProduct ? " <i>· product shown</i>" : ""}</p>
      <blockquote>${s.spoken ? esc(s.spoken) : `<em>${a.speech === "none" ? "words not known" : "nothing said"}</em>`}</blockquote>
      ${s.onScreenText ? `<p class="shown">On screen: ${esc(s.onScreenText)}</p>` : ""}
      ${s.answers && Object.keys(s.answers).length ? `<p class="shown">${Object.entries(s.answers).map(([k, v]) => `${esc(k)}: ${esc(answer(v))}`).join(" · ")}</p>` : ""}
    </div>
  </article>`).join("");
  const comments = a.comments?.length
    ? `<h2>Comments</h2><ul class="comments">${a.comments.map((c) => `<li><b>${words(c.kind)}</b> ${esc(c.text)} <span>${c.likes} likes</span></li>`).join("")}</ul>`
    : "";
  const sells = a.sells === "none" ? "sells nothing" : `sells ${words(a.sells)}${a.product ? `: ${esc(a.product)}` : ""}`;
  const answers = a.answers && Object.keys(a.answers).length
    ? `<p class="meta">${Object.entries(a.answers).map(([k, v]) => `${esc(k)}: ${esc(answer(v))}`).join(" · ")}</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--bg:#fafaf9;--fg:#1c1917;--mute:#78716c;--card:#fff;--line:#e7e5e4}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--mute:#a8a29e;--card:#292524;--line:#44403c}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:860px;margin:auto}h1{margin:0 0 4px}h2{margin:24px 0 8px}.meta{color:var(--mute);margin:0 0 12px}
.strip{display:flex;gap:2px;border-radius:8px;overflow:hidden;margin:16px 0 24px}
.seg{padding:8px 6px;color:#fff;font-weight:600;font-size:13px;min-width:0;overflow:hidden;white-space:nowrap}
article{display:grid;grid-template-columns:120px 1fr;gap:16px;padding:14px;background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:10px}
article img{width:120px;border-radius:6px}h3{margin:0}h3 span{color:var(--mute);font-weight:400;font-size:13px}
.tags{margin:4px 0}.tags b{color:#fff;padding:1px 8px;border-radius:99px;font-size:12px}.tags i{color:var(--mute)}
blockquote{margin:6px 0 0;padding-left:10px;border-left:3px solid var(--line)}.shown{color:var(--mute);margin:6px 0 0}
.comments{padding-left:18px}.comments b{font-weight:600}.comments span{color:var(--mute);font-size:13px}
.r-hook{background:#dc2626}.r-body{background:#2563eb}.r-payoff{background:#7c3aed}.r-cta{background:#db2777}
</style></head><body><main>
<h1>${esc(title)}</h1>
<p class="meta">${words(a.format)} · ${words(a.topic)} · ${sells}${a.asksForComment ? " · asks for a comment" : ""} · ${photos ? `${a.duration} photos` : sec(a.duration)} · ${a.scenes.length} scenes · $${a.costUsd.toFixed(5)}</p>
${a.description ? `<p>${esc(a.description)}</p>` : ""}
${a.formatDescription ? `<p class="meta">${esc(a.formatDescription)}</p>` : ""}
${a.tags.length ? `<p class="meta">${a.tags.map((t) => `#${esc(t)}`).join(" ")}</p>` : ""}
${answers}
<div class="strip">${strip}</div>${rows}
${comments}
</main></body></html>`;
}
