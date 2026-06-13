import json, sys, datetime

with open("/tmp/tournament.json") as f:
    data = json.load(f)
events = data.get("events") or []
events.sort(key=lambda e: e.get("date", "9999"))

VENUE = {
    "Estadio Banorte":"mex","Estadio Azteca":"mex","Estadio Akron":"gdl","Estadio BBVA":"mty",
    "BMO Field":"tor","BC Place":"van","Mercedes-Benz Stadium":"atl","Gillette Stadium":"bos",
    "AT&T Stadium":"dal","NRG Stadium":"hou","Arrowhead Stadium":"kan","GEHA Field at Arrowhead":"kan","GEHA Field at Arrowhead Stadium":"kan",
    "SoFi Stadium":"lax","Hard Rock Stadium":"mia","MetLife Stadium":"nyc",
    "Lincoln Financial Field":"phi","Levi's Stadium":"sfo","Lumen Field":"sea",
}
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

GROUP_CUTOFF = "2026-06-28T10:00"
group_matches = []; ko_matches = []
unknown_venues = set(); team_mismatch = []
for ev in events:
    date = ev.get("date","")
    if not date: continue
    comp = (ev.get("competitions") or [{}])[0]
    home = next((c for c in comp.get("competitors",[]) if c.get("homeAway")=="home"), {})
    away = next((c for c in comp.get("competitors",[]) if c.get("homeAway")=="away"), {})
    h_abbr = home.get("team",{}).get("abbreviation","")
    a_abbr = away.get("team",{}).get("abbreviation","")
    venue_name = (comp.get("venue") or {}).get("fullName","")
    venue_id = VENUE.get(venue_name)
    if not venue_id: unknown_venues.add(venue_name); venue_id = "?"
    if date < GROUP_CUTOFF:
        gh, ga = group_for(h_abbr), group_for(a_abbr)
        if gh and ga and gh == ga:
            group_matches.append({"date":date,"home":h_abbr,"away":a_abbr,"venue":venue_id,"group":gh})
        else:
            team_mismatch.append((date, h_abbr, gh, a_abbr, ga))
    else:
        ko_matches.append({"date":date,"home":h_abbr,"away":a_abbr,"venue":venue_id})

print(f"# Group matches: {len(group_matches)} (expected 72)", file=sys.stderr)
print(f"# KO matches: {len(ko_matches)} (expected 32)", file=sys.stderr)
print(f"# Team mismatches: {len(team_mismatch)}", file=sys.stderr)
if team_mismatch:
    for tm in team_mismatch[:5]: print(f"#   {tm}", file=sys.stderr)
if unknown_venues:
    print(f"# UNKNOWN venues: {sorted(unknown_venues)}", file=sys.stderr)

# Emit just the group-stage TS array
for i, m in enumerate(group_matches, start=1):
    mid = f"M{i:02d}"
    iso_short = m["date"][:16]
    print(f"  {{ id: '{mid}', stage: 'group', group: '{m['group']}', home: '{m['home']}', away: '{m['away']}', kickoffUTC: t('{iso_short}'), stadium: '{m['venue']}', status: 'scheduled' }},")
