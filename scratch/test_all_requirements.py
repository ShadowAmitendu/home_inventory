import re
import sqlite3

def get_next_loc_code(existing_locs):
    code_regex = re.compile(r'^([A-Za-z]+)(\d+)-([A-Za-z]+)$')
    max_box = 1
    max_slot_idx = -1
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    for loc in existing_locs:
        m = code_regex.match(loc.strip())
        if m:
            b_num = int(m.group(2))
            letter = m.group(3).upper()
            if letter in alphabet:
                s_idx = alphabet.index(letter)
                if b_num > max_box:
                    max_box = b_num
                    max_slot_idx = s_idx
                elif b_num == max_box and s_idx > max_slot_idx:
                    max_slot_idx = s_idx

    if max_slot_idx == -1:
        return 'B1-A'
    if max_slot_idx < 25:
        return f'B{max_box}-{alphabet[max_slot_idx + 1]}'
    else:
        return f'B{max_box + 1}-A'

conn = sqlite3.connect('inventory.db')
cursor = conn.cursor()
cursor.execute('SELECT location FROM items WHERE location IS NOT NULL AND location != ""')
locs = [r[0] for r in cursor.fetchall()]

box_codes = [l for l in locs if re.match(r'^B\d+-[A-Z]$', l)]
print('Total location count in DB:', len(locs))
print('Box codes count:', len(box_codes))
print('Sample box codes:', box_codes[:5], '...', box_codes[-5:])
next_code = get_next_loc_code(locs)
print('Next auto-generated location code:', next_code)

assert get_next_loc_code([]) == 'B1-A'
assert get_next_loc_code(['B1-A']) == 'B1-B'
assert get_next_loc_code(['B1-Z']) == 'B2-A'
assert get_next_loc_code(['B4-X']) == 'B4-Y'
assert get_next_loc_code(['B4-Z']) == 'B5-A'
print('All getNextLocationCode assertions passed!')

# Test fuzzy search across all contents
def levenshtein(a, b):
    if a == b: return 0
    if not len(a): return len(b)
    if not len(b): return len(a)
    v0 = list(range(len(b) + 1))
    v1 = [0] * (len(b) + 1)
    for i in range(len(a)):
        v1[0] = i + 1
        for j in range(len(b)):
            cost = 0 if a[i] == b[j] else 1
            v1[j + 1] = min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
        for j in range(len(b) + 1):
            v0[j] = v1[j]
    return v1[len(b)]

def is_subsequence(pattern, text):
    p_idx = 0
    t_idx = 0
    while p_idx < len(pattern) and t_idx < len(text):
        if pattern[p_idx] == text[t_idx]:
            p_idx += 1
        t_idx += 1
    return p_idx == len(pattern)

def match_token(token, full_text, words):
    if not token: return True
    if token in full_text: return True
    if len(token) >= 3:
        for w in words:
            if len(w) >= len(token) and is_subsequence(token, w):
                return True
    max_dist = 1 if len(token) <= 4 else (2 if len(token) <= 8 else 3)
    for w in words:
        if abs(len(w) - len(token)) <= max_dist:
            if levenshtein(token, w) <= max_dist:
                return True
    return False

def fuzzy_match_row(row, query):
    if not query or not query.strip(): return True
    fields = [
        row.get('name') or '',
        row.get('category') or '',
        row.get('location') or '',
        row.get('notes') or '',
        row.get('condition') or '',
        row.get('tags') or '',
        row.get('status') or '',
        'taken out' if row.get('taken_out') else 'in place',
        row.get('taken_to') or '',
        row.get('expiry_date') or '',
        row.get('warranty_expiry') or '',
        str(row.get('quantity')) if row.get('quantity') is not None else '',
        f"{row.get('amount_left')}% {row.get('amount_left')}" if row.get('amount_left') is not None and row.get('amount_left') >= 0 else '',
        str(row.get('purchase_price')) if row.get('purchase_price') is not None else '',
        row.get('purchase_date') or ''
    ]
    full_text = ' '.join(fields).lower()
    clean_full_text = re.sub(r'[^a-z0-9\s-]', ' ', full_text)
    words = clean_full_text.split()
    q_lower = query.lower().strip()
    if q_lower in full_text or q_lower in clean_full_text:
        return True
    tokens = q_lower.split()
    return all(match_token(t, full_text, words) for t in tokens)

cursor.execute('''
SELECT i.id, i.name, c.name as category, i.location, i.notes, i.condition, i.tags, 
       i.taken_out, i.taken_to, i.expiry_date, i.warranty_expiry, i.quantity, 
       i.amount_left, i.purchase_price, i.purchase_date 
FROM items i
LEFT JOIN categories c ON i.category_id = c.id
''')
cols = [c[0] for c in cursor.description]
all_items = [dict(zip(cols, row)) for row in cursor.fetchall()]

# Test 1: Typo in item name
res1 = [it['name'] for it in all_items if fuzzy_match_row(it, 'arnca')]
print('Search "arnca" (typo for Arnica):', res1)
assert any('Arnica' in n for n in res1)

# Test 2: Search by custom box code
res2 = [it['name'] for it in all_items if fuzzy_match_row(it, 'b1-a')]
print('Search "b1-a" (box code):', res2)
assert len(res2) >= 1

# Test 3: Search notes content
res3 = [it['name'] for it in all_items if fuzzy_match_row(it, 'bruise')]
print('Search "bruise" (notes/use-cases):', res3[:3])
assert len(res3) >= 1

# Test 4: Search condition or amount left if present
test_item = {'name': 'Drill Kit', 'category': 'Tools', 'location': 'B2-A', 'condition': 'Like New', 'amount_left': 75}
assert fuzzy_match_row(test_item, 'like new')
assert fuzzy_match_row(test_item, '75%')
assert fuzzy_match_row(test_item, 'tools')

print('All fuzzy search tests passed!')
