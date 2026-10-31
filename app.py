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
import sqlite3
import threading
import webbrowser
from datetime import date, datetime

from PIL import Image, ImageOps, UnidentifiedImageError
from flask import (Flask, Response, flash, g, redirect,
                   render_template, request, send_from_directory,
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

DEFAULT_CATEGORIES = ["Kitchen", "Tools", "Documents", "Electronics",
                      "Clothing", "Books", "Other"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    location    TEXT NOT NULL,              -- where it is normally kept
    notes       TEXT DEFAULT '',
    taken_out   INTEGER NOT NULL DEFAULT 0, -- 0 = in its place, 1 = taken out
    taken_to    TEXT DEFAULT '',            -- where it is now / who has it
    taken_on    TEXT DEFAULT '',
    expiry_date TEXT DEFAULT '',            -- YYYY-MM-DD, optional
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS item_images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    created_at    TEXT NOT NULL
);
"""

# CSV import ---------------------------------------------------------------
CSV_FIELDS = ["name", "category", "location", "notes", "status", "taken_to",
              "expiry_date"]
HEADER_ALIASES = {
    "name": {"name", "item", "item name"},
    "category": {"category", "type"},
    "location": {"location", "kept at", "where kept", "place", "kept"},
    "notes": {"notes", "note", "description"},
    "status": {"status"},
    "taken_to": {"taken_to", "taken to", "where now", "currently at"},
    "expiry_date": {"expiry_date", "expiry", "expiry date", "expires", "exp",
                    "exp date", "expiration", "expiration date"},
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
    if "expiry_date" not in cols:        # upgrade an older database
        db.execute("ALTER TABLE items ADD COLUMN expiry_date TEXT DEFAULT ''")
    if db.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
        db.executemany("INSERT INTO categories (name) VALUES (?)",
                       [(c,) for c in DEFAULT_CATEGORIES])
    db.commit()
    db.close()


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
        db.execute(
            "INSERT INTO items (name, category_id, location, notes, taken_out, "
            "taken_to, taken_on, expiry_date, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (name, cat_id, location, rec.get("notes", "").strip(), out,
             taken_to if out else "", now() if out else "",
             parse_date(rec.get("expiry_date", "")), now()))
        added += 1
    db.commit()
    return added, dupes, bad


# ------------------------------------------------------------------- routes
@app.route("/")
def index():
    db = get_db()
    items = [dict(r) for r in db.execute(
        "SELECT i.id, i.name, i.category_id, COALESCE(c.name,'') AS category, "
        "i.location, i.notes, i.taken_out, i.taken_to, i.taken_on, i.created_at, "
        "i.expiry_date, "
        "CASE i.taken_out WHEN 1 THEN 'Taken out' ELSE 'In place' END AS status "
        "FROM items i LEFT JOIN categories c ON c.id = i.category_id "
        "ORDER BY i.name COLLATE NOCASE").fetchall()]
    imgs = {}
    for r in db.execute("SELECT id, item_id, filename FROM item_images ORDER BY id"):
        imgs.setdefault(r["item_id"], []).append(
            {"id": r["id"], "url": url_for("uploaded_file", name=r["filename"])})
    today = date.today()
    for it in items:
        it["images"] = imgs.get(it["id"], [])
        it["days_left"], it["expiry_status"] = expiry_info(it["expiry_date"], today)
    categories = db.execute(
        "SELECT c.*, COUNT(i.id) AS cnt FROM categories c "
        "LEFT JOIN items i ON i.category_id = c.id "
        "GROUP BY c.id ORDER BY c.name COLLATE NOCASE").fetchall()
    total = len(items)
    out = sum(1 for i in items if i["taken_out"])
    expired = sum(1 for i in items if i["expiry_status"] == "expired")
    soon = sum(1 for i in items if i["expiry_status"] == "soon")
    needs = sorted((i for i in items if i["expiry_status"] in ("expired", "soon")),
                   key=lambda i: i["days_left"])
    return render_template("index.html", items=items, categories=categories,
                                  total=total, out=out, expired=expired,
                                  soon=soon, attention=needs[:6],
                                  attn_total=len(needs), warn_days=EXPIRY_WARN_DAYS)


@app.post("/items/add")
def add_item():
    name = request.form.get("name", "").strip()
    location = request.form.get("location", "").strip()
    if not name or not location:
        flash("Item name and where it is kept are required.", "danger")
        return redirect(url_for("index"))
    db = get_db()
    cur = db.execute(
        "INSERT INTO items (name, category_id, location, notes, expiry_date, "
        "created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (name, category_or_none(request.form.get("category_id")), location,
         request.form.get("notes", "").strip(),
         parse_date(request.form.get("expiry_date")), now()))
    db.commit()
    n_img = save_images(db, cur.lastrowid, request.files.getlist("images"))
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
    db.execute(
        "UPDATE items SET name=?, category_id=?, location=?, notes=?, "
        "expiry_date=? WHERE id=?",
        (name, category_or_none(request.form.get("category_id")), location,
         request.form.get("notes", "").strip(),
         parse_date(request.form.get("expiry_date")), item_id))
    db.commit()
    flash("Item updated.", "success")
    return redirect(url_for("index"))


@app.post("/items/<int:item_id>/take")
def take_out(item_id):
    where = request.form.get("taken_to", "").strip()
    if not where:
        flash("Tell me where it went (room, person, bag...).", "danger")
        return redirect(url_for("index"))
    db = get_db()
    db.execute("UPDATE items SET taken_out=1, taken_to=?, taken_on=? WHERE id=?",
               (where, now(), item_id))
    db.commit()
    flash("Marked as taken out.", "warning")
    return redirect(url_for("index"))


@app.post("/items/<int:item_id>/return")
def put_back(item_id):
    db = get_db()
    db.execute("UPDATE items SET taken_out=0, taken_to='', taken_on='' WHERE id=?",
               (item_id,))
    db.commit()
    flash("Item is back in its place.", "success")
    return redirect(url_for("index"))


@app.post("/items/<int:item_id>/delete")
def delete_item(item_id):
    db = get_db()
    files = [r["filename"] for r in db.execute(
        "SELECT filename FROM item_images WHERE item_id=?", (item_id,))]
    db.execute("DELETE FROM items WHERE id=?", (item_id,))  # images rows cascade
    remove_files(files)
    db.commit()
    flash("Item deleted.", "secondary")
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
    db.execute("DELETE FROM item_images WHERE id=?", (image_id,))
    db.commit()
    remove_files([row["filename"]])
    flash("Image removed.", "secondary")
    return redirect(url_for("index", open=row["item_id"]))


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
        "CASE i.taken_out WHEN 1 THEN 'out' ELSE 'in' END, i.taken_to, i.expiry_date "
        "FROM items i LEFT JOIN categories c ON c.id = i.category_id "
        "ORDER BY i.name COLLATE NOCASE").fetchall()
    return csv_response([tuple(r) for r in rows], "home_inventory.csv")


@app.get("/template.csv")
def template_csv():
    return csv_response([
        ("Passport", "Documents", "Almirah, top drawer", "Keep with visa papers", "in", "", "2031-06-30"),
        ("Cordless drill", "Tools", "Storeroom shelf 2", "", "out", "Neighbour - Rahul", ""),
        ("Cough syrup", "Medicines", "Fridge door", "Dates can be 31/03/2027 or 03/2027", "in", "", "03/2027"),
    ], "home_inventory_template.csv")


init_db()

def open_browser(port=5000):
    webbrowser.open(f"http://127.0.0.1:{port}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug_mode = True
    # Auto-open browser tab once on start (guarded against Werkzeug reloader double-trigger)
    if not debug_mode or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        threading.Timer(1.2, lambda: open_browser(port)).start()
    app.run(debug=debug_mode, port=port)
