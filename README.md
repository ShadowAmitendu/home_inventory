# Home Inventory

A clean, responsive, offline-ready web application to track physical items, storage boxes, warranties, and locations in your house.

```bash
pip install -r requirements.txt
python app.py          # opens http://127.0.0.1:5000 (and local network IP)
```

Everything runs 100% offline — Bootstrap 5, Bootstrap Icons, Bootstrap Table, Bootswatch themes, GSAP, Html5-QRCode, QRCode.js, jQuery, and local Inter / JetBrains Mono fonts are bundled in `static/vendor/`.

## Key Features

- **Barcodes & QR Codes**:
  - Live webcam / mobile camera scanner with sound feedback (scan item QR to open details, box QR to filter room, or scan barcodes to look up / add items).
  - Storage Box & Item QR code label generator with `@media print` support for label stickers or standard paper.
  - Direct mobile camera capture (`accept="image/*" capture="environment"`).
- **Stock & Inventory Tracking**:
  - Quantity tracking with one-click `+` / `-` adjustments and minimum threshold low-stock alerts.
  - **Product Condition**: Categorize items as *Brand New*, *Like New*, *Good*, *Fair*, *Poor*, or *Damaged / Broken* with distinct visual badges.
  - **How Much Left (Consumable Level)**: Visual fullness gauge (0% to 100% or N/A) with quick level preset buttons (`N/A`, `100%`, `75%`, `50%`, `25%`, `0% Empty`) and in-modal quick adjustments (`+10%`, `-10%`, `Full`, `Half`, `Empty`).
  - Custom tags/labels (`#tools`, `#spare`, `#fragile`) with quick filtering.
  - Purchase tracker & warranty status (days left, active, expiring soon, expired).
- **Organization & Locations**:
  - Hierarchical room & box explorer tree (`Room / Shelf / Box`) with item counts and quick navigation.
  - Complete movement & activity audit log (`item_history` table) tracking item creation, moves, puts back, edits, and quantity changes.
- **Data Safety & Controls**:
  - One-click SQLite database backup (`.db` snapshot) and in-browser restore.
  - Global keyboard shortcuts (`/`, `N`, `S`, `P`, `L`, `B`, `T`, `D`, `?`, `Esc`).
  - 26 Bootswatch themes + Default with smooth radial dark/light transition.

| Path | What it is |
|------|------------|
| `app.py` | Flask backend, SQLite schema & migrations, audit logging, backup/restore, CSV import/export |
| `templates/index.html` | Responsive Bootstrap 5 UI, modals (Scanner, Labels, Tree, History, Backup, Shortcuts) |
| `static/css/app.css` | Theme overrides, dark mode color fixes, timeline, and label print stylesheet |
| `static/css/fonts.css` | Local @font-face rules for Inter Display, Inter, and JetBrains Mono |
| `static/js/app.js` | Bootstrap table, scanner, QR generator, filters, timeline, shortcuts, radial theme toggle |
| `static/vendor/` | Bootstrap 5.3, Bootstrap Icons, Bootstrap Table, Bootswatch, GSAP, Html5-QRCode, QRCode.js |
| `uploads/` | Stored item images (centre-cropped 1:1, max 1024x1024 px) |

