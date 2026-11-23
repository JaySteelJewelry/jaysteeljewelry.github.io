/* Share row on the link-in-bio page: native share sheet when the phone has one, copy-link otherwise.
   Kept in a file (not inline in index.html) so the page can run under a strict CSP (script-src 'self'). */
(function () {
  var url = "https://jaysteeljewelry.github.io/links/", title = "JAY STEEL JEWELRY", text = "Hypoallergenic, non-tarnish jewelry. Follow along and see where to find us next.";
  var n = document.getElementById("shareNative");
  if (n && navigator.share) { n.hidden = false; n.addEventListener("click", function () { navigator.share({ title: title, text: text, url: url }).catch(function () {}); }); }
  var c = document.getElementById("shareCopy");
  if (c) c.addEventListener("click", function () {
    var lbl = c.querySelector("span"), done = function () { lbl.textContent = "Link copied ✓"; c.classList.add("sh__done"); setTimeout(function () { lbl.textContent = "Copy link"; c.classList.remove("sh__done"); }, 2200); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); });
    else prompt("Copy this link:", url);
  });
})();
