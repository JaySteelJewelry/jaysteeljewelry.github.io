/* Apply the saved light/dark choice before first paint. Default: dark (brand). Shares the "jsj-theme" key with the home page. */
(function () { try { var t = localStorage.getItem("jsj-theme"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch (e) {} })();
