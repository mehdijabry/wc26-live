import json, sys
data = json.load(open('/tmp/tournament.json'))
events = data.get('events') or []
events.sort(key=lambda e: e.get('date','9999'))

# Same group classification as regen-matches.py
GROUP_CUTOFF = "2026-06-28T10:00"
GROUPS = {
    "A":["MEX","RSA","KOR","CZE"],"B":["CAN","BIH","QAT","SUI"],"C":["BRA","MAR","HAI","SCO"],
    "D":["USA","PAR","AUS","TUR"],"E":["GER","CUW","CIV","ECU"],"F":["NED","JPN","SWE","TUN"],
    "G":["BEL","EGY","IRN","NZL"],"H":["ESP","CPV","KSA","URU"],"I":["FRA","SEN","IRQ","NOR"],
    "J":["ARG","ALG","AUT","JOR"],"K":["POR","COD","UZB","COL"],"L":["ENG","CRO","GHA","PAN"],
}
def group_for(a):
    for g, ts in GROUPS.items():
        if a in ts: return g
    return None

# Same order as matches.ts produced — sort by date asc
pairs = []
for ev in events:
    date = ev.get('date','')
    if not date or date >= GROUP_CUTOFF: continue
    comp = (ev.get('competitions') or [{}])[0]
    home = next((c for c in comp.get('competitors',[]) if c.get('homeAway')=='home'), {})
    away = next((c for c in comp.get('competitors',[]) if c.get('homeAway')=='away'), {})
    h = home.get('team',{}).get('abbreviation','')
    a = away.get('team',{}).get('abbreviation','')
    if not (group_for(h) and group_for(a) and group_for(h) == group_for(a)): continue
    pairs.append((ev.get('id'), h, a, date))

print(f"// {len(pairs)} group-stage events mapped to M01..M{len(pairs):02d}", file=sys.stderr)
print('const ESPN_EVENT_TO_INTERNAL: Record<string, string> = {')
for i, (eid, h, a, date) in enumerate(pairs, start=1):
    print(f"  '{eid}': 'M{i:02d}',  // {h} vs {a}  {date}")
print('}')
