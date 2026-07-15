# Alywillow Copy-Update Reference

Log and how-to for bulk-updating Alywillow item copy (titles + descriptions) in RavenPOS.
Keep this file updated each time a new batch is run.

## Update Log

### 2026-07-09 — Formula lines copy refresh

| | |
|---|---|
| **Input: new copy** | `ALYWILLOW_UPDATED_FORMULAS.csv` (from Alywillow; columns: Formula, Title, Subtitle (Desc 1), Description 2, Description 3) |
| **Input: inventory snapshot** | `ALYWILLOW_FULL_ITEMLIST.csv` (export of the `items` table for the Alywillow consignor, `consignor_id = 3b8c16cc-b807-4c03-a9ed-de7bdb74ead8`) |
| **Output SQL** | `supabase/migrations_manual/alywillow_formula_copy_update.sql` |
| **Result** | 250 of 254 CSV rows matched and updated (ran successfully); 4 unmatched (products don't exist in RavenPOS); 14 were already identical before the run |

Per-formula counts (matched items): Minty Relief 18, Warrior 18, Sagerow 18, Sweet Magic 18,
Riverflow 18, Wildwood 18, Seawillow 18, Firefly 18, Lavender Fields 18, Dragonfly 18,
Butterfly 18, Chocomojo 18, Gardenia 16, Unscented 15, Pumpkinight 3.

**Unmatched (no such item in inventory — create items first if these should exist):**
- Gardenia Bar Sample BAG (would be `ALY-GAM-BAG`)
- Gardenia Mini Bar Sample (would be `ALY-GAM-SAM`)
- Pumpkinight Spritzer (would be `ALY-PNP-001`)
- Pumpkinight Spritzer RB (would be `ALY-PNQ-001`)

**Already identical before the run** (had been hand-updated earlier; included in the SQL anyway — idempotent):
`ALY-MRU-001`, `ALY-MRM-SAM`, `ALY-MRB-DZN`, `ALY-MRP-001`, `ALY-MRV-001`, `ALY-MRQ-001`,
`ALY-MRD-001`, `ALY-MRU-MRV`, `ALY-MR3-MRC`, `ALY-MR4-MRD`, `ALY-FRM-MRF`, `ALY-WAB-001`,
`ALY-WA5-001`, `ALY-WAC-001`

## Column Mapping (CSV → `items` table)

| CSV column | `items` column |
|---|---|
| Title | `name` |
| Subtitle (Desc 1) | `variant_summary` |
| Description 2 | `other_details_1` |
| Description 3 | `other_details_2` |
| — | `updated_at = now()` |

Every UPDATE is keyed on **both** `id` and `sku` so a stale snapshot no-ops instead of
mis-updating. SQL is wrapped in `BEGIN;`/`COMMIT;` — check the row count before it commits.

## Alywillow SKU Scheme (how matching works)

The new-copy CSVs carry no SKUs, so items are matched by deriving the SKU from
Formula + Title: `ALY-<2-letter formula prefix><product code>-<suffix>`.

**Formula prefixes:**

| Formula | Prefix | Formula | Prefix | Formula | Prefix |
|---|---|---|---|---|---|
| Minty Relief | MR | Wildwood | WW | Butterfly | BF |
| Warrior | WA | Seawillow | SE | Gardenia | GA |
| Sagerow | SR | Firefly | FF | Chocomojo | CM |
| Sweet Magic | SM | Lavender Fields | LF | Pumpkinight | PN |
| Riverflow | RF | Dragonfly | DF | Unscented | UN |

**Product codes / SKU patterns** (`XX` = formula prefix):

| Product | SKU |
|---|---|
| UDC (foaming bottle) | `ALY-XXU-001` |
| UDC Refill Bag | `ALY-XXV-001` |
| UDC SET (bottle + bag) | `ALY-XXU-XXV` |
| Spritzer | `ALY-XXP-001` |
| Spritzer RB (refill bag) | `ALY-XXQ-001` |
| Spritzer Set | `ALY-XXP-XXQ` |
| Level 3 / 4 / 5 moisturizer | `ALY-XX3-001` / `ALY-XX4-001` / `ALY-XX5-001` |
| 3 RB (level-3 refill bag) | `ALY-XXC-001` |
| 4 Refill BAG (level-4 refill bag) | `ALY-XXD-001` |
| 3 SET / 4 SET (bottle + bag) | `ALY-XX3-XXC` / `ALY-XX4-XXD` |
| Bar | `ALY-XXB-001` |
| Bar Set of 12 | `ALY-XXB-DZN` |
| Bar Sample BAG (½ lb) | `ALY-XXM-BAG` |
| Mini Bar Sample | `ALY-XXM-SAM` |
| Formula Bundle | `ALY-FRM-XXF` |

**Known irregularities (add to `SKU_FIXUPS` in the script as more are found):**
- Firefly bar sample bag is `ALY-FFH-BAG`, not `ALY-FFM-BAG`.

## Re-running for a Future Batch

1. Export a fresh `items` snapshot for the Alywillow consignor to `ALYWILLOW_FULL_ITEMLIST.csv`
   (fresh matters: `id`+`sku` guards depend on it).
2. Drop the new copy CSV in the repo (same column layout; first line may be junk like "Table 1" —
   the script skips it).
3. Run the generator script below (update the `FORMULAS`/`OUT` paths), review its
   matched/unmatched report, then run the SQL in the Supabase SQL editor.
4. If the reported row count doesn't equal the expected count in the SQL header, `ROLLBACK`.
5. Add an entry to the Update Log above.

### Generator script

Originally run from a scratchpad; preserved here so future batches don't start from zero.

```python
#!/usr/bin/env python3
"""Match an Alywillow updated-copy CSV to items in an inventory export
by SKU and emit UPDATE statements for the items table."""
import csv, re, sys

ITEMLIST = '/Users/jonah/RavenPOS/ALYWILLOW_FULL_ITEMLIST.csv'
FORMULAS = '/Users/jonah/RavenPOS/ALYWILLOW_UPDATED_FORMULAS.csv'
OUT = '/Users/jonah/RavenPOS/supabase/migrations_manual/alywillow_formula_copy_update.sql'

PREFIX = {
    'Minty Relief': 'MR', 'Warrior': 'WA', 'Sagerow': 'SR', 'Sweet Magic': 'SM',
    'Riverflow': 'RF', 'Wildwood': 'WW', 'Seawillow': 'SE', 'Firefly': 'FF',
    'Lavender Fields': 'LF', 'Dragonfly': 'DF', 'Butterfly': 'BF',
    'Gardenia': 'GA', 'Chocomojo': 'CM', 'Pumpkinight': 'PN', 'Unscented': 'UN',
}

def derive_sku(formula, title):
    p = PREFIX[formula]
    # strip the formula name off the front of the title (case-insensitive)
    rest = re.sub(re.escape(formula), '', title, flags=re.I).strip()
    r = rest.lower()
    # order matters: most specific first
    if r == 'formula bundle':            return f'ALY-FRM-{p}F'
    if r == 'udc set':                   return f'ALY-{p}U-{p}V'
    if r in ('udc refill bag',):         return f'ALY-{p}V-001'
    if r.startswith('udc'):              return f'ALY-{p}U-001'   # "UDC"
    if r in ('spritzer set',):           return f'ALY-{p}P-{p}Q'
    if r in ('spritzer rb',):            return f'ALY-{p}Q-001'
    if r.startswith('spritzer'):         return f'ALY-{p}P-001'
    if r == 'bar set of 12':             return f'ALY-{p}B-DZN'
    if r == 'bar sample bag':            return f'ALY-{p}M-BAG'
    if r == 'mini bar sample':           return f'ALY-{p}M-SAM'
    if r == 'bar':                       return f'ALY-{p}B-001'
    m = re.match(r'^(?:level\s*)?([345])\b(.*)$', r)
    if m:
        lvl, tail = m.group(1), m.group(2).strip()
        tail = re.sub(r'^moisturizer', '', tail).strip()
        if tail == 'set':                return f'ALY-{p}{lvl}-{p}{"C" if lvl=="3" else "D"}'
        if tail in ('rb', 'refill bag'): return f'ALY-{p}{"C" if lvl=="3" else "D"}-001'
        if tail == '':                   return f'ALY-{p}{lvl}-001'
    return None

# known SKU irregularities in the item list
SKU_FIXUPS = {'ALY-FFM-BAG': 'ALY-FFH-BAG'}

with open(ITEMLIST) as f:
    items = {r['sku']: r for r in csv.DictReader(f)}

with open(FORMULAS) as f:
    lines = f.read().splitlines()
# first line is "Table 1" junk; real header is line 2
rows = list(csv.DictReader(lines[1:]))

def esc(s):
    return s.strip().replace("'", "''")

updates, unmatched, unchanged = [], [], 0
seen_skus = set()
for row in rows:
    formula, title = row['Formula'].strip(), row['Title'].strip()
    sku = derive_sku(formula, title)
    if sku:
        sku = SKU_FIXUPS.get(sku, sku)
    item = items.get(sku) if sku else None
    if not item:
        unmatched.append((formula, title, sku))
        continue
    if sku in seen_skus:
        print(f'DUPLICATE SKU MATCH: {sku} ({title})', file=sys.stderr)
    seen_skus.add(sku)
    name, sub = esc(title), esc(row['Subtitle (Desc 1)'])
    d2, d3 = esc(row['Description 2']), esc(row['Description 3'])
    cur = (item['name'].strip(), item['variant_summary'].strip(),
           item['other_details_1'].strip(), item['other_details_2'].strip())
    if cur == (title.strip(), row['Subtitle (Desc 1)'].strip(),
               row['Description 2'].strip(), row['Description 3'].strip()):
        unchanged += 1
    updates.append(f"""-- {sku}: {item['name'].strip()}
UPDATE items SET
  name = '{name}',
  variant_summary = '{sub}',
  other_details_1 = '{d2}',
  other_details_2 = '{d3}',
  updated_at = now()
WHERE id = '{item['id']}' AND sku = '{sku}';""")

header = f"""-- Alywillow formula copy update — generated {__import__('datetime').date.today()}
-- Source: {FORMULAS.split('/')[-1]} matched to {ITEMLIST.split('/')[-1]} by SKU.
-- Updates name, variant_summary, other_details_1, other_details_2 for {len(updates)} items.
-- Run inside a transaction; verify the count below matches before committing.

BEGIN;

"""
footer = f"""

-- Expect {len(updates)} rows updated in total.
-- Review, then run: COMMIT; (or ROLLBACK; to abort)
COMMIT;
"""
import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    f.write(header + '\n\n'.join(updates) + footer)

print(f'{len(rows)} formula rows, {len(updates)} matched ({unchanged} already identical), {len(unmatched)} unmatched')
for f_, t, s in unmatched:
    print(f'  UNMATCHED: [{f_}] {t}  (derived sku: {s})')
print(f'wrote {OUT}')
```
