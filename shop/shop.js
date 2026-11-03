/* JAY STEEL JEWELRY shop: renders shop/products.json (written by scripts/sync_inventory.py from the POS
   product library), filters by category, and keeps a multi-item bag in localStorage. Checkout is handed to
   checkout.js (window.JSShopCheckout), which reads shop/config.json.

   products.json shape:
   { "updated": ISO time, "currency": "USD",
     "products": [ { "id", "name", "description", "category", "images": [url...],
                     "variants": [ { "id", "name", "price_cents", "in_stock": bool, "stock": int|null, "sku" } ] } ] } */
(function () {
  "use strict";
  var KEY = "jsj-bag-v1";
  var $ = function (id) { return document.getElementById(id); };
  var grid = $("sgrid"), chips = $("chips"), soon = $("soon"), status = $("shop-status"), sub = $("shop-sub");
  var bagEl = $("bag"), scrim = $("scrim"), list = $("bag-list"), empty = $("bag-empty"), foot = $("bag-foot");
  var countEl = $("bag-count"), openBtn = $("bag-open"), subtotalEl = $("bag-subtotal"), toast = $("toast");
  var data = { currency: "USD", products: [] }, byVariant = {}, cat = "All", lastFocus = null, toastT = 0;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(c) { return "$" + (Math.round(c) / 100).toFixed(2); }
  function inStock(v) { return v.in_stock !== false && (v.stock == null || v.stock > 0); }
  function maxQty(v) { return v.stock == null ? 10 : Math.max(0, Math.min(10, v.stock)); }

  /* ---------- bag ---------- */
  function load() { try { var b = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(b) ? b : []; } catch (e) { return []; } }
  function save(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} }
  var bag = load();
  /* Keep the bag honest against the current inventory: drop pieces that are gone or sold out, cap quantities at stock. */
  function reconcile() {
    bag = bag.filter(function (l) { var v = byVariant[l.v]; return v && inStock(v.variant) && l.q > 0; })
      .map(function (l) { return { v: l.v, q: Math.min(l.q, maxQty(byVariant[l.v].variant)) }; });
    save(bag);
  }
  function lines() {
    return bag.map(function (l) { var x = byVariant[l.v]; return { product: x.product, variant: x.variant, qty: l.q }; });
  }
  function totalCents() { return lines().reduce(function (s, l) { return s + l.variant.price_cents * l.qty; }, 0); }
  function count() { return bag.reduce(function (s, l) { return s + l.q; }, 0); }
  function add(vid) {
    var x = byVariant[vid]; if (!x || !inStock(x.variant)) return;
    var line = bag.filter(function (l) { return l.v === vid; })[0];
    if (line) { if (line.q >= maxQty(x.variant)) { say("Only " + maxQty(x.variant) + " available"); return; } line.q++; }
    else bag.push({ v: vid, q: 1 });
    save(bag); renderBag();
    openBtn.classList.remove("bump"); void openBtn.offsetWidth; openBtn.classList.add("bump");
    say("Added to bag", true);
  }
  function setQty(vid, q) {
    bag = bag.map(function (l) { return l.v === vid ? { v: vid, q: q } : l; }).filter(function (l) { return l.q > 0; });
    save(bag); renderBag();
  }
  function clear() { bag = []; save(bag); renderBag(); }

  function renderBag() {
    var n = count();
    countEl.textContent = n; countEl.hidden = n === 0;
    openBtn.setAttribute("aria-label", "Open bag, " + n + (n === 1 ? " item" : " items"));
    var ls = lines();
    list.innerHTML = ls.map(function (l) {
      var img = l.product.images && l.product.images[0];
      var vname = l.product.variants.length > 1 || (l.variant.name && l.variant.name !== "Regular") ? l.variant.name : "";
      var mx = maxQty(l.variant);
      return '<li class="bline"><span class="bline__img">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : "") + '</span>' +
        '<div><div class="bline__name">' + esc(l.product.name) + '</div>' + (vname ? '<div class="bline__var">' + esc(vname) + '</div>' : "") +
        '<div class="qty" role="group" aria-label="Quantity for ' + esc(l.product.name) + '"><button type="button" data-dec="' + esc(l.variant.id) + '" aria-label="One less">−</button><span>' + l.qty +
        '</span><button type="button" data-inc="' + esc(l.variant.id) + '" aria-label="One more"' + (l.qty >= mx ? " disabled" : "") + '>+</button></div></div>' +
        '<div><div class="bline__price">' + money(l.variant.price_cents * l.qty) + '</div><button type="button" class="bline__rm" data-rm="' + esc(l.variant.id) + '">Remove</button></div></li>';
    }).join("");
    empty.hidden = ls.length > 0; foot.hidden = ls.length === 0;
    subtotalEl.textContent = money(totalCents());
    if (window.JSShopCheckout && ls.length) window.JSShopCheckout.render($("checkout"), api);
  }
  list.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    var cur = function (id) { return (bag.filter(function (l) { return l.v === id; })[0] || { q: 0 }).q; };
    if (t.dataset.inc) setQty(t.dataset.inc, Math.min(cur(t.dataset.inc) + 1, maxQty(byVariant[t.dataset.inc].variant)));
    else if (t.dataset.dec) setQty(t.dataset.dec, cur(t.dataset.dec) - 1);
    else if (t.dataset.rm) setQty(t.dataset.rm, 0);
  });

  function openBag() {
    lastFocus = document.activeElement; clearTimeout(toastT); toast.hidden = true; bagEl.hidden = false; scrim.hidden = false; document.body.classList.add("bag-open");
    $("bag-close").focus();
  }
  function closeBag() {
    bagEl.hidden = true; scrim.hidden = true; document.body.classList.remove("bag-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  openBtn.addEventListener("click", openBag);
  $("bag-close").addEventListener("click", closeBag);
  scrim.addEventListener("click", closeBag);
  document.addEventListener("keydown", function (e) {
    if (bagEl.hidden) return;
    if (e.key === "Escape") closeBag();
    if (e.key === "Tab") { /* keep focus inside the open bag */
      var f = bagEl.querySelectorAll("button:not([disabled]),a[href],select,iframe"); if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  function say(msg, withView) {
    clearTimeout(toastT);
    toast.innerHTML = esc(msg) + (withView ? '<button type="button" id="toast-view">View bag</button>' : "");
    toast.hidden = false;
    var tv = $("toast-view"); if (tv) tv.addEventListener("click", function () { toast.hidden = true; openBag(); });
    toastT = setTimeout(function () { toast.hidden = true; }, 2600);
  }

  /* ---------- products ---------- */
  function priceLabel(p) {
    var ps = p.variants.map(function (v) { return v.price_cents; });
    var lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps);
    return lo === hi ? money(lo) : "From " + money(lo);
  }
  function card(p) {
    var avail = p.variants.filter(inStock), sold = avail.length === 0;
    var first = avail[0] || p.variants[0];
    var img = p.images && p.images[0];
    var pic = img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" loading="lazy" width="640" height="640">' : '<span class="pcard__noimg">Photo coming soon</span>';
    var thumbs = p.images && p.images.length > 1 ? '<div class="pcard__thumbs">' + p.images.slice(0, 4).map(function (u, i) {
      return '<button type="button" data-img="' + esc(u) + '" aria-label="Photo ' + (i + 1) + '" aria-pressed="' + (i === 0) + '"><img src="' + esc(u) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>" : "";
    var same = p.variants.every(function (v) { return v.price_cents === p.variants[0].price_cents; });
    var sel = p.variants.length > 1 ? '<label class="vsel"><span class="visually-hidden">Choose an option for ' + esc(p.name) + '</span><select data-p="' + esc(p.id) + '">' +
      p.variants.map(function (v) { return '<option value="' + esc(v.id) + '"' + (v === first ? " selected" : "") + (inStock(v) ? "" : " disabled") + ">" + esc(v.name) + (same ? "" : " · " + money(v.price_cents)) + (inStock(v) ? "" : " (sold out)") + "</option>"; }).join("") + "</select></label>" : "";
    var low = !sold && first.stock != null && first.stock <= 3;
    return '<li data-cat="' + esc(p.category || "") + '"><article class="pcard"><span class="pcard__img">' + pic + (sold ? '<span class="pcard__badge">Sold out</span>' : "") + "</span>" + thumbs +
      '<h2 class="pcard__name">' + esc(p.name) + "</h2>" +
      '<div class="pcard__body"><div class="pcard__meta"><span class="pcard__price">' + esc(priceLabel(p)) + '</span><span class="pcard__stock' + (low ? " pcard__stock--low" : "") + '" data-stock>' + (sold ? "Sold out" : low ? "Only " + first.stock + " left" : "In stock") + "</span></div>" + sel +
      '<button type="button" class="btn btn--gold addbtn" data-add="' + esc(first.id) + '"' + (sold ? " disabled" : "") + ">" + (sold ? "Sold out" : "Add to bag") + "</button></div></article></li>";
  }
  function renderGrid() {
    var ps = data.products.filter(function (p) { return cat === "All" || p.category === cat; });
    grid.innerHTML = ps.map(card).join("");
    grid.classList.toggle("pgrid--one", ps.length === 1);
    status.textContent = cat === "All" ? "" : ps.length + (ps.length === 1 ? " piece" : " pieces") + " in " + cat;
  }
  grid.addEventListener("change", function (e) {
    var s = e.target.closest("select[data-p]"); if (!s) return;
    var x = byVariant[s.value], art = s.closest(".pcard"), btn = art.querySelector("[data-add]"), st = art.querySelector("[data-stock]");
    var ok = inStock(x.variant); btn.dataset.add = x.variant.id; btn.disabled = !ok; btn.textContent = ok ? "Add to bag" : "Sold out";
    var low = ok && x.variant.stock != null && x.variant.stock <= 3;
    st.textContent = !ok ? "Sold out" : low ? "Only " + x.variant.stock + " left" : "In stock"; st.classList.toggle("pcard__stock--low", low);
  });
  grid.addEventListener("click", function (e) {
    var a = e.target.closest("[data-add]"); if (a && !a.disabled) { add(a.dataset.add); return; }
    var t = e.target.closest("[data-img]");
    if (t) { var art = t.closest(".pcard"); art.querySelector(".pcard__img img").src = t.dataset.img;
      art.querySelectorAll("[data-img]").forEach(function (b) { b.setAttribute("aria-pressed", b === t ? "true" : "false"); }); }
  });
  function renderChips() {
    var cats = [];
    data.products.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    chips.hidden = cats.length < 2;
    chips.innerHTML = ["All"].concat(cats).map(function (c) { return '<button type="button" class="chip" aria-pressed="' + (c === cat) + '">' + esc(c) + "</button>"; }).join("");
  }
  chips.addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    cat = b.textContent; chips.querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    renderGrid();
  });

  function showEmpty() { soon.hidden = false; grid.innerHTML = ""; chips.hidden = true; sub.hidden = true; }
  function index() {
    byVariant = {};
    data.products.forEach(function (p) { p.variants.forEach(function (v) { byVariant[v.id] = { product: p, variant: v }; }); });
  }
  function clean(d) {
    var ps = (d && Array.isArray(d.products) ? d.products : []).filter(function (p) { return p && p.id && p.name && Array.isArray(p.variants) && p.variants.length; });
    ps.forEach(function (p) { p.variants = p.variants.filter(function (v) { return v && v.id && typeof v.price_cents === "number" && v.price_cents > 0; }); });
    return { currency: (d && d.currency) || "USD", updated: d && d.updated, products: ps.filter(function (p) { return p.variants.length; }) };
  }

  var api = { lines: lines, totalCents: totalCents, money: money, clear: clear, currency: function () { return data.currency; },
              close: closeBag, refresh: function () { return fetchData().then(function () { reconcile(); renderBag(); return lines(); }); } };
  window.JSShop = api;

  function fetchData() {
    var src = (window.JSSHOP_PRODUCTS_URL || "products.json");
    return fetch(src, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (d) { data = clean(d); index(); });
  }
  fetchData().then(function () {
    reconcile();
    if (!data.products.length) { showEmpty(); renderBag(); return; }
    soon.hidden = true; sub.hidden = false; renderChips(); renderGrid(); renderBag();
  }).catch(function () { showEmpty(); renderBag(); });
})();
