import sqlite3, os

db_path = r"c:\Users\amite\Development\Experiments\home_inventory\inventory.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Get all items where location is 'Homeopathy box'
items = cur.execute("SELECT id, name FROM items WHERE location = 'Homeopathy box' ORDER BY id ASC").fetchall()
print(f"Found {len(items)} items in Homeopathy box")

# Generate custom codes B1-A, B1-B ... B1-Z, B2-A, B2-B ...
alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
updated = 0
for i, (item_id, item_name) in enumerate(items):
    box_num = (i // 26) + 1
    slot_letter = alphabet[i % 26]
    code = f"B{box_num}-{slot_letter}"
    cur.execute("UPDATE items SET location = ? WHERE id = ?", (code, item_id))
    updated += 1

conn.commit()
print(f"Updated {updated} items with custom codes like B1-A to B4-X.")

# Sample check
sample = cur.execute("SELECT id, name, location FROM items LIMIT 10").fetchall()
for s in sample:
    print(s)

conn.close()
