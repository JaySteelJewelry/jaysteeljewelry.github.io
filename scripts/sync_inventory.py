#!/usr/bin/env python3
"""Sync JAY STEEL JEWELRY's POS product library (PayPal POS / Zettle) into shop/products.json + shop/images/.

Read-only: it only GETs products, images and stock. It never changes anything in the POS account.
Credentials come from the environment, never from this repo:
  ZETTLE_CLIENT_ID  - the API key's client id (my.zettle.com > Integrations > API keys)
  ZETTLE_API_KEY    - the API key itself (the "assertion")
Usage:  python3 scripts/sync_inventory.py [--repo PATH] [--dry-run]
Prints one JSON summary line. Exit 0 = ok (files written only when something changed), 2 = auth/API error.
"""
import hashlib, io, json, os, re, sys, urllib.parse, urllib.request, datetime

TOKEN_URL = "https://oauth.zettle.com/token"
PRODUCTS_URL = "https://products.izettle.com/organizations/self/products/v2"
STOCK_URL = "https://inventory.izettle.com/v3/stock"
IMAGE_URL = "https://image.izettle.com/productimage/L/{key}"
UA = "jaysteel-shop-sync/1.0"

def http(url, data=None, headers=None, timeout=40):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read(), r.headers.get("Content-Type", "")

def token():
    cid, key = os.environ.get("ZETTLE_CLIENT_ID"), os.environ.get("ZETTLE_API_KEY")
    if not cid or not key:
        raise SystemExit(json.dumps({"ok": False, "error": "ZETTLE_CLIENT_ID / ZETTLE_API_KEY not set"}))
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "client_id": cid, "assertion": key}).encode()
    _, raw, _ = http(TOKEN_URL, body, {"Content-Type": "application/x-www-form-urlencoded"})
    return json.loads(raw)["access_token"]

def get_json(url, tok):
    _, raw, _ = http(url, headers={"Authorization": "Bearer " + tok, "Accept": "application/json"})
    return json.loads(raw) if raw else None

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:60] or "item"

def stock_map(tok):
    """variantUuid -> balance (int) for variants whose stock is tracked; untracked variants are absent."""
    out = {}
    try:
        d = get_json(STOCK_URL, tok)
    except Exception as e:  # inventory not enabled / not tracked: keep going, treat as untracked
        return out, "stock not read: %s" % (getattr(e, "code", None) or e.__class__.__name__)
    rows = d if isinstance(d, list) else (d or {}).get("variants") or (d or {}).get("stock") or (d or {}).get("data") or []
    for r in rows:
        vid = r.get("variantUuid") or r.get("variantId")
        bal = r.get("balance", r.get("quantity"))
        if vid is not None and bal is not None:
            try: out[vid] = int(float(bal))
            except Exception: pass
    return out, None

def save_image(repo, key, name, dry):
    """Download the POS photo once, shrink to 900 px JPEG, keep it in shop/images/. Returns the site path."""
    fn = "%s-%s.jpg" % (slug(name), hashlib.sha1(key.encode()).hexdigest()[:8])
    rel = "images/" + fn
    path = os.path.join(repo, "shop", rel)
    if os.path.exists(path) or dry:
        return rel
    _, raw, _ = http(IMAGE_URL.format(key=urllib.parse.quote(key)))
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((900, 900))
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=84, optimize=True, progressive=True); raw = buf.getvalue()
    except Exception:
        pass  # no Pillow: keep the original bytes
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(raw)
    return rel

def build(repo, dry=False, cfg=None):
    cfg = cfg or {}
    hide_cats = {c.lower() for c in cfg.get("hide_categories", [])}
    hide_names = [w.lower() for w in cfg.get("hide_name_words", ["custom amount", "gift card", "booth", "shipping"])]
    tok = token()
    prods = get_json(PRODUCTS_URL, tok) or []
    stock, stock_note = stock_map(tok)
    out, used_images = [], set()
    for p in prods:
        name = (p.get("name") or "").strip()
        cat = ((p.get("category") or {}).get("name") or "").strip() or None
        if not name or (cat and cat.lower() in hide_cats) or any(w in name.lower() for w in hide_names):
            continue
        keys = list(p.get("imageLookupKeys") or [])
        variants = []
        for v in p.get("variants") or []:
            price = (v.get("price") or {}).get("amount")
            if not price:  # open-price items can't be sold online
                continue
            vname = (v.get("name") or "").strip() or " / ".join(o.get("value", "") for o in v.get("options") or []) or "Regular"
            bal = stock.get(v.get("uuid"))
            variants.append({"id": v.get("uuid"), "name": vname, "sku": v.get("sku") or None, "price_cents": int(price),
                             "stock": bal, "in_stock": True if bal is None else bal > 0,
                             "options": {o.get("name"): o.get("value") for o in v.get("options") or [] if o.get("name")}})
            if v.get("imageLookupKeys"): keys += [k for k in v["imageLookupKeys"] if k not in keys]
        if not variants:
            continue
        imgs = []
        for k in keys[:4]:
            try:
                rel = save_image(repo, k, name, dry); imgs.append(rel); used_images.add(os.path.basename(rel))
            except Exception:
                pass
        out.append({"id": p.get("uuid"), "name": name, "description": (p.get("description") or "").strip(), "category": cat,
                    "images": imgs, "variants": variants})
    out.sort(key=lambda x: (x["category"] or "~", x["name"].lower()))
    return out, used_images, stock_note

def main():
    args = sys.argv[1:]
    repo = os.path.abspath(args[args.index("--repo") + 1]) if "--repo" in args else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dry = "--dry-run" in args
    cfg_path = os.path.join(repo, "shop", "sync-config.json")
    cfg = json.load(open(cfg_path)) if os.path.exists(cfg_path) else {}
    try:
        products, used, note = build(repo, dry, cfg)
    except SystemExit:
        raise
    except Exception as e:
        print(json.dumps({"ok": False, "error": "%s %s" % (e.__class__.__name__, getattr(e, "code", "") or str(e)[:200])})); return 2
    pj = os.path.join(repo, "shop", "products.json")
    old = json.load(open(pj)) if os.path.exists(pj) else {}
    changed = old.get("products") != products
    if changed and not dry:
        doc = {"updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "currency": "USD",
               "source": "PayPal POS product library", "products": products}
        open(pj, "w").write(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        imgdir = os.path.join(repo, "shop", "images")
        for f in (os.listdir(imgdir) if os.path.isdir(imgdir) else []):  # drop photos of pieces no longer listed
            if f.endswith(".jpg") and f not in used: os.remove(os.path.join(imgdir, f))
    print(json.dumps({"ok": True, "products": len(products), "variants": sum(len(p["variants"]) for p in products),
                      "in_stock": sum(1 for p in products if any(v["in_stock"] for v in p["variants"])),
                      "changed": changed, "dry_run": dry, "stock_note": note}))
    return 0

if __name__ == "__main__":
    sys.exit(main())
