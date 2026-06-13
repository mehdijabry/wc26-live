import json, sys
data = json.load(open('/tmp/tournament.json'))
events = sorted(data.get('events',[]), key=lambda e: e.get('date','9999'))

VENUE = {
    "Estadio Banorte":"mex","Estadio Azteca":"mex","Estadio Akron":"gdl","Estadio BBVA":"mty",
    "BMO Field":"tor","BC Place":"van","Mercedes-Benz Stadium":"atl","Gillette Stadium":"bos",
    "AT&T Stadium":"dal","NRG Stadium":"hou","Arrowhead Stadium":"kan",
    "GEHA Field at Arrowhead":"kan","GEHA Field at Arrowhead Stadium":"kan",
    "SoFi Stadium":"lax","Hard Rock Stadium":"mia","MetLife Stadium":"nyc",
    "Lincoln Financial Field":"phi","Levi's Stadium":"sfo","Lumen Field":"sea",
}

ko = []
for ev in events:
    d = ev.get('date','')
    if d < '2026-06-28T10:00': continue
    comp = (ev.get('competitions') or [{}])[0]
    v_name = (comp.get('venue') or {}).get('fullName','')
    v_id = VENUE.get(v_name, '?')
    ko.append({'id': ev.get('id'), 'date': d, 'venue': v_id, 'venue_name': v_name})

print(f"# {len(ko)} KO matches", file=sys.stderr)

# Stages: 16 R32, 8 R16, 4 QF, 2 SF, 1 TP, 1 FINAL
# But TP comes BEFORE FINAL by date. Need to label appropriately.
# Standard mapping:
slots = ([('r32', f'R32-{i}') for i in range(1,17)]
       + [('r16', f'R16-{i}') for i in range(1,9)]
       + [('qf',  f'QF-{i}')  for i in range(1,5)]
       + [('sf',  f'SF-{i}')  for i in range(1,3)]
       + [('tp',  'TP'), ('final', 'FINAL')])

# Map by order  — but TP (third-place) is the 31st chronologically (July 18)
# and FINAL is 32nd (July 19), so the chronological order matches the labels
# already. Let me verify with the data.
assert len(ko) == 32, f"expected 32 KO, got {len(ko)}"

# Symbolic placeholders for the bracket wizard to resolve
PLACEHOLDERS = {
    'R32-1':  ('W-A','RU-B'),    'R32-2':  ('W-C','3-FGH'),
    'R32-3':  ('W-E','3-ABDF'),  'R32-4':  ('W-B','3-EFGH'),
    'R32-5':  ('W-D','RU-F'),    'R32-6':  ('W-G','3-CDEF'),
    'R32-7':  ('W-F','3-ACDE'),  'R32-8':  ('RU-A','RU-C'),
    'R32-9':  ('W-H','3-IJKL'),  'R32-10': ('W-I','RU-K'),
    'R32-11': ('W-K','RU-L'),    'R32-12': ('W-L','RU-J'),
    'R32-13': ('W-J','RU-I'),    'R32-14': ('RU-G','RU-H'),
    'R32-15': ('RU-E','RU-D'),   'R32-16': ('3-BCDE','3-HIJK'),
    'R16-1': ('W-R32-1','W-R32-2'),  'R16-2': ('W-R32-3','W-R32-4'),
    'R16-3': ('W-R32-5','W-R32-6'),  'R16-4': ('W-R32-7','W-R32-8'),
    'R16-5': ('W-R32-9','W-R32-10'), 'R16-6': ('W-R32-11','W-R32-12'),
    'R16-7': ('W-R32-13','W-R32-14'),'R16-8': ('W-R32-15','W-R32-16'),
    'QF-1': ('W-R16-1','W-R16-2'),  'QF-2': ('W-R16-3','W-R16-4'),
    'QF-3': ('W-R16-5','W-R16-6'),  'QF-4': ('W-R16-7','W-R16-8'),
    'SF-1': ('W-QF-1','W-QF-2'),    'SF-2': ('W-QF-3','W-QF-4'),
    'TP':    ('L-SF-1','L-SF-2'),   'FINAL': ('W-SF-1','W-SF-2'),
}

# Emit matches.ts KO block AND id-map additions
print('=== matches.ts KO block ===')
out_lines = []
for i, ((stage, label), k) in enumerate(zip(slots, ko)):
    h, a = PLACEHOLDERS[label]
    iso_short = k['date'][:16]
    out_lines.append(f"  {{ id: '{label}', stage: '{stage}', home: '{h}', away: '{a}', kickoffUTC: t('{iso_short}'), stadium: '{k['venue']}', status: 'scheduled' }},")
print('\n'.join(out_lines))

print()
print('=== id-map additions ===')
for (stage, label), k in zip(slots, ko):
    print(f"  '{k['id']}': '{label}',  // {label} {k['date'][:16]}Z  @ {k['venue']}")
