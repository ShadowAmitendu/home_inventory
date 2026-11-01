"""
HomeInventory - a tiny app to track things in your house.

Run:
    pip install flask
    python app.py
Then open http://127.0.0.1:5000

The SQLite database (inventory.db) is created automatically next to this file.
"""
import calendar
import csv
import io
import os
import secrets
import shutil
import socket
import sqlite3
import tempfile
import threading
import webbrowser
from datetime import date, datetime

from PIL import Image, ImageOps, UnidentifiedImageError
from flask import (Flask, Response, flash, g, redirect,
                   render_template, request, send_file, send_from_directory,
                   url_for)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "inventory.db")

app = Flask(__name__)
app.secret_key = "home-inventory-local-secret"
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB per request

UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")      # item images live here
ALLOWED_IMG = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.errorhandler(413)
def too_large(_e):
    flash("Upload too large (limit is 25 MB per upload).", "danger")
    return redirect(url_for("index"))


SERVER_PORT = int(os.environ.get("PORT", 5000))


def get_local_ip():
    """Retrieve the primary local area network (LAN) IPv4 address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Connect to a dummy public IP: does not send packets or establish a connection
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


@app.context_processor
def inject_network_info():
    """Inject local network IP, active port, and connection URL into all templates."""
    ip = get_local_ip()
    port = request.host.split(":")[-1] if ":" in request.host else str(SERVER_PORT)
    return {
        "local_ip": ip,
        "server_port": port,
        "network_url": f"http://{ip}:{port}",
    }

DEFAULT_CATEGORIES = ["Kitchen", "Tools", "Documents", "Electronics",
                      "Clothing", "Books", "Other"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    location        TEXT NOT NULL,              -- where it is normally kept
    notes           TEXT DEFAULT '',
    taken_out       INTEGER NOT NULL DEFAULT 0, -- 0 = in its place, 1 = taken out
    taken_to        TEXT DEFAULT '',            -- where it is now / who has it
    taken_on        TEXT DEFAULT '',
    expiry_date     TEXT DEFAULT '',            -- YYYY-MM-DD, optional
    quantity        INTEGER NOT NULL DEFAULT 1,
    min_quantity    INTEGER NOT NULL DEFAULT 0,
    tags            TEXT DEFAULT '',
    purchase_date   TEXT DEFAULT '',
    purchase_price  REAL DEFAULT 0.0,
    warranty_expiry TEXT DEFAULT '',
    condition       TEXT DEFAULT '',
    amount_left     INTEGER DEFAULT -1,
    created_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS item_images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS item_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    action     TEXT NOT NULL,
    details    TEXT DEFAULT '',
    timestamp  TEXT NOT NULL
);
"""

# CSV import ---------------------------------------------------------------
CSV_FIELDS = [
    "name", "category", "location", "notes", "status", "taken_to",
    "expiry_date", "quantity", "min_quantity", "tags", "purchase_date",
    "purchase_price", "warranty_expiry", "condition", "amount_left"
]
HEADER_ALIASES = {
    "name": {"name", "item", "item name"},
    "category": {"category", "type"},
    "location": {"location", "kept at", "where kept", "place", "kept"},
    "notes": {"notes", "note", "description"},
    "status": {"status"},
    "taken_to": {"taken_to", "taken to", "where now", "currently at"},
    "expiry_date": {"expiry_date", "expiry", "expiry date", "expires", "exp",
                    "exp date", "expiration", "expiration date"},
    "quantity": {"quantity", "qty", "count"},
    "min_quantity": {"min_quantity", "min quantity", "minimum", "min_qty", "threshold"},
    "tags": {"tags", "tag", "labels", "label"},
    "purchase_date": {"purchase_date", "purchase date", "bought on", "bought date"},
    "purchase_price": {"purchase_price", "purchase price", "price", "cost"},
    "warranty_expiry": {"warranty_expiry", "warranty expiry", "warranty", "warranty date"},
    "condition": {"condition", "product condition", "item condition", "state", "cond"},
    "amount_left": {"amount_left", "amount left", "how much left", "fullness", "level",
                    "remaining", "percentage left", "left", "qty left"},
}
OUT_WORDS = {"out", "taken out", "taken", "yes", "1", "true"}


# ----------------------------------------------------------------- database
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    cols = [r[1] for r in db.execute("PRAGMA table_info(items)")]
    if "expiry_date" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN expiry_date TEXT DEFAULT ''")
    if "quantity" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1")
    if "min_quantity" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN min_quantity INTEGER NOT NULL DEFAULT 0")
    if "tags" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN tags TEXT DEFAULT ''")
    if "purchase_date" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN purchase_date TEXT DEFAULT ''")
    if "purchase_price" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN purchase_price REAL DEFAULT 0.0")
    if "warranty_expiry" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN warranty_expiry TEXT DEFAULT ''")
    if "condition" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN condition TEXT DEFAULT ''")
    if "amount_left" not in cols:
        db.execute("ALTER TABLE items ADD COLUMN amount_left INTEGER DEFAULT -1")

    db.execute("""
    CREATE TABLE IF NOT EXISTS item_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        action     TEXT NOT NULL,
        details    TEXT DEFAULT '',
        timestamp  TEXT NOT NULL
    )
    """)

    if db.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
        db.executemany("INSERT INTO categories (name) VALUES (?)",
                       [(c,) for c in DEFAULT_CATEGORIES])
    db.commit()
    db.close()


def log_item_history(db, item_id, action, details=""):
    try:
        db.execute(
            "INSERT INTO item_history (item_id, action, details, timestamp) "
            "VALUES (?, ?, ?, ?)",
            (item_id, action, details or "", now())
        )
    except Exception as e:
        app.logger.warning(f"Error logging item history: {e}")


def now():
    return datetime.now().strftime("%d %b %Y, %H:%M")


def category_or_none(value):
    return int(value) if value and value.isdigit() else None


EXPIRY_WARN_DAYS = 30   # items expiring within this many days are flagged


def parse_date(value):
    """Return YYYY-MM-DD for common date formats ('' if unreadable).
    A month/year such as 08/2027 means the last day of that month."""
    value = (value or "").strip()
    if not value:
        return ""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d",
                "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    for fmt in ("%m/%Y", "%m-%Y", "%b %Y", "%B %Y"):
        try:
            d = datetime.strptime(value, fmt)
            last = calendar.monthrange(d.year, d.month)[1]
            return f"{d.year:04d}-{d.month:02d}-{last:02d}"
        except ValueError:
            pass
    return ""


def expiry_info(exp, today):
    """-> (days_left, status) where status is '', 'ok', 'soon' or 'expired'."""
    if not exp:
        return None, ""
    try:
        days = (datetime.strptime(exp, "%Y-%m-%d").date() - today).days
    except ValueError:
        return None, ""
    if days < 0:
        return days, "expired"
    return days, ("soon" if days <= EXPIRY_WARN_DAYS else "ok")


def warranty_info(warranty_exp, today):
    """-> (days_left, status) where status is '', 'active', 'soon' (<=30d), or 'expired'."""
    if not warranty_exp:
        return None, ""
    try:
        days = (datetime.strptime(warranty_exp, "%Y-%m-%d").date() - today).days
    except ValueError:
        return None, ""
    if days < 0:
        return days, "expired"
    if days <= EXPIRY_WARN_DAYS:
        return days, "soon"
    return days, "active"


IMG_MAX_SIDE = 1024    # stored images are at most 1024 x 1024 px


def store_square_image(file_storage):
    """Centre-crop an uploaded image to 1:1, shrink it if large, save it in
    UPLOAD_DIR and return the new file name (None if it isn't a valid image)."""
    try:
        img = Image.open(file_storage.stream)
        img.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return None
    img = ImageOps.exif_transpose(img)           # respect phone rotation
    w, h = img.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    if side > IMG_MAX_SIDE:
        img = img.resize((IMG_MAX_SIDE, IMG_MAX_SIDE), Image.Resampling.LANCZOS)
    transparent = img.mode in ("RGBA", "LA") or (
        img.mode == "P" and "transparency" in img.info)
    if transparent:
        fname = secrets.token_hex(12) + ".png"
        img.convert("RGBA").save(os.path.join(UPLOAD_DIR, fname), "PNG", optimize=True)
    else:
        fname = secrets.token_hex(12) + ".jpg"
        img.convert("RGB").save(os.path.join(UPLOAD_DIR, fname), "JPEG",
                                quality=88, optimize=True)
    return fname


def save_images(db, item_id, files):
    """Store uploaded image files on disk and record them in the DB."""
    saved = 0
    for f in files:
        if not f or not f.filename:
            continue
        if os.path.splitext(f.filename)[1].lower() not in ALLOWED_IMG:
            continue
        fname = store_square_image(f)
        if not fname:                      # not a readable image
            continue
        db.execute(
            "INSERT INTO item_images (item_id, filename, original_name, created_at) "
            "VALUES (?, ?, ?, ?)", (item_id, fname, f.filename[:200], now()))
        saved += 1
    if saved:
        log_item_history(db, item_id, "Images added", f"Uploaded {saved} image(s)")
    db.commit()
    return saved


def remove_files(filenames):
    for name in filenames:
        try:
            os.remove(os.path.join(UPLOAD_DIR, name))
        except OSError:
            pass


# ------------------------------------------------------------- CSV helpers
def parse_rows(text):
    """Turn CSV text into a list of dicts. A header row is optional; without
    one the columns are read in this order: name, category, location, notes,
    status, taken_to."""
    text = text.lstrip("\ufeff")
    rows = [r for r in csv.reader(io.StringIO(text))
            if any(c.strip() for c in r)]
    if not rows:
        return []
    header = [c.strip().lower() for c in rows[0]]
    colmap = {}
    for idx, h in enumerate(header):
        for field, aliases in HEADER_ALIASES.items():
            if h in aliases and field not in colmap:
                colmap[field] = idx
    if "name" in colmap:          # first row is a header
        rows = rows[1:]
    else:                         # no header: positional
        colmap = {f: i for i, f in enumerate(CSV_FIELDS)}
    return [{f: (r[i].strip() if i < len(r) else "") for f, i in colmap.items()}
            for r in rows]


def import_records(db, records):
    added = dupes = bad = 0
    for rec in records:
        name = rec.get("name", "").strip()
        if not name:
            bad += 1
            continue
        location = rec.get("location", "").strip() or "Unspecified"
        exists = db.execute(
            "SELECT 1 FROM items WHERE name = ? COLLATE NOCASE "
            "AND location = ? COLLATE NOCASE", (name, location)).fetchone()
        if exists:
            dupes += 1
            continue
        cat_id = None
        cat_name = rec.get("category", "").strip()
        if cat_name:
            row = db.execute("SELECT id FROM categories WHERE name = ?",
                             (cat_name,)).fetchone()
            cat_id = row["id"] if row else db.execute(
                "INSERT INTO categories (name) VALUES (?)",
                (cat_name,)).lastrowid
        out = 1 if rec.get("status", "").strip().lower() in OUT_WORDS else 0
        taken_to = rec.get("taken_to", "").strip() or ("Unknown" if out else "")
        try:
            qty = max(0, int(rec.get("quantity", 1) or 1))
        except (ValueError, TypeError):
            qty = 1
        try:
            min_qty = max(0, int(rec.get("min_quantity", 0) or 0))
        except (ValueError, TypeError):
            min_qty = 0
        try:
            price = max(0.0, float(rec.get("purchase_price", 0.0) or 0.0))
        except (ValueError, TypeError):
            price = 0.0

        tags = rec.get("tags", "").strip()
        p_date = parse_date(rec.get("purchase_date", ""))
        w_exp = parse_date(rec.get("warranty_expiry", ""))
        exp_date = parse_date(rec.get("expiry_date", ""))
        condition = rec.get("condition", "").strip()

        raw_left = rec.get("amount_left", "").strip().rstrip("%")
        try:
            if raw_left in ("", "-1", "n/a", "na", "none", "—", "-"):
                amt_left = -1
            else:
                amt_left = max(0, min(100, int(float(raw_left))))
        except (ValueError, TypeError):
            amt_left = -1

        cur = db.execute(
            "INSERT INTO items (name, category_id, location, notes, taken_out, "
            "taken_to, taken_on, expiry_date, quantity, min_quantity, tags, "
            "purchase_date, purchase_price, warranty_expiry, condition, amount_left, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (name, cat_id, location, rec.get("notes", "").strip(), out,
             taken_to if out else "", now() if out else "",
             exp_date, qty, min_qty, tags, p_date, price, w_exp, condition, amt_left, now()))
        added += 1
        log_item_history(db, cur.lastrowid, "Created", f"Imported from CSV (Qty: {qty}, Kept at: '{location}')")
    db.commit()
    return added, dupes, bad


# ------------------------------------------------------------------- routes
@app.route("/")
def index():
    db = get_db()
    items = [dict(r) for r in db.execute(
        "SELECT i.id, i.name, i.category_id, COALESCE(c.name,'') AS category, "
        "i.location, i.notes, i.taken_out, i.taken_to, i.taken_on, i.created_at, "
        "i.expiry_date, COALESCE(i.quantity, 1) AS quantity, "
        "COALESCE(i.min_quantity, 0) AS min_quantity, COALESCE(i.tags, '') AS tags, "
        "COALESCE(i.purchase_date, '') AS purchase_date, "
        "COALESCE(i.purchase_price, 0.0) AS purchase_price, "
        "COALESCE(i.warranty_expiry, '') AS warranty_expiry, "
        "COALESCE(i.condition, '') AS condition, "
        "COALESCE(i.amount_left, -1) AS amount_left, "
        "CASE i.taken_out WHEN 1 THEN 'Taken out' ELSE 'In place' END AS status "
        "FROM items i LEFT JOIN categories c ON c.id = i.category_id "
        "ORDER BY i.name COLLATE NOCASE").fetchall()]
    imgs = {}
    for r in db.execute("SELECT id, item_id, filename FROM item_images ORDER BY id"):
        imgs.setdefault(r["item_id"], []).append(
            {"id": r["id"], "url": url_for("uploaded_file", name=r["filename"])})
    today = date.today()
    all_tags_set = set()
    for it in items:
        it["images"] = imgs.get(it["id"], [])
        it["days_left"], it["expiry_status"] = expiry_info(it["expiry_date"], today)
        it["warranty_days_left"], it["warranty_status"] = warranty_info(it["warranty_expiry"], today)

        # Parse tags into list for filtering
        raw_tags = it.get("tags") or ""
        tags_list = [t.strip().lstrip("#") for t in raw_tags.split(",") if t.strip()]
        it["tags_list"] = tags_list
        for t in tags_list:
            all_tags_set.add(t)

        # Low stock indicator
        qty = it.get("quantity", 1)
        min_qty = it.get("min_quantity", 0)
        it["is_low_stock"] = bool((min_qty > 0 and qty <= min_qty) or qty == 0)

    categories = db.execute(
        "SELECT c.*, COUNT(i.id) AS cnt FROM categories c "
        "LEFT JOIN items i ON i.category_id = c.id "
        "GROUP BY c.id ORDER BY c.name COLLATE NOCASE").fetchall()
    total = len(items)
    out = sum(1 for i in items if i["taken_out"])
    expired = sum(1 for i in items if i["expiry_status"] == "expired")
    soon = sum(1 for i in items if i["expiry_status"] == "soon")
    low_stock = sum(1 for i in items if i["is_low_stock"])
    active_warranty = sum(1 for i in items if i["warranty_status"] in ("active", "soon"))
    needs = sorted((i for i in items if i["expiry_status"] in ("expired", "soon")),
                   key=lambda i: i["days_left"])

    locations = sorted(list(set(i["location"] for i in items if i.get("location"))), key=lambda x: x.lower())
    all_tags = sorted(list(all_tags_set), key=lambda x: x.lower())

    return render_template("index.html", items=items, categories=categories,
                           total=total, out=out, expired=expired,
                           soon=soon, low_stock=low_stock, active_warranty=active_warranty,
                           locations=locations, all_tags=all_tags,
                           attention=needs[:6], attn_total=len(needs),
                           warn_days=EXPIRY_WARN_DAYS)


@app.post("/items/add")
def add_item():
    name = request.form.get("name", "").strip()
    location = request.form.get("location", "").strip()
    if not name or not location:
        flash("Item name and where it is kept are required.", "danger")
        return redirect(url_for("index"))

    try:
        qty = max(0, int(request.form.get("quantity", 1) or 1))
    except (ValueError, TypeError):
        qty = 1
    try:
        min_qty = max(0, int(request.form.get("min_quantity", 0) or 0))
    except (ValueError, TypeError):
        min_qty = 0
    try:
        price = max(0.0, float(request.form.get("purchase_price", 0.0) or 0.0))
    except (ValueError, TypeError):
        price = 0.0

    tags = request.form.get("tags", "").strip()
    p_date = parse_date(request.form.get("purchase_date"))
    w_exp = parse_date(request.form.get("warranty_expiry"))
    exp_date = parse_date(request.form.get("expiry_date"))
    condition = request.form.get("condition", "").strip()

    raw_left = request.form.get("amount_left", "-1").strip().rstrip("%")
    try:
        if raw_left in ("", "-1", "n/a", "na", "none", "—", "-"):
            amt_left = -1
        else:
            amt_left = max(0, min(100, int(float(raw_left))))
    except (ValueError, TypeError):
        amt_left = -1

    db = get_db()
    cur = db.execute(
        "INSERT INTO items (name, category_id, location, notes, expiry_date, "
        "quantity, min_quantity, tags, purchase_date, purchase_price, warranty_expiry, "
        "condition, amount_left, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (name, category_or_none(request.form.get("category_id")), location,
         request.form.get("notes", "").strip(), exp_date,
         qty, min_qty, tags, p_date, price, w_exp, condition, amt_left, now()))
    new_id = cur.lastrowid
    detail_parts = [f"Qty: {qty}"]
    if condition:
        detail_parts.append(f"Condition: {condition}")
    if amt_left >= 0:
        detail_parts.append(f"Fullness: {amt_left}%")
    log_item_history(db, new_id, "Created", f"Added in '{location}' ({', '.join(detail_parts)})")
    db.commit()

    n_img = save_images(db, new_id, request.files.getlist("images"))
    flash(f"Added “{name}”" + (f" with {n_img} image(s)." if n_img else "."),
          "success")
    return redirect(url_for("index"))


@app.post("/items/<int:item_id>/edit")
def edit_item(item_id):
    name = request.form.get("name", "").strip()
    location = request.form.get("location", "").strip()
    if not name or not location:
        flash("Item name and where it is kept are required.", "danger")
        return redirect(url_for("index"))

    db = get_db()
    old = db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
    if not old:
        flash("Item not found.", "danger")
        return redirect(url_for("index"))

    try:
        qty = max(0, int(request.form.get("quantity", old["quantity"] if "quantity" in old.keys() else 1) or 1))
    except (ValueError, TypeError):
        qty = 1
    try:
        min_qty = max(0, int(request.form.get("min_quantity", old["min_quantity"] if "min_quantity" in old.keys() else 0) or 0))
    except (ValueError, TypeError):
        min_qty = 0
    try:
        price = max(0.0, float(request.form.get("purchase_price", old["purchase_price"] if "purchase_price" in old.keys() else 0.0) or 0.0))
    except (ValueError, TypeError):
        price = 0.0

    tags = request.form.get("tags", "").strip()
    p_date = parse_date(request.form.get("purchase_date"))
    w_exp = parse_date(request.form.get("warranty_expiry"))
    exp_date = parse_date(request.form.get("expiry_date"))
    notes = request.form.get("notes", "").strip()
    cat_id = category_or_none(request.form.get("category_id"))
    condition = request.form.get("condition", "").strip()

    raw_left = request.form.get("amount_left", "-1").strip().rstrip("%")
    try:
        if raw_left in ("", "-1", "n/a", "na", "none", "—", "-"):
            amt_left = -1
        else:
            amt_left = max(0, min(100, int(float(raw_left))))
    except (ValueError, TypeError):
        amt_left = -1

    # Compare changes for audit log
    changes = []
    if name != old["name"]:
        changes.append(f"Name changed: '{old['name']}' → '{name}'")
    if location != old["location"]:
        changes.append(f"Location changed: '{old['location']}' → '{location}'")
    if "quantity" in old.keys() and qty != (old["quantity"] or 0):
        changes.append(f"Quantity: {old['quantity']} → {qty}")
    if "tags" in old.keys() and tags != (old["tags"] or ""):
        changes.append("Tags updated")
    if exp_date != (old["expiry_date"] or ""):
        changes.append(f"Expiry: '{old['expiry_date']}' → '{exp_date}'")
    if "warranty_expiry" in old.keys() and w_exp != (old["warranty_expiry"] or ""):
        changes.append(f"Warranty: '{old['warranty_expiry']}' → '{w_exp}'")
    if "condition" in old.keys() and condition != (old["condition"] or ""):
        changes.append(f"Condition: '{old['condition'] or 'Unspecified'}' → '{condition or 'Unspecified'}'")
    if "amount_left" in old.keys() and amt_left != (old["amount_left"] if old["amount_left"] is not None else -1):
        old_val_str = f"{old['amount_left']}%" if old['amount_left'] is not None and old['amount_left'] >= 0 else "N/A"
        new_val_str = f"{amt_left}%" if amt_left >= 0 else "N/A"
        changes.append(f"Fullness: {old_val_str} → {new_val_str}")

    db.execute(
        "UPDATE items SET name=?, category_id=?, location=?, notes=?, "
        "expiry_date=?, quantity=?, min_quantity=?, tags=?, purchase_date=?, "
        "purchase_price=?, warranty_expiry=?, condition=?, amount_left=? WHERE id=?",
        (name, cat_id, location, notes, exp_date, qty, min_qty, tags,
         p_date, price, w_exp, condition, amt_left, item_id))

    if changes:
        log_item_history(db, item_id, "Edited", "; ".join(changes))
    db.commit()
    flash("Item updated.", "success")
    return redirect(url_for("index"))


@app.post("/items/<int:item_id>/adjust-quantity")
def adjust_quantity(item_id):
    delta = request.form.get("delta", "0")
    try:
        delta_val = int(delta)
    except ValueError:
        return {"error": "Invalid delta"}, 400

    db = get_db()
    item = db.execute("SELECT id, name, quantity, min_quantity FROM items WHERE id=?", (item_id,)).fetchone()
    if not item:
        return {"error": "Item not found"}, 404

    old_qty = item["quantity"] or 0
    new_qty = max(0, old_qty + delta_val)
    min_qty = item["min_quantity"] or 0
    is_low = bool((min_qty > 0 and new_qty <= min_qty) or new_qty == 0)

    db.execute("UPDATE items SET quantity=? WHERE id=?", (new_qty, item_id))
    sign = "+" if delta_val > 0 else ""
    log_item_history(db, item_id, "Quantity adjusted", f"Changed from {old_qty} to {new_qty} ({sign}{delta_val})")
    db.commit()
    return {"id": item_id, "quantity": new_qty, "old_quantity": old_qty, "is_low_stock": is_low}


@app.get("/items/<int:item_id>/history")
def get_item_history(item_id):
    db = get_db()
    rows = db.execute(
        "SELECT id, action, details, timestamp FROM item_history "
        "WHERE item_id = ? ORDER BY id DESC", (item_id,)
    ).fetchall()
    return [dict(r) for r in rows]


@app.post("/items/<int:item_id>/take")
def take_out(item_id):
    where = request.form.get("taken_to", "").strip()
    if not where:
        flash("Tell me where it went (room, person, bag...).", "danger")
        return redirect(url_for("index"))
    db = get_db()
    db.execute("UPDATE items SET taken_out=1, taken_to=?, taken_on=? WHERE id=?",
               (where, now(), item_id))
    log_item_history(db, item_id, "Taken out", f"Taken to: {where}")
    db.commit()
    flash("Marked as taken out.", "warning")
    return redirect(url_for("index"))


@app.post("/items/<int:item_id>/return")
def put_back(item_id):
    db = get_db()
    item = db.execute("SELECT location FROM items WHERE id=?", (item_id,)).fetchone()
    loc = item["location"] if item else "place"
    db.execute("UPDATE items SET taken_out=0, taken_to='', taken_on='' WHERE id=?",
               (item_id,))
    log_item_history(db, item_id, "Put back", f"Returned to place: {loc}")
    db.commit()
    flash("Item is back in its place.", "success")
    return redirect(url_for("index"))


@app.post("/items/<int:item_id>/delete")
def delete_item(item_id):
    db = get_db()
    files = [r["filename"] for r in db.execute(
        "SELECT filename FROM item_images WHERE item_id=?", (item_id,))]
    db.execute("DELETE FROM items WHERE id=?", (item_id,))  # images & history cascade
    remove_files(files)
    db.commit()
    flash("Item deleted.", "secondary")
    return redirect(url_for("index"))


@app.post("/items/bulk-delete")
def bulk_delete_items():
    ids = [int(i) for i in request.form.getlist("ids") if str(i).isdigit()]
    if not ids:
        ids_str = request.form.get("ids", "").strip()
        if ids_str:
            ids = [int(i.strip()) for i in ids_str.split(",") if i.strip().isdigit()]
    if not ids:
        flash("No items selected.", "warning")
        return redirect(url_for("index"))

    db = get_db()
    placeholders = ",".join("?" for _ in ids)
    files = [r["filename"] for r in db.execute(
        f"SELECT filename FROM item_images WHERE item_id IN ({placeholders})", ids)]
    db.execute(f"DELETE FROM items WHERE id IN ({placeholders})", ids)
    remove_files(files)
    db.commit()
    count = len(ids)
    flash(f"Deleted {count} item{'s' if count != 1 else ''}.", "secondary")
    return redirect(url_for("index"))


@app.post("/items/bulk-edit")
def bulk_edit_items():
    ids = [int(i) for i in request.form.getlist("ids") if str(i).isdigit()]
    if not ids:
        ids_str = request.form.get("ids", "").strip()
        if ids_str:
            ids = [int(i.strip()) for i in ids_str.split(",") if i.strip().isdigit()]
    if not ids:
        flash("No items selected.", "warning")
        return redirect(url_for("index"))

    db = get_db()
    updates = []
    params = []

    # Category action
    cat_action = request.form.get("category_action", "keep")
    if cat_action == "clear":
        updates.append("category_id = NULL")
    elif cat_action == "set":
        cat_id = category_or_none(request.form.get("category_id"))
        updates.append("category_id = ?")
        params.append(cat_id)

    # Location action
    loc_action = request.form.get("location_action", "keep")
    if loc_action == "set":
        new_loc = request.form.get("location", "").strip()
        if new_loc:
            updates.append("location = ?")
            params.append(new_loc)

    # Status action
    status_action = request.form.get("status_action", "keep")
    if status_action == "return":
        updates.append("taken_out = 0, taken_to = '', taken_on = ''")
    elif status_action == "take":
        where = request.form.get("taken_to", "").strip() or "Unknown"
        updates.append("taken_out = 1, taken_to = ?, taken_on = ?")
        params.extend([where, now()])

    # Expiry action
    exp_action = request.form.get("expiry_action", "keep")
    if exp_action == "clear":
        updates.append("expiry_date = ''")
    elif exp_action == "set":
        exp = parse_date(request.form.get("expiry_date", ""))
        updates.append("expiry_date = ?")
        params.append(exp)

    # Quantity action
    qty_action = request.form.get("quantity_action", "keep")
    if qty_action == "set":
        try:
            q_val = max(0, int(request.form.get("quantity_val", 1) or 1))
            updates.append("quantity = ?")
            params.append(q_val)
        except (ValueError, TypeError):
            pass
    elif qty_action == "add":
        try:
            q_val = int(request.form.get("quantity_val", 1) or 1)
            updates.append("quantity = MAX(0, quantity + ?)")
            params.append(q_val)
        except (ValueError, TypeError):
            pass

    # Tags action
    tags_action = request.form.get("tags_action", "keep")
    if tags_action == "clear":
        updates.append("tags = ''")
    elif tags_action == "set":
        t_val = request.form.get("tags_val", "").strip()
        updates.append("tags = ?")
        params.append(t_val)
    elif tags_action == "append":
        t_val = request.form.get("tags_val", "").strip()
        if t_val:
            updates.append("tags = CASE WHEN tags IS NULL OR tags = '' THEN ? ELSE tags || ', ' || ? END")
            params.extend([t_val, t_val])

    # Notes action
    notes_action = request.form.get("notes_action", "keep")
    if notes_action == "clear":
        updates.append("notes = ''")
    elif notes_action == "replace":
        n_text = request.form.get("notes_text", "").strip()
        updates.append("notes = ?")
        params.append(n_text)
    elif notes_action == "append":
        n_text = request.form.get("notes_text", "").strip()
        if n_text:
            updates.append("notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || CHAR(10) || ? END")
            params.extend([n_text, n_text])

    if not updates:
        flash("No changes were specified for bulk edit.", "warning")
        return redirect(url_for("index"))

    placeholders = ",".join("?" for _ in ids)
    sql = f"UPDATE items SET {', '.join(updates)} WHERE id IN ({placeholders})"
    params.extend(ids)
    db.execute(sql, params)

    for item_id in ids:
        log_item_history(db, item_id, "Bulk edited", "Updated via bulk edit")
    db.commit()

    count = len(ids)
    flash(f"Updated {count} item{'s' if count != 1 else ''}.", "success")
    return redirect(url_for("index"))


@app.post("/items/bulk-take")
def bulk_take_items():
    ids = [int(i) for i in request.form.getlist("ids") if str(i).isdigit()]
    if not ids:
        ids_str = request.form.get("ids", "").strip()
        if ids_str:
            ids = [int(i.strip()) for i in ids_str.split(",") if i.strip().isdigit()]
    if not ids:
        flash("No items selected.", "warning")
        return redirect(url_for("index"))

    where = request.form.get("taken_to", "").strip()
    if not where:
        flash("Tell me where they went (room, person, bag...).", "danger")
        return redirect(url_for("index"))

    db = get_db()
    placeholders = ",".join("?" for _ in ids)
    db.execute(f"UPDATE items SET taken_out = 1, taken_to = ?, taken_on = ? WHERE id IN ({placeholders})",
               [where, now()] + ids)
    for it_id in ids:
        log_item_history(db, it_id, "Taken out", f"Bulk taken to: {where}")
    db.commit()
    count = len(ids)
    flash(f"Marked {count} item{'s' if count != 1 else ''} as taken out.", "warning")
    return redirect(url_for("index"))


@app.post("/items/bulk-return")
def bulk_return_items():
    ids = [int(i) for i in request.form.getlist("ids") if str(i).isdigit()]
    if not ids:
        ids_str = request.form.get("ids", "").strip()
        if ids_str:
            ids = [int(i.strip()) for i in ids_str.split(",") if i.strip().isdigit()]
    if not ids:
        flash("No items selected.", "warning")
        return redirect(url_for("index"))

    db = get_db()
    placeholders = ",".join("?" for _ in ids)
    db.execute(f"UPDATE items SET taken_out = 0, taken_to = '', taken_on = '' WHERE id IN ({placeholders})", ids)
    for it_id in ids:
        log_item_history(db, it_id, "Put back", "Returned to place via bulk action")
    db.commit()
    count = len(ids)
    flash(f"Marked {count} item{'s' if count != 1 else ''} as back in place.", "success")
    return redirect(url_for("index"))


@app.get("/uploads/<path:name>")
def uploaded_file(name):
    return send_from_directory(UPLOAD_DIR, name)


@app.post("/items/<int:item_id>/images")
def upload_images(item_id):
    db = get_db()
    if not db.execute("SELECT 1 FROM items WHERE id=?", (item_id,)).fetchone():
        flash("Item not found.", "danger")
        return redirect(url_for("index"))
    n = save_images(db, item_id, request.files.getlist("images"))
    if n:
        flash(f"Uploaded {n} image{'s' if n != 1 else ''}.", "success")
    else:
        flash("No valid images (use PNG, JPG, GIF or WEBP).", "danger")
    return redirect(url_for("index", open=item_id))


@app.post("/images/<int:image_id>/delete")
def delete_image(image_id):
    db = get_db()
    row = db.execute("SELECT * FROM item_images WHERE id=?", (image_id,)).fetchone()
    if not row:
        return redirect(url_for("index"))
    item_id = row["item_id"]
    db.execute("DELETE FROM item_images WHERE id=?", (image_id,))
    remove_files([row["filename"]])
    log_item_history(db, item_id, "Image removed", f"Removed image {row['original_name'] or row['filename']}")
    db.commit()
    flash("Image removed.", "secondary")
    return redirect(url_for("index", open=item_id))


@app.post("/categories/add")
def add_category():
    name = request.form.get("name", "").strip()
    if not name:
        flash("Category name can't be empty.", "danger")
        return redirect(url_for("index"))
    db = get_db()
    try:
        db.execute("INSERT INTO categories (name) VALUES (?)", (name,))
        db.commit()
        flash(f"Category “{name}” added.", "success")
    except sqlite3.IntegrityError:
        flash("That category already exists.", "danger")
    return redirect(url_for("index"))


@app.post("/categories/<int:cat_id>/delete")
def delete_category(cat_id):
    db = get_db()
    db.execute("DELETE FROM categories WHERE id=?", (cat_id,))
    db.commit()
    flash("Category deleted (its items are now uncategorised).", "secondary")
    return redirect(url_for("index"))


# ------------------------------------------------------- backup / restore
@app.get("/backup/download")
def download_backup():
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    filename = f"home_inventory_backup_{ts}.db"
    return send_file(DB_PATH, as_attachment=True, download_name=filename, mimetype="application/x-sqlite3")


@app.post("/backup/restore")
def restore_backup():
    f = request.files.get("backup_file")
    if not f or not f.filename:
        flash("Please choose a valid .db backup file to restore.", "danger")
        return redirect(url_for("index"))

    # Read first 16 bytes to check SQLite header
    header = f.stream.read(16)
    if header != b"SQLite format 3\x00":
        flash("Invalid backup file: Not a valid SQLite database.", "danger")
        return redirect(url_for("index"))
    f.stream.seek(0)

    # Save to a temporary file and verify schema
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db")
    os.close(tmp_fd)

    try:
        f.save(tmp_path)
        test_conn = sqlite3.connect(tmp_path)
        tables = [r[0] for r in test_conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        test_conn.close()

        if "items" not in tables:
            os.remove(tmp_path)
            flash("Invalid backup file: Database does not contain the 'items' table.", "danger")
            return redirect(url_for("index"))

        # Close any active db connection in g
        if "db" in g:
            g.db.close()
            g.pop("db", None)

        # Make a safety copy of current db
        backup_path = DB_PATH + ".bak"
        if os.path.exists(DB_PATH):
            shutil.copy2(DB_PATH, backup_path)

        # Replace current db with restored db
        shutil.copy2(tmp_path, DB_PATH)
        os.remove(tmp_path)

        # Run init_db to ensure any missing columns/tables are present
        init_db()
        flash("Database restored successfully! A safety backup was saved as inventory.db.bak.", "success")
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        flash(f"Failed to restore database: {e}", "danger")

    return redirect(url_for("index"))


# ------------------------------------------------------- import / export
@app.post("/import")
def import_items():
    f = request.files.get("file")
    if f and f.filename:
        if not f.filename.lower().endswith((".csv", ".txt")):
            flash("Please upload a .csv file.", "danger")
            return redirect(url_for("index"))
        raw = f.read()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")
    else:
        text = request.form.get("bulk_text", "")

    try:
        records = parse_rows(text)
    except csv.Error as exc:
        flash(f"Couldn't read that CSV: {exc}", "danger")
        return redirect(url_for("index"))
    if not records:
        flash("Nothing to import - the file/text was empty.", "danger")
        return redirect(url_for("index"))

    added, dupes, bad = import_records(get_db(), records)
    parts = [f"Imported {added} item{'s' if added != 1 else ''}"]
    if dupes:
        parts.append(f"{dupes} duplicate{'s' if dupes != 1 else ''} skipped")
    if bad:
        parts.append(f"{bad} row{'s' if bad != 1 else ''} without a name skipped")
    flash(", ".join(parts) + ".", "success" if added else "warning")
    return redirect(url_for("index"))


def csv_response(rows, filename):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_FIELDS)
    writer.writerows(rows)
    return Response("\ufeff" + buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition":
                             f"attachment; filename={filename}"})


@app.get("/export.csv")
def export_csv():
    rows = get_db().execute(
        "SELECT i.name, COALESCE(c.name,''), i.location, i.notes, "
        "CASE i.taken_out WHEN 1 THEN 'out' ELSE 'in' END, i.taken_to, "
        "i.expiry_date, COALESCE(i.quantity, 1), COALESCE(i.min_quantity, 0), "
        "COALESCE(i.tags, ''), COALESCE(i.purchase_date, ''), "
        "COALESCE(i.purchase_price, 0.0), COALESCE(i.warranty_expiry, '') "
        "FROM items i LEFT JOIN categories c ON c.id = i.category_id "
        "ORDER BY i.name COLLATE NOCASE").fetchall()
    return csv_response([tuple(r) for r in rows], "home_inventory.csv")


@app.get("/template.csv")
def template_csv():
    return csv_response([
        ("Passport", "Documents", "Master Bedroom / Almirah / Top Drawer", "Keep with visa papers", "in", "", "2031-06-30", "1", "0", "documents, travel", "2021-06-30", "0", ""),
        ("Cordless drill", "Tools", "Garage / Tool Rack / Shelf 2", "Includes battery & charger", "out", "Neighbour - Rahul", "", "1", "1", "tools, power", "2023-01-15", "89.99", "2025-01-15"),
        ("AA Rechargeable Batteries", "Electronics", "Living Room / TV Console / Drawer 1", "Pack of 4", "in", "", "", "4", "2", "spare, batteries", "2024-05-10", "14.50", "2026-05-10"),
        ("Cough syrup", "Medicines", "Kitchen / Fridge Door", "Take 5ml twice daily", "in", "", "03/2027", "1", "1", "medicines, health", "2024-08-01", "7.99", ""),
    ], "home_inventory_template.csv")


init_db()

def open_browser(port=5000):
    webbrowser.open(f"http://127.0.0.1:{port}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", SERVER_PORT))
    debug_mode = True
    local_ip = get_local_ip()

    print("\n" + "=" * 58)
    print("  Home Inventory is running!")
    print(f"  -> Local:   http://127.0.0.1:{port}")
    print(f"  -> Network: http://{local_ip}:{port}")
    print("  Connect phones, tablets, or PCs on the same Wi-Fi/LAN.")
    print("=" * 58 + "\n")

    # Auto-open browser tab once on start (guarded against Werkzeug reloader double-trigger)
    if not debug_mode or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        threading.Timer(1.2, lambda: open_browser(port)).start()
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
