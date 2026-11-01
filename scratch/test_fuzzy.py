def levenshtein(a, b):
    if a == b: return 0
    if not a: return len(b)
    if not b: return len(a)
    v0 = list(range(len(b) + 1))
    v1 = [0] * (len(b) + 1)
    for i in range(len(a)):
        v1[0] = i + 1
        for j in range(len(b)):
            cost = 0 if a[i] == b[j] else 1
            v1[j + 1] = min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
        v0 = list(v1)
    return v1[len(b)]

def is_subsequence(pattern, text):
    p_idx, t_idx = 0, 0
    while p_idx < len(pattern) and t_idx < len(text):
        if pattern[p_idx] == text[t_idx]:
            p_idx += 1
        t_idx += 1
    return p_idx == len(pattern)

def match_token(token, row_text, words):
    if not token: return True
    if token in row_text: return True
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
        row.get('name', ''),
        row.get('category', ''),
        row.get('location', ''),
        row.get('notes', ''),
        row.get('condition', ''),
        row.get('tags', ''),
        ' '.join(row.get('tags_list', [])),
        row.get('status', ''),
        'taken out' if row.get('taken_out') else 'in place',
        row.get('taken_to', ''),
        row.get('expiry_date', ''),
        row.get('warranty_expiry', ''),
        str(row.get('quantity', '')),
        f"{row.get('amount_left')}% {row.get('amount_left')}" if row.get('amount_left') is not None and row.get('amount_left') >= 0 else '',
        str(row.get('purchase_price', '')),
        row.get('purchase_date', '')
    ]
    full_text = ' '.join(str(f) for f in fields).lower()
    import re
    clean_full_text = re.sub(r'[^a-z0-9\s-]', ' ', full_text)
    words = clean_full_text.split()
    q_lower = query.lower().strip()
    if q_lower in full_text or q_lower in clean_full_text:
        return True
    tokens = q_lower.split()
    return all(match_token(t, full_text, words) for t in tokens)

# Test cases
sample = {
    'name': 'Arnica 30',
    'category': 'Homeopathy',
    'location': 'B1-A',
    'notes': 'Traditional use: Bruises, muscle soreness, physical trauma',
    'condition': 'Like New',
    'quantity': 1,
    'amount_left': 75,
    'tags_list': ['first-aid', 'pain'],
    'status': 'In place',
    'expiry_date': '2027-05-15'
}

queries = [
    ('arnica', True),       # name exact
    ('arnca', True),        # name typo
    ('bruises', True),      # notes exact
    ('bruis', True),        # notes prefix
    ('muscle', True),       # notes word
    ('homeo', True),        # category prefix
    ('b1-a', True),         # location exact
    ('b1', True),           # location prefix
    ('like new', True),     # condition exact
    ('75%', True),          # amount left
    ('75', True),           # amount left
    ('pain', True),         # tag
    ('first-aid', True),    # tag
    ('firs aid', True),     # tag typo
    ('2027', True),         # expiry year
    ('in place', True),     # status
    ('aspirin', False),     # not in row
    ('b2-f', False),        # different location
]

all_passed = True
for q, expected in queries:
    matched = fuzzy_match_row(sample, q)
    if matched != expected:
        print(f"FAILED for query '{q}': expected {expected}, got {matched}")
        all_passed = False
    else:
        print(f"PASS: '{q}' -> {matched}")

if all_passed:
    print("\nALL FUZZY SEARCH TEST CASES PASSED PERFECTLY!")
