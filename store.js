/* Shop grid: re-renders from products.json (synced from the Square store) so new listings show without a page edit. */
(function () {
  var grid = document.getElementById("pgrid"); if (!grid || !window.fetch) return;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  fetch("products.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.products || !d.products.length) return;
    grid.innerHTML = d.products.map(function (p) {
      var img = p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" width="640" height="640">' : '<span class="pcard__noimg">Photo coming soon</span>';
      var badge = p.sold_out ? '<span class="pcard__badge">Sold out</span>' : (p.on_sale ? '<span class="pcard__badge">Sale</span>' : "");
      return '<li><a class="pcard" href="' + esc(p.url) + '" target="_blank" rel="noopener"><span class="pcard__img">' + img + badge + '</span><span class="pcard__name">' + esc(p.name) +
        '</span><span class="pcard__row"><span class="pcard__price">' + esc(p.price) + '</span><span class="pcard__buy">Buy</span></span></a></li>';
    }).join("");
    grid.classList.toggle("pgrid--one", d.products.length === 1);
  }).catch(function () {});
})();
