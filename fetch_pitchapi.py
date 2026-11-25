#!/usr/bin/env python3
"""Fetch real per-player match statistics from PitchAPI and map them to site match IDs."""
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from difflib import SequenceMatcher

BASE = "https://api.pitchapi.dev/v1"
KEY = os.environ.get("PITCHAPI_API_KEY", "").strip()
UA = "MatchsScore/1.0"

def request(path):
    req = urllib.request.Request(
        BASE + path,
        headers={"X-API-KEY": KEY, "Accept": "application/json", "User-Agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    if "error" in payload:
        raise RuntimeError(payload["error"].get("code", "PitchAPI error"))
    return payload.get("data")

def norm(value):
    value = (value or "").lower()
    value = re.sub(r"\b(fc|cf|afc|sc|ac|club|football|united|city)\b", " ", value)
    return re.sub(r"[^a-z0-9]", "", value)

def similarity(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0
    if a == b or a in b or b in a:
        return 1
    return SequenceMatcher(None, a, b).ratio()

def format_stat(item):
    if not isinstance(item, dict):
        return None
    kind = item.get("type")
    value = item.get("value")
    total = item.get("total")
    if value is None:
        return None
    if kind in ("fractionWithPercentage", "distanceWithPercentage"):
        pct = item.get("percentage")
        result = f"{value}/{total}" if total is not None else str(value)
        return result + (f" ({pct}%)" if pct is not None else "")
    return str(value)

def player_groups(raw_players):
    teams = {}
    for entry in raw_players or []:
        if not isinstance(entry, dict):
            continue
        player = entry.get("player") or {}
        name = player.get("name") or player.get("short_name")
        if not name:
            continue
        team_id = entry.get("team_id") or "unknown"
        team = teams.setdefault(team_id, {"team": "", "players": []})
        grouped = {}
        for group in entry.get("stats", []) or []:
            if not isinstance(group, dict):
                continue
            values = group.get("stats", {})
            if not isinstance(values, dict):
                continue
            for label, detail in values.items():
                if not isinstance(detail, dict):
                    continue
                key = detail.get("key") or label
                value = format_stat(detail.get("stat", {}))
                if value is not None:
                    grouped[str(key)] = value
        team["players"].append({
            "name": name,
            "position": str(player.get("position") or ""),
            "image": player.get("image_url"),
            "stats": grouped,
        })
    return list(teams.values())

def main():
    if not KEY:
        print("PITCHAPI_API_KEY absent : génération d'un fichier vide, sans interrompre le site.")
        with open("pitch_players.json", "w", encoding="utf-8") as f:
            json.dump({"source": "PitchAPI", "matches": {}, "notice": "Clé API non configurée."}, f)
        return

    with open("matches.json", encoding="utf-8") as f:
        site_matches = json.load(f).get("matches", [])

    # Only recently finished fixtures are queried; upcoming fixtures have no player stats.
    finished = []
    for match in site_matches:
        if match.get("status") != "FINISHED":
            continue
        raw_date = (match.get("utcDate") or "")[:10]
        if raw_date:
            finished.append((raw_date, match))

    dates = sorted({item[0] for item in finished})
    output = {}
    errors = []
    for day in dates:
        try:
            day_data = request(f"/date/{day}")
            api_matches = (day_data or {}).get("matches", [])
        except Exception as exc:
            errors.append(f"{day}: {type(exc).__name__}: {exc}")
            continue

        for site_day, site_match in [item for item in finished if item[0] == day]:
            home_name = (site_match.get("homeTeam") or {}).get("name", "")
            away_name = (site_match.get("awayTeam") or {}).get("name", "")
            best = None
            best_score = 0
            for candidate in api_matches:
                home = (candidate.get("home_team") or {}).get("name", "")
                away = (candidate.get("away_team") or {}).get("name", "")
                score = (similarity(home_name, home) + similarity(away_name, away)) / 2
                reverse = (similarity(home_name, away) + similarity(away_name, home)) / 2
                if reverse > score:
                    score = 0
                if score > best_score:
                    best, best_score = candidate, score
            if not best or best_score < 0.82:
                continue
            match_id = str(site_match.get("id"))
            try:
                raw = request(f"/matches/{best['id']}/players")
                groups = player_groups(raw or [])
                if groups and any(group["players"] for group in groups):
                    team_names = {
                        (best.get("home_team") or {}).get("id"): (best.get("home_team") or {}).get("name", ""),
                        (best.get("away_team") or {}).get("id"): (best.get("away_team") or {}).get("name", ""),
                    }
                    for group in groups:
                        # Resolve the team label from player IDs only when API data exposes it.
                        group["team"] = group.get("team") or "Équipe"
                    output[match_id] = {
                        "playerStats": groups,
                        "pitchApiMatchId": best["id"],
                        "source": "PitchAPI",
                    }
            except Exception as exc:
                errors.append(f"{match_id}: {type(exc).__name__}: {exc}")
            time.sleep(0.15)

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "PitchAPI",
        "matches": output,
        "count": len(output),
        "errors": errors[:20],
        "notice": "Statistiques individuelles uniquement si elles sont réellement fournies par PitchAPI.",
    }
    with open("pitch_players.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print(f"PitchAPI : statistiques individuelles disponibles pour {len(output)} match(s).")
    if errors:
        print("Erreurs API (sans données sensibles) :", "; ".join(errors[:5]))

if __name__ == "__main__":
    main()
