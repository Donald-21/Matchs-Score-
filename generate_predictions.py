#!/usr/bin/env python3
"""Build transparent, form-based football probability estimates from football-data.org."""
import json
import math
import os
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

TOKEN = os.environ["FOOTBALL_TOKEN"]
BASE = "https://api.football-data.org/v4"
COMPETITIONS = ["PL", "PD", "SA", "BSA"]
TODAY = date.today()
DATE_FROM = (TODAY - timedelta(days=90)).isoformat()
DATE_TO = TODAY.isoformat()


def api(path):
    request = urllib.request.Request(
        BASE + path,
        headers={"X-Auth-Token": TOKEN, "User-Agent": "DonaldLaDPronostic/1.0"},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                time.sleep(65)
                continue
            raise


def poisson(lam, goals):
    return math.exp(-lam) * (lam ** goals) / math.factorial(goals)


def probabilities(home_xg, away_xg):
    hp = [poisson(home_xg, n) for n in range(9)]
    ap = [poisson(away_xg, n) for n in range(9)]
    home = draw = away = 0.0
    for h, ph in enumerate(hp):
        for a, pa in enumerate(ap):
            p = ph * pa
            if h > a:
                home += p
            elif h == a:
                draw += p
            else:
                away += p
    total = home + draw + away
    return [round(100 * x / total, 1) for x in (home, draw, away)]


def main():
    histories = defaultdict(list)
    finished_by_comp = defaultdict(list)
    errors = []
    for index, code in enumerate(COMPETITIONS):
        try:
            payload = api(
                f"/competitions/{code}/matches?dateFrom={DATE_FROM}&dateTo={DATE_TO}&status=FINISHED"
            )
            matches = payload.get("matches", [])
            for match in matches:
                if match.get("status") != "FINISHED":
                    continue
                home = match.get("homeTeam", {})
                away = match.get("awayTeam", {})
                score = match.get("score", {}).get("fullTime", {})
                hg, ag = score.get("home"), score.get("away")
                if hg is None or ag is None or not home.get("id") or not away.get("id"):
                    continue
                item = {
                    "date": match.get("utcDate", ""),
                    "home_id": home["id"], "away_id": away["id"],
                    "home_goals": int(hg), "away_goals": int(ag),
                    "competition": match.get("competition", {}).get("name", code),
                }
                histories[home["id"]].append({
                    "date": item["date"], "gf": int(hg), "ga": int(ag), "venue": "home"
                })
                histories[away["id"]].append({
                    "date": item["date"], "gf": int(ag), "ga": int(hg), "venue": "away"
                })
                finished_by_comp[code].append(item)
        except Exception as exc:
            errors.append(f"{code}: {type(exc).__name__}: {exc}")
        if index < len(COMPETITIONS) - 1:
            time.sleep(7)

    if not any(finished_by_comp.values()):
        raise RuntimeError("Aucun historique de résultats n'a pu être récupéré; predictions.json conservé.")

    for team_id in histories:
        histories[team_id].sort(key=lambda x: x["date"], reverse=True)
        histories[team_id] = histories[team_id][:10]

    league_home = []
    league_away = []
    for matches in finished_by_comp.values():
        for match in matches:
            league_home.append(match["home_goals"])
            league_away.append(match["away_goals"])
    avg_home = sum(league_home) / len(league_home)
    avg_away = sum(league_away) / len(league_away)

    def factor(values, baseline):
        if not values:
            return 1.0
        raw = sum(values) / len(values) / baseline
        weight = len(values) / (len(values) + 5)
        return max(0.55, min(1.65, 1 + (raw - 1) * weight))

    # Pull the scheduled matches once; reuse the site's existing match feed.
    with open("matches.json", encoding="utf-8") as handle:
        schedule = json.load(handle).get("matches", [])

    predictions = []
    now = datetime.now(timezone.utc)
    for match in schedule:
        if match.get("status") not in ("SCHEDULED", "TIMED"):
            continue
        try:
            kickoff = datetime.fromisoformat(match["utcDate"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if kickoff <= now:
            continue
        home = match.get("homeTeam", {})
        away = match.get("awayTeam", {})
        hhist = histories.get(home.get("id"), [])[:8]
        ahist = histories.get(away.get("id"), [])[:8]
        if len(hhist) < 4 or len(ahist) < 4:
            continue

        h_home = [x for x in hhist if x["venue"] == "home"]
        a_away = [x for x in ahist if x["venue"] == "away"]
        home_attack = factor([x["gf"] for x in h_home] or [x["gf"] for x in hhist], avg_home)
        away_defence = factor([x["ga"] for x in a_away] or [x["ga"] for x in ahist], avg_home)
        away_attack = factor([x["gf"] for x in a_away] or [x["gf"] for x in ahist], avg_away)
        home_defence = factor([x["ga"] for x in h_home] or [x["ga"] for x in hhist], avg_away)
        hxg = max(0.2, min(3.5, avg_home * home_attack * away_defence))
        axg = max(0.2, min(3.5, avg_away * away_attack * home_defence))
        p_home, p_draw, p_away = probabilities(hxg, axg)
        best = max(
            [("1", p_home), ("N", p_draw), ("2", p_away)],
            key=lambda item: item[1],
        )
        sample = len(hhist) + len(ahist)
        predictions.append({
            "matchId": match.get("id"),
            "utcDate": match.get("utcDate"),
            "competition": match.get("competition", {}).get("name", "Football"),
            "homeTeam": home.get("name", "Équipe domicile"),
            "awayTeam": away.get("name", "Équipe extérieur"),
            "homeCrest": home.get("crest"),
            "awayCrest": away.get("crest"),
            "probabilities": {"home": p_home, "draw": p_draw, "away": p_away},
            "expectedGoals": {"home": round(hxg, 2), "away": round(axg, 2)},
            "trend": {"label": best[0], "probability": best[1]},
            "sampleMatches": sample,
            "method": "Poisson + forme récente (10 derniers matchs maximum)",
        })

    predictions.sort(key=lambda x: x["utcDate"])
    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "football-data.org",
        "model": "Poisson avec moyennes domicile/extérieur et forme récente",
        "historyDays": 90,
        "predictions": predictions,
        "note": "Estimations statistiques indicatives, non garanties. Les absences, compositions, blessures et cotes ne sont pas intégrées.",
        "warnings": errors,
    }
    with open("predictions.json", "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
    print(f"Pronostics calculés: {len(predictions)}")
    print(f"Historique utilisé: {sum(map(len, finished_by_comp.values()))} matchs terminés")


if __name__ == "__main__":
    main()
