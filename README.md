# Home Inventory

    pip install -r requirements.txt
    python app.py          # then open http://127.0.0.1:5000

Everything runs offline - Bootstrap, icons, Bootstrap Table, jQuery and the
Inter / JetBrains Mono fonts are installed locally in `static/vendor/`.

| Path | What it is |
|------|------------|
| `app.py` | Flask routes, SQLite (`inventory.db`, auto-created), CSV import/export, image processing |
| `templates/index.html` | The whole page: layout, modals, forms |
| `static/css/app.css` | **Your style overrides** (loaded after Bootstrap) |
| `static/css/fonts.css` | Local @font-face rules |
| `static/js/app.js` | Table setup, filters, detail modal, image viewer |
| `static/vendor/` | Bootstrap 5.3.3, Bootstrap Icons 1.11.3, Bootstrap Table 1.23.5, jQuery 3.7.1, fonts |
| `uploads/` | Item images (created on first upload). Back it up together with `inventory.db` |
| `homeopathy_starter.csv` | Sample import file |

Uploaded images are centre-cropped to 1:1 and capped at 1024 x 1024 px.
Expiry warning window: `EXPIRY_WARN_DAYS` in `app.py`.
