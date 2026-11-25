#!/usr/bin/env python3
"""Fetch football headlines and available match statistics for Matchs Scrore."""
import json
import re
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

UA = "Mozilla/5.0 (compatible; MatchsScrore/1.0)"
NEWS_FEEDS = [
    ("BBC Sport", "https://feeds.bbci.co.uk/sport/football/rss.xml"),
    ("The Guardian", "https://www.theguardian.com/football/rss"),
]
ESPN_NEWS = "https://now.core.api.espn.com/v1/sports/news?limit=30"
LEAGUES = {
    "PL": "eng.1", "ELC": "eng.2", "BL1": "ger.1", "SA": "ita.1",
    "PD": "esp.1", "FL1": "fra.1", "DED": "ned.1", "PPL": "por.1",
    "BSA": "bra.1", "CL": "uefa.champions", "WC": "fifa.world",
    "EC": "uefa.euro",
}

def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json, application/rss+xml, application/xml"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()

def clean_html(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", value).strip()

def parse_date(value):
    if not value:
        return None
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return None

def fetch_news():
    items = []
    for source, url in NEWS_FEEDS:
        try:
            root = ET.fromstring(get(url))
            for node in root.findall(".//item")[:30]:
                title = clean_html(node.findtext("title"))
                link = (node.findtext("link") or "").strip()
                description = clean_html(node.findtext("description"))
                published = parse_date(node.findtext("pubDate"))
                if title and link:
                    items.append({"title": title, "summary": description[:360], "url": link,
                                  "source": source, "publishedAt": published.isoformat() if published else None})
        except Exception as exc:
            print(f"RSS {source}: {type(exc).__name__}: {exc}")
    try:
        payload = json.loads(get(ESPN_NEWS).decode("utf-8"))
        articles = payload.get("articles", []) if isinstance(payload, dict) else []
        for article in articles:
            headline = article.get("headline") or article.get("title")
            links = article.get("links", {})
            web = links.get("web", {}) if isinstance(links, dict) else {}
            url = web.get("href") or article.get("link")
            if headline and url:
                published = parse_date(article.get("published") or article.get("lastModified"))
                items.append({"title": clean_html(headline), "summary": clean_html(article.get("description", ""))[:360],
                              "url": url, "source": "ESPN", "publishedAt": published.isoformat() if published else None})
    except Exception as exc:
        print(f"ESPN news: {type(exc).__name__}: {exc}")
    unique = {}
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    for item in items:
        dt = parse_date(item.get("publishedAt"))
        if dt and dt < cutoff:
            continue
        key = re.sub(r"[^a-z0-9]", "", item["title"].lower())
        unique.setdefault(key, item)
    result = list(unique.values())
    result.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)
    return {"generatedAt": datetime.now(timezone.utc).isoformat(), "source": "BBC Sport, The Guardian, ESPN",
            "articles": result[:50]}

def norm(value):
    value = (value or "").lower()
    value = re.sub(r"\b(fc|cf|afc|sc|ac|club|football)\b", " ", value)
    return re.sub(r"[^a-z0-9]", "", value)

def similarity(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0
    if a in b or b in a:
        return 1
    return SequenceMatcher(None, a, b).ratio()


def extract_goal_events(summary):
    """Return confirmed goal events supplied by ESPN, when available."""
    collections = []
    for key in ("keyEvents", "scoringPlays", "plays"):
        value = summary.get(key)
        if isinstance(value, list):
            collections.extend(value)
    commentary = summary.get("commentary", {})
    if isinstance(commentary, dict) and isinstance(commentary.get("items"), list):
        collections.extend(commentary["items"])
    goals, seen = [], set()
    for event in collections:
        if not isinstance(event, dict):
            continue
        kind = event.get("type", {})
        kind_text = kind.get("text", "") if isinstance(kind, dict) else str(kind or "")
        description = " ".join(str(event.get(key, "")) for key in ("text", "shortText", "description"))
        marker = (kind_text + " " + description).lower()
        if "goal" not in marker:
            continue
        participants = event.get("participants") or event.get("athletes") or event.get("players") or []
        player_name = ""
        for participant in participants:
            if not isinstance(participant, dict):
                continue
            athlete = participant.get("athlete") or participant.get("player") or participant
            if isinstance(athlete, dict):
                player_name = athlete.get("displayName") or athlete.get("fullName") or athlete.get("name") or ""
            if player_name:
                break
        if not player_name and isinstance(event.get("athlete"), dict):
            player_name = event["athlete"].get("displayName", "")
        if not player_name:
            continue
        team = event.get("team", {})
        team_name = (team.get("displayName") or team.get("name")) if isinstance(team, dict) else ""
        clock = event.get("clock", {})
        minute = clock.get("displayValue") if isinstance(clock, dict) else clock
        if not minute:
            time_data = event.get("time", {})
            minute = time_data.get("displayValue") if isinstance(time_data, dict) else time_data
        if not minute:
            minute = event.get("displayClock") or event.get("minute")
        own_goal = "own goal" in marker
        penalty = "penalty" in marker
        item = {"player": player_name, "team": team_name or "", "minute": str(minute or ""),
                "ownGoal": own_goal, "penalty": penalty}
        identity = (item["player"], item["team"], item["minute"])
        if identity not in seen:
            seen.add(identity)
            goals.append(item)
    return goals

def extract_match_photo(summary):
    """Use an event/article action photo only; never substitute a team badge or headshot."""
    candidates = []
    article = summary.get("article", {})
    if isinstance(article, dict):
        candidates.extend(article.get("images", []) if isinstance(article.get("images"), list) else [])
        image = article.get("image")
        if isinstance(image, dict):
            candidates.append(image)
    candidates.extend(summary.get("images", []) if isinstance(summary.get("images"), list) else [])
    for item in candidates:
        if not isinstance(item, dict):
            continue
        url = item.get("url") or item.get("href")
        if not isinstance(url, str) or not url.startswith("https://"):
            continue
        description = " ".join(str(item.get(key, "")) for key in ("caption", "alt", "name", "title")).strip()
        if any(term in description.lower() for term in ("headshot", "portrait", "logo", "badge", "crest")):
            continue
        return {"url": url, "caption": description[:220]}
    return None

def extract_player_stats(summary):
    """Extract only player names and statistics explicitly supplied by ESPN."""
    box = summary.get("boxscore", {})
    output = []
    for team_block in box.get("players", []) if isinstance(box, dict) else []:
        team = team_block.get("team", {}) if isinstance(team_block, dict) else {}
        team_name = team.get("displayName") or team.get("name") or ""
        categories = team_block.get("statistics", []) if isinstance(team_block, dict) else []
        players = {}
        for category in categories:
            if not isinstance(category, dict):
                continue
            category_name = category.get("name") or category.get("label") or "Statistiques"
            labels = category.get("labels") or category.get("keys") or []
            for athlete_row in category.get("athletes", []) or []:
                if not isinstance(athlete_row, dict):
                    continue
                athlete = athlete_row.get("athlete", {})
                if not isinstance(athlete, dict):
                    continue
                name = athlete.get("displayName") or athlete.get("fullName") or athlete.get("name")
                if not name:
                    continue
                values = athlete_row.get("stats") or []
                if isinstance(values, dict):
                    stats = {str(k): str(v) for k, v in values.items() if v is not None}
                else:
                    stats = {str(labels[i]): str(value) for i, value in enumerate(values)
                             if i < len(labels) and value not in (None, "", "--")}
                if not stats:
                    continue
                key = name
                record = players.setdefault(key, {"name": name,
                    "position": athlete.get("position", {}).get("abbreviation", "")
                    if isinstance(athlete.get("position"), dict) else "",
                    "starter": bool(athlete_row.get("starter")), "stats": {}})
                record["stats"].update(stats)
                record["category"] = category_name
        if players:
            output.append({"team": team_name, "players": list(players.values())[:30]})
    return output

def fetch_stats(matches):
    today = datetime.now(timezone.utc).date()
    dates = [(today - timedelta(days=n)).strftime("%Y%m%d") for n in range(3)]
    by_day = {}
    for code, league in LEAGUES.items():
        for day in dates:
            try:
                url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates={day}"
                payload = json.loads(get(url).decode("utf-8"))
                for event in payload.get("events", []):
                    comp = (event.get("competitions") or [{}])[0]
                    competitors = comp.get("competitors", [])
                    home = next((x for x in competitors if x.get("homeAway") == "home"), None)
                    away = next((x for x in competitors if x.get("homeAway") == "away"), None)
                    if not home or not away:
                        continue
                    by_day.setdefault(day, []).append({"event": event, "competition": comp,
                        "home": home, "away": away, "league": league, "code": code})
            except Exception as exc:
                print(f"ESPN scoreboard {league} {day}: {type(exc).__name__}: {exc}")
            time.sleep(0.15)

    output = {"generatedAt": datetime.now(timezone.utc).isoformat(), "source": "ESPN",
              "notice": "Statistiques publiées uniquement lorsque le fournisseur les transmet.",
              "matches": {}}
    used = set()
    candidates = [m for m in matches if m.get("status") in ("IN_PLAY", "PAUSED", "FINISHED", "LIVE", "SUSPENDED")]
    candidates.sort(key=lambda m: m.get("utcDate", ""), reverse=True)
    for match in candidates:
        # ESPN indexes some fixtures by the competition's local date, while
        # football-data.org stores UTC. Search the UTC date and its neighbours.
        match_date = datetime.fromisoformat((match.get("utcDate") or "").replace("Z", "+00:00"))
        day_keys = [(match_date.date() + timedelta(days=offset)).strftime("%Y%m%d")
                    for offset in (-1, 0, 1)]
        day_items = [item for day in day_keys for item in by_day.get(day, [])]
        best, best_score = None, 0
        home_name = match.get("homeTeam", {}).get("name", "")
        away_name = match.get("awayTeam", {}).get("name", "")
        for candidate in day_items:
            event_id = str(candidate["event"].get("id", ""))
            if event_id in used:
                continue
            score = (similarity(home_name, candidate["home"].get("team", {}).get("displayName", "")) +
                     similarity(away_name, candidate["away"].get("team", {}).get("displayName", ""))) / 2
            if score > best_score:
                best, best_score = candidate, score
        if not best or best_score < 0.76:
            continue
        event_id = str(best["event"].get("id"))
        try:
            summary_url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{best['league']}/summary?event={event_id}"
            summary = json.loads(get(summary_url).decode("utf-8"))
            box = summary.get("boxscore", {})
            teams = box.get("teams", [])
            stats = {}
            for team in teams:
                name = team.get("team", {}).get("displayName") or team.get("team", {}).get("name")
                vals = {}
                for stat in team.get("statistics", []):
                    key = stat.get("name") or stat.get("abbreviation") or stat.get("label")
                    value = stat.get("displayValue", stat.get("value"))
                    if key and value is not None:
                        vals[str(key)] = value
                if name:
                    stats[name] = vals
            scorers = extract_goal_events(summary)
            player_stats = extract_player_stats(summary)
            photo = extract_match_photo(summary)
            if stats or scorers or player_stats or photo:
                record = {
                    "eventId": event_id, "league": best["league"], "url": f"https://www.espn.com/soccer/match/_/gameId/{event_id}",
                    "home": stats.get(best["home"].get("team", {}).get("displayName"), {}),
                    "away": stats.get(best["away"].get("team", {}).get("displayName"), {}),
                    "teams": stats, "scorers": scorers, "playerStats": player_stats, "available": bool(stats)
                }
                if photo:
                    record["photo"] = photo
                output["matches"][str(match.get("id"))] = record
                used.add(event_id)
        except Exception as exc:
            print(f"ESPN summary {event_id}: {type(exc).__name__}: {exc}")
        time.sleep(0.2)
    return output

def main():
    with open("matches.json", encoding="utf-8") as handle:
        data = json.load(handle)
    news = fetch_news()
    stats = fetch_stats(data.get("matches", []))
    with open("news.json", "w", encoding="utf-8") as handle:
        json.dump(news, handle, ensure_ascii=False, indent=2)
    with open("match_stats.json", "w", encoding="utf-8") as handle:
        json.dump(stats, handle, ensure_ascii=False, indent=2)
    print(f"Actualités récupérées : {len(news['articles'])}")
    print(f"Matchs avec statistiques détaillées : {len(stats['matches'])}")

if __name__ == "__main__":
    main()
