#!/usr/bin/env python3
"""Synchronise les calendriers multisports vers un JSON statique pour GitHub Pages."""
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

SPORTS = {
    2: "Basket-ball", 3: "Hockey sur glace", 4: "Volleyball", 5: "Rugby",
    6: "Handball", 8: "Baseball", 9: "Football américain", 11: "Cricket",
    13: "Hockey sur gazon", 14: "Water-polo", 27: "Futsal", 1: "Football",
}
COUNTRIES = ["CM", "GB"]
TODAY = dt.datetime.now(dt.timezone.utc).date()
params_base = {"from": (TODAY-dt.timedelta(days=7)).isoformat(),
               "to": (TODAY+dt.timedelta(days=30)).isoformat(),
               "limit": "5"}
path = "sports-events.json"
try:
    with open(path, encoding="utf-8") as f:
        previous = json.load(f)
except (OSError, ValueError):
    previous = {"events": []}

events_by_key = {}
for event in previous.get("events", []):
    key = (str(event.get("requestedCountry")), str(event.get("sportId")), str(event.get("id")))
    events_by_key[key] = event

successes = 0
for country in COUNTRIES:
    for sport_id, sport_name in SPORTS.items():
        params = dict(params_base, country=country, sport_id=str(sport_id))
        url = "https://sportsevents24.com/api/v1/events?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers={"User-Agent": "Matchs-Scrore/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload.get("data"), list):
                raise ValueError("Réponse API sans liste data")
            # Remplacer les anciennes données de cette paire uniquement après succès.
            prefix = (country, str(sport_id))
            events_by_key = {k: v for k, v in events_by_key.items() if k[:2] != prefix}
            for event in payload["data"]:
                event["requestedCountry"] = country
                event["sportName"] = SPORTS[sport_id]
                key = (country, str(sport_id), str(event.get("id")))
                events_by_key[key] = event
            successes += 1
            print(f"{country} / {sport_name}: {len(payload['data'])} rencontre(s)")
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            print(f"ERREUR {country} / {sport_name}: {exc}")
        time.sleep(6.5)  # rester sous la limite de 10 requêtes par minute

if successes == 0 and not previous.get("events"):
    raise SystemExit("Aucune donnée multisport reçue; aucun fichier neuf ne sera publié.")

result = {
    "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    "countries": COUNTRIES,
    "sports": [{"id": sid, "name": name} for sid, name in SPORTS.items()],
    "events": list(events_by_key.values()),
    "count": len(events_by_key),
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
print(f"Total multisport conservé: {result['count']} événements; appels réussis: {successes}/24")
