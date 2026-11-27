const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#nav');

menuButton?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(Boolean(open)));
});
nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
}));

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

const labels = {
  SCHEDULED: 'À venir', TIMED: 'À venir', IN_PLAY: 'En cours',
  PAUSED: 'Pause', FINISHED: 'Terminé', POSTPONED: 'Reporté',
  SUSPENDED: 'Match suspendu', CANCELLED: 'Annulé', AWARDED: 'Décision officielle',
  LIVE: 'En cours'
};
let currentFilter = 'all';
let allMatches = [];
let matchStats = {};
let predictionsByMatch = {};
let scorerData = {};
let matchesLoading = false;
let favoriteIds = [];
try { favoriteIds = JSON.parse(localStorage.getItem('matchs-score-favorites') || '[]'); } catch (_) { favoriteIds = []; }
let favoritesOnly = false;

function saveFavorites() {
  try { localStorage.setItem('matchs-score-favorites', JSON.stringify(favoriteIds)); } catch (_) {}
}
function updateCompetitionOptions() {
  const select = document.querySelector('#match-competition');
  if (!select) return;
  const previous = select.value || 'all';
  const competitions = [...new Map(allMatches.map(m => [m.competition?.name, m.competition?.name]).filter(([name]) => name)).keys()].sort((a,b) => a.localeCompare(b, 'fr'));
  select.replaceChildren();
  const all = document.createElement('option'); all.value = 'all'; all.textContent = 'Tous les championnats'; select.append(all);
  competitions.forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); });
  select.value = competitions.includes(previous) ? previous : 'all';
}


function renderMatchStats(match) {
  const data = matchStats[String(match.id)];
  if (!data || !data.available) return null;
  const section = document.createElement('section');
  section.className = 'match-stats';
  const title = document.createElement('strong');
  title.className = 'match-stats-title';
  title.textContent = 'Statistiques du match';
  section.append(title);

  const homeName = match.homeTeam?.name || 'Domicile';
  const awayName = match.awayTeam?.name || 'Extérieur';
  const groups = [
    { title: 'Possession et jeu', items: [
      ['Possession', 'possessionPct', '%', true],
      ['Passes réussies', 'accuratePasses', ''],
      ['Passes tentées', 'totalPasses', ''],
      ['Précision des passes', 'passPct', '%', true]
    ]},
    { title: 'Attaque', items: [
      ['Tirs', 'totalShots', ''],
      ['Tirs cadrés', 'shotsOnTarget', ''],
      ['Tirs bloqués', 'blockedShots', ''],
      ['Précision des tirs', 'shotPct', '%', true],
      ['Corners', 'wonCorners', '']
    ]},
    { title: 'Discipline et défense', items: [
      ['Fautes', 'foulsCommitted', ''],
      ['Hors-jeu', 'offsides', ''],
      ['Cartons jaunes', 'yellowCards', ''],
      ['Cartons rouges', 'redCards', ''],
      ['Arrêts du gardien', 'saves', ''],
      ['Tacles réussis', 'effectiveTackles', ''],
      ['Interceptions', 'interceptions', ''],
      ['Dégagements', 'effectiveClearance', '']
    ]}
  ];

  groups.forEach(group => {
    const groupBox = document.createElement('div');
    groupBox.className = 'match-stats-group';
    const heading = document.createElement('h4');
    heading.textContent = group.title;
    groupBox.append(heading);
    group.items.forEach(([label, key, suffix, percent]) => {
      const home = data.home?.[key];
      const away = data.away?.[key];
      if (home == null && away == null) return;
      const toNumber = value => {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return percent && n <= 1 ? n * 100 : n;
      };
      const h = toNumber(home), a = toNumber(away);
      const row = document.createElement('div');
      row.className = 'match-stat-compare';
      const values = document.createElement('div');
      values.className = 'match-stat-values';
      const left = document.createElement('strong');
      left.textContent = home == null ? '—' : (percent ? Math.round(h) + '%' : String(home) + suffix);
      const name = document.createElement('span');
      name.textContent = label;
      const right = document.createElement('strong');
      right.textContent = away == null ? '—' : (percent ? Math.round(a) + '%' : String(away) + suffix);
      values.append(left, name, right);
      row.append(values);
      if (h !== null && a !== null) {
        const track = document.createElement('div');
        track.className = 'match-stat-track';
        const total = Math.max(0, h) + Math.max(0, a);
        const homeBar = document.createElement('span');
        homeBar.className = 'match-stat-home-bar';
        homeBar.style.width = (total ? Math.max(0,h) / total * 100 : 50) + '%';
        const awayBar = document.createElement('span');
        awayBar.className = 'match-stat-away-bar';
        awayBar.style.width = (total ? Math.max(0,a) / total * 100 : 50) + '%';
        track.append(homeBar, awayBar);
        row.append(track);
      }
      groupBox.append(row);
    });
    if (groupBox.querySelector('.match-stat-compare')) section.append(groupBox);
  });

  const teams = document.createElement('div');
  teams.className = 'match-stats-team-names';
  teams.textContent = homeName + '  —  ' + awayName;
  section.insertBefore(teams, section.children[1] || null);
  if (data.url) {
    const source = document.createElement('a');
    source.href = data.url;
    source.target = '_blank';
    source.rel = 'noopener';
    source.textContent = 'Source des statistiques';
    section.append(source);
  }
  return section;
}

 
function appendText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value == null ? "—" : String(value);
  parent.append(node);
  return node;
}

function renderTeamForm(teamName, teamId, info, competitionCode) {
  const box = document.createElement("div");
  box.className = "team-analysis-side";
  appendText(box, "h4", "team-analysis-name", teamName);
  const summary = info || {};
  appendText(box, "p", "team-analysis-record",
    (summary.played || 0) + " matchs • " + (summary.wins || 0) + " V • " +
    (summary.draws || 0) + " N • " + (summary.losses || 0) + " D");
  appendText(box, "p", "team-analysis-goals",
    "Buts : " + (summary.goalsFor ?? "—") + " marqués / " +
    (summary.goalsAgainst ?? "—") + " encaissés");
  appendText(box, "p", "team-analysis-averages",
    "Moyenne : " + (summary.averageFor ?? "—") + " marqué(s), " +
    (summary.averageAgainst ?? "—") + " encaissé(s) par match");
  const form = document.createElement("div");
  form.className = "team-form-strip";
  (summary.form || []).slice(0, 10).forEach(item => {
    const chip = document.createElement("span");
    chip.className = "form-chip form-" + item.result;
    chip.title = item.opponent + " : " + item.goalsFor + "-" + item.goalsAgainst;
    chip.textContent = item.result;
    form.append(chip);
  });
  if (!(summary.form || []).length) appendText(form, "small", "", "Historique récent non disponible.");
  box.append(form);
  const list = document.createElement("div");
  list.className = "team-recent-list";
  (summary.form || []).slice(0, 10).forEach(item => {
    const line = document.createElement("p");
    line.textContent = new Intl.DateTimeFormat("fr-FR", {timeZone:"Africa/Douala",day:"2-digit",month:"short"}).format(new Date(item.date)) +
      " • " + item.opponent + " • " + item.goalsFor + "-" + item.goalsAgainst;
    const result = document.createElement("strong");
    result.className = "form-result form-" + item.result;
    result.textContent = item.result === "W" ? "V" : item.result === "D" ? "N" : "D";
    line.append(result);
    list.append(line);
  });
  box.append(list);

  const players = [];
  const comp = scorerData.competitions?.[competitionCode];
  (comp?.scorers || []).forEach(item => {
    const id = item.team?.id;
    const name = (item.team?.name || item.team?.shortName || "").toLocaleLowerCase("fr");
    if ((teamId && id === teamId) || (!teamId && name && name === teamName.toLocaleLowerCase("fr"))) players.push(item);
  });
  const playerBox = document.createElement("div");
  playerBox.className = "team-player-stats";
  appendText(playerBox, "strong", "", "Joueurs — meilleurs buteurs");
  if (players.length) {
    players.slice(0, 5).forEach(item => {
      const row = document.createElement("p");
      row.textContent = (item.player?.name || "Joueur") + " • " + (item.goals ?? "—") +
        " but(s) • " + (item.assists ?? "—") + " passe(s) décisive(s)";
      playerBox.append(row);
    });
  } else {
    appendText(playerBox, "small", "", "Statistiques individuelles non disponibles pour cette équipe.");
  }
  box.append(playerBox);
  return box;
}

function renderPlayerStats(eventData) {
  const teams = eventData?.playerStats;
  if (!Array.isArray(teams) || !teams.length) return null;
  const section = document.createElement("section");
  section.className = "match-player-stats";
  appendText(section, "h3", "", "Statistiques des joueurs");
  appendText(section, "p", "team-analysis-note", "Données individuelles publiées par le fournisseur ; les catégories varient selon les rencontres.");
  teams.forEach(team => {
    const group = document.createElement("div");
    group.className = "match-player-team";
    appendText(group, "h4", "", team.team || "Équipe");
    (team.players || []).forEach(player => {
      const row = document.createElement("div");
      row.className = "match-player-row";
      const identityBox = document.createElement("div");
      identityBox.className = "match-player-identity";
      if (player.image) {
        const portrait = document.createElement("img");
        portrait.className = "match-player-photo";
        portrait.src = player.image;
        portrait.alt = "Photo de " + (player.name || "joueur");
        portrait.loading = "lazy";
        portrait.referrerPolicy = "no-referrer";
        portrait.addEventListener("error", () => { portrait.hidden = true; }, { once: true });
        identityBox.append(portrait);
      }
      const identity = document.createElement("strong");
      identity.textContent = (player.name || "Joueur") +
        (player.position ? " · " + player.position : "") +
        (player.starter ? " · Titulaire" : "");
      identityBox.append(identity);
      row.append(identityBox);
      const stats = player.stats || {};
      const summary = Object.entries(stats).map(([key, value]) => key + " : " + value).join(" · ");
      if (summary) appendText(row, "small", "", summary);
      group.append(row);
    });
    section.append(group);
  });
  return section;
}

function renderTeamAnalysis(match) {
  const prediction = predictionsByMatch[String(match.id)];
  if (!prediction) return null;
  const analysis = prediction.teamAnalysis;
  if (!analysis) return null;
  const section = document.createElement("section");
  section.className = "team-analysis";
  appendText(section, "h3", "team-analysis-title", "Analyse complète des équipes");
  appendText(section, "p", "team-analysis-note", "Estimations calculées à partir des résultats historiques disponibles — elles ne garantissent pas le résultat.");
  const probabilities = document.createElement("div");
  probabilities.className = "team-win-probabilities";
  [["1 • " + prediction.homeTeam, prediction.probabilities?.home],
   ["N • Match nul", prediction.probabilities?.draw],
   ["2 • " + prediction.awayTeam, prediction.probabilities?.away]].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "team-probability";
    appendText(item, "span", "", label);
    appendText(item, "strong", "", value == null ? "—" : Number(value).toFixed(1) + "%");
    const track = document.createElement("div");
    track.className = "team-probability-track";
    const fill = document.createElement("span");
    fill.style.width = Math.max(0, Math.min(100, Number(value || 0))) + "%";
    track.append(fill); item.append(track); probabilities.append(item);
  });
  section.append(probabilities);
  const sides = document.createElement("div");
  sides.className = "team-analysis-grid";
  sides.append(
    renderTeamForm(prediction.homeTeam || "Domicile", prediction.homeTeamId, analysis.home, match.competition?.code),
    renderTeamForm(prediction.awayTeam || "Extérieur", prediction.awayTeamId, analysis.away, match.competition?.code)
  );
  section.append(sides);
  const h2h = document.createElement("div");
  h2h.className = "team-h2h";
  appendText(h2h, "h4", "", "Confrontations directes récentes");
  if (analysis.headToHead?.length) {
    analysis.headToHead.forEach(item => appendText(h2h, "p", "",
      item.homeTeam + " " + item.homeGoals + " - " + item.awayGoals + " " + item.awayTeam +
      " • " + new Intl.DateTimeFormat("fr-FR", {timeZone:"Africa/Douala",day:"2-digit",month:"short",year:"numeric"}).format(new Date(item.date))));
  } else appendText(h2h, "p", "", "Aucune confrontation récente disponible dans les compétitions couvertes.");
  section.append(h2h);
  return section;
}

function formatDate(value) {
  if (!value) return 'Horaire indisponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horaire indisponible';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Douala', weekday: 'short', day: '2-digit',
    month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date) + ' • heure du Cameroun';
}

function matchGroup(status) {
  if (['IN_PLAY', 'PAUSED', 'LIVE', 'SUSPENDED'].includes(status)) return 'live';
  if (status === 'FINISHED' || status === 'AWARDED') return 'finished';
  return 'upcoming';
}

function makeTeam(team, scoreValue) {
  const row = document.createElement('div');
  row.className = 'team-row';
  const logo = document.createElement('img');
  logo.className = 'team-logo';
  logo.alt = '';
  logo.loading = 'lazy';
  if (team?.crest) logo.src = team.crest;
  logo.addEventListener('error', () => { logo.hidden = true; }, { once: true });
  const name = document.createElement('span');
  name.className = 'team-name';
  name.textContent = team?.shortName || team?.name || 'Équipe inconnue';
  const score = document.createElement('strong');
  score.className = 'team-score';
  score.textContent = scoreValue === null || scoreValue === undefined ? '–' : String(scoreValue);
  row.append(logo, name, score);
  return row;
}

function renderMatch(match) {
  const card = document.createElement('article');
  card.className = 'match-card';
  card.dataset.matchId = String(match.id);
  const league = document.createElement('div');
  league.className = 'league';
  if (match.competition?.emblem) {
    const emblem = document.createElement('img');
    emblem.className = 'competition-logo';
    emblem.alt = '';
    emblem.loading = 'lazy';
    emblem.src = match.competition.emblem;
    emblem.addEventListener('error', () => { emblem.hidden = true; }, { once: true });
    league.append(emblem);
  }
  const leagueName = document.createElement('span');
  leagueName.textContent = match.competition?.name || 'Football';
  league.append(leagueName);

  const date = document.createElement('p');
  date.className = 'match-date';
  date.textContent = formatDate(match.utcDate);

  const homeScore = match.score?.fullTime?.home ?? match.score?.regularTime?.home ?? match.score?.halfTime?.home;
  const awayScore = match.score?.fullTime?.away ?? match.score?.regularTime?.away ?? match.score?.halfTime?.away;
  const teams = document.createElement('div');
  teams.className = 'match-teams';
  teams.append(makeTeam(match.homeTeam, homeScore), makeTeam(match.awayTeam, awayScore));
  const halfTime = match.score?.halfTime;
  if (halfTime && (halfTime.home !== null && halfTime.home !== undefined || halfTime.away !== null && halfTime.away !== undefined)) {
    const half = document.createElement('p');
    half.className = 'match-half-time';
    half.textContent = 'Mi-temps : ' + (halfTime.home ?? '—') + ' - ' + (halfTime.away ?? '—');
    teams.append(half);
  }

  const bottom = document.createElement('div');
  bottom.className = 'match-bottom';
  const status = document.createElement('span');
  status.className = 'pill ' + matchGroup(match.status);
  status.textContent = labels[match.status] || match.status || 'Statut inconnu';
  const round = document.createElement('span');
  round.className = 'matchday';
  round.textContent = match.matchday ? 'Journée ' + match.matchday : '';
  bottom.append(status, round);
  const favorite = document.createElement('button');
  favorite.type = 'button';
  favorite.className = 'favorite-match' + (favoriteIds.includes(String(match.id)) ? ' is-favorite' : '');
  favorite.setAttribute('aria-label', favoriteIds.includes(String(match.id)) ? 'Retirer des favoris' : 'Ajouter aux favoris');
  favorite.setAttribute('aria-pressed', String(favoriteIds.includes(String(match.id))));
  favorite.textContent = favoriteIds.includes(String(match.id)) ? '★ Favori' : '☆ Favori';
  favorite.addEventListener('click', () => {
    const id = String(match.id);
    favoriteIds = favoriteIds.includes(id) ? favoriteIds.filter(value => value !== id) : [...favoriteIds, id];
    saveFavorites();
    renderMatches();
  });
  card.append(league, date, teams, bottom, favorite);
  const openDetails = document.createElement('button');
  openDetails.type = 'button';
  openDetails.className = 'match-open-details';
  openDetails.textContent = 'Voir le match et les statistiques';
  openDetails.setAttribute('aria-expanded', 'false');
  const detailPanel = document.createElement('div');
  detailPanel.className = 'match-expanded-panel';
  detailPanel.hidden = true;
  openDetails.addEventListener('click', () => {
    const isOpen = !detailPanel.hidden;
    if (!isOpen && detailPanel.dataset.loaded !== 'true') {
      populateMatchDetails(match, detailPanel);
      detailPanel.dataset.loaded = 'true';
    }
    detailPanel.hidden = isOpen;
    openDetails.setAttribute('aria-expanded', String(!isOpen));
    openDetails.textContent = isOpen ? 'Voir le match et les statistiques' : 'Masquer les détails';
  });
  card.append(openDetails, detailPanel);
  return card;
}

function populateMatchDetails(match, detailPanel) {
  const detailItems = [
    ['Stade', match.venue],
    ['Phase', match.stage],
    ['Journée', match.matchday ? String(match.matchday) : null],
    ['Arbitre(s)', Array.isArray(match.referees) && match.referees.length ? match.referees.map(ref => ref.name).filter(Boolean).join(', ') : null]
  ].filter(([, value]) => value);
  if (detailItems.length) {
    const details = document.createElement('details');
    details.className = 'match-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Détails de la rencontre';
    const panel = document.createElement('div');
    panel.className = 'match-stat-panel';
    detailItems.forEach(([label, value]) => {
      const line = document.createElement('p');
      line.textContent = label + ' : ' + value;
      panel.append(line);
    });
    details.append(summary, panel);
    detailPanel.append(details);
  }

  const teamAnalysis = renderTeamAnalysis(match);
  if (teamAnalysis) detailPanel.append(teamAnalysis);

  const playerStats = renderPlayerStats(matchStats[String(match.id)]);
  if (playerStats) detailPanel.append(playerStats);

  const stats = renderMatchStats(match);
  if (stats) detailPanel.append(stats);
  if (!stats) {
    const unavailable = document.createElement('p');
    unavailable.className = 'stats-unavailable';
    unavailable.textContent = 'Les statistiques détaillées ne sont pas encore fournies pour cette rencontre.';
    detailPanel.append(unavailable);
  }

  // Confirmed ESPN goal events and match-action photos, when supplied.
  const eventData = matchStats[String(match.id)];
  if (Array.isArray(eventData?.scorers) && eventData.scorers.length) {
    const scorerSection = document.createElement('section');
    scorerSection.className = 'match-scorers';
    const heading = document.createElement('h3');
    heading.textContent = 'Buteurs du match';
    scorerSection.append(heading);
    eventData.scorers.forEach(scorer => {
      const line = document.createElement('p');
      const minute = scorer.minute ? ' (' + scorer.minute + ')' : '';
      const team = scorer.team ? ' • ' + scorer.team : '';
      line.textContent = '⚽ ' + (scorer.player || 'Buteur') + minute +
        (scorer.ownGoal ? ' • CSC' : '') + (scorer.penalty ? ' • Penalty' : '') + team;
      scorerSection.append(line);
    });
    detailPanel.append(scorerSection);
  }

  if (eventData?.photo?.url) {
    const photoSection = document.createElement('section');
    photoSection.className = 'match-action-photo';
    const photo = document.createElement('img');
    photo.src = eventData.photo.url;
    photo.alt = eventData.photo.caption || ('Photo du match ' +
      (match.homeTeam?.name || '') + ' - ' + (match.awayTeam?.name || ''));
    photo.loading = 'lazy';
    photo.referrerPolicy = 'no-referrer';
    photo.addEventListener('error', () => { photoSection.remove(); }, { once: true });
    photoSection.append(photo);
    if (eventData.photo.caption) {
      const caption = document.createElement('small');
      caption.textContent = eventData.photo.caption;
      photoSection.append(caption);
    }
    detailPanel.append(photoSection);
  }

}

const doualaDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit'
});
const matchLocalDateCache = new WeakMap();
function getMatchLocalDate(match) {
  if (!match?.utcDate) return '';
  const cached = matchLocalDateCache.get(match);
  if (cached) return cached;
  const parts = doualaDatePartsFormatter.formatToParts(new Date(match.utcDate));
  const key = parts.filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => part.value).join('-');
  matchLocalDateCache.set(match, key);
  return key;
}

function renderMatches() {
  const container = document.querySelector('#matches-container');
  if (!container) return;
  const query = (document.querySelector('#match-search')?.value || '').trim().toLocaleLowerCase('fr');
  const competition = document.querySelector('#match-competition')?.value || 'all';
  const date = document.querySelector('#match-date')?.value || '';
  const filtered = allMatches.filter(match => {
    const groupOk = currentFilter === 'all' || matchGroup(match.status) === currentFilter;
    const names = [match.homeTeam?.name, match.homeTeam?.shortName, match.awayTeam?.name, match.awayTeam?.shortName, match.competition?.name].join(' ').toLocaleLowerCase('fr');
    const queryOk = !query || names.includes(query);
    const competitionOk = competition === 'all' || match.competition?.name === competition;
    const dateOk = !date || getMatchLocalDate(match) === date;
    const favoriteOk = !favoritesOnly || favoriteIds.includes(String(match.id));
    return groupOk && queryOk && competitionOk && dateOk && favoriteOk;
  });
  container.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = currentFilter === 'all' ? 'Aucun match disponible pour le moment.' : 'Aucun match dans cette catégorie pour le moment.';
    container.append(empty);
    return;
  }
  const groups = new Map();
  filtered.forEach(match => {
    const name = match.competition?.name || 'Autres rencontres';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(match);
  });
  const fragment = document.createDocumentFragment();
  [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).forEach(([name, matches]) => {
    const group = document.createElement('section');
    group.className = 'competition-group';
    const heading = document.createElement('div');
    heading.className = 'competition-group-heading';
    const title = document.createElement('h3');
    title.textContent = name;
    const count = document.createElement('span');
    count.textContent = matches.length + (matches.length > 1 ? ' matchs' : ' match');
    heading.append(title, count);
    const grid = document.createElement('div');
    grid.className = 'match-grid competition-match-grid';
    matches.forEach(match => grid.append(renderMatch(match)));
    group.append(heading, grid);
    fragment.append(group);
  });
  container.append(fragment);
}

async function loadMatches() {
  if (matchesLoading) return;
  matchesLoading = true;
  const container = document.querySelector('#matches-container');
  const status = document.querySelector('#matches-status');
  const refresh = document.querySelector('#refresh-matches');
  if (!container) return;
  if (status) status.textContent = 'Actualisation des rencontres…';
  if (refresh) { refresh.disabled = true; refresh.textContent = 'Chargement…'; }
  try {
    const response = await fetch('./matches.json', { cache: 'default' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    allMatches = Array.isArray(data.matches) ? data.matches : [];
    allMatches.sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));
    updateCompetitionOptions();
    renderMatches();
    calendarMatches = allMatches;
    buildCalendarDateIndex(calendarMatches);
    renderCalendarDay();
    renderCalendarMonth();
    renderResultHighlights();
    const count = allMatches.length;
    const fetchedAt = data.fetchedAt ? new Date(data.fetchedAt) : null;
    const updated = data.matches?.reduce((latest, item) => {
      const value = item.lastUpdated ? new Date(item.lastUpdated) : null;
      return value && (!latest || value > latest) ? value : latest;
    }, null);
    const dataDate = fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt : updated;
    const stamp = dataDate ? ' • actualisé : ' + new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(dataDate) : '';
    if (status) status.textContent = count + ' rencontre(s) chargée(s)' + stamp + '.';
  } catch (error) {
    if (status) status.textContent = allMatches.length ? 'Connexion indisponible : affichage des dernières données chargées.' : 'Impossible de charger les matchs. Vérifie ta connexion puis réessaie.';
    if (!allMatches.length) container.textContent = 'Les rencontres ne sont pas accessibles pour le moment.';
  } finally {
    matchesLoading = false;
    if (refresh) { refresh.disabled = false; refresh.textContent = '↻ Actualiser'; }
  }
}

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    renderMatches();
  });
});
document.querySelector('#refresh-matches')?.addEventListener('click', loadMatches);
['#match-search', '#match-competition', '#match-date'].forEach(selector => {
  document.querySelector(selector)?.addEventListener(selector === '#match-search' ? 'input' : 'change', renderMatches);
});
document.querySelector('#favorites-filter')?.addEventListener('click', event => {
  favoritesOnly = !favoritesOnly;
  event.currentTarget.classList.toggle('active', favoritesOnly);
  event.currentTarget.setAttribute('aria-pressed', String(favoritesOnly));
  event.currentTarget.textContent = favoritesOnly ? '★ Afficher tous' : '☆ Mes favoris';
  renderMatches();
});

async function loadMatchStats() {
  try {
    const response = await fetch('./match_stats.json', { cache: 'default' });
    if (!response.ok) throw new Error('Statistiques indisponibles');
    const data = await response.json();
    matchStats = data.matches && typeof data.matches === 'object' ? data.matches : {};
    try {
      const pitchResponse = await fetch('./pitch_players.json', { cache: 'default' });
      if (pitchResponse.ok) {
        const pitchData = await pitchResponse.json();
        Object.entries(pitchData.matches || {}).forEach(([matchId, extra]) => {
          if (!matchStats[matchId]) matchStats[matchId] = {};
          if (Array.isArray(extra.playerStats) && extra.playerStats.length) {
            matchStats[matchId].playerStats = extra.playerStats;
            matchStats[matchId].playerStatsSource = extra.source || 'PitchAPI';
          }
        });
      }
    } catch (pitchError) {
      console.warn('Statistiques individuelles PitchAPI indisponibles :', pitchError);
    }
    // Met à jour les fiches déjà ouvertes sans reconstruire toute la liste.
    document.querySelectorAll('.match-card').forEach(card => {
      const panel = card.querySelector('.match-expanded-panel');
      if (!panel || panel.hidden) return;
      const match = allMatches.find(item => String(item.id) === card.dataset.matchId);
      if (!match) return;
      panel.replaceChildren();
      populateMatchDetails(match, panel);
      panel.dataset.loaded = 'true';
    });
    renderResultHighlights();
    const status = document.querySelector('#matches-status');
    const count = Object.keys(matchStats).length;
    if (status && count) status.textContent += ' • statistiques détaillées disponibles pour ' + count + ' match(s).';
  } catch (error) {
    matchStats = {};
    console.warn('Statistiques des matchs indisponibles :', error);
  }
}
loadMatches();
loadMatchStats();
// Recheck the published score feed automatically; the data pipeline refreshes it every 15 minutes.
setInterval(loadMatches, 5 * 60 * 1000);

// Charge les rubriques secondaires uniquement à l'approche de l'écran.
const lazySectionLoads = new Set();
let sectionLoadObserver = null;
function loadSectionWhenNeeded(sectionId, loader) {
  const section = document.getElementById(sectionId);
  if (!section || lazySectionLoads.has(sectionId)) return;
  const start = () => {
    if (lazySectionLoads.has(sectionId)) return;
    lazySectionLoads.add(sectionId);
    loader();
    sectionLoadObserver?.unobserve(section);
  };
  if (!('IntersectionObserver' in window)) { start(); return; }
  if (!sectionLoadObserver) {
    sectionLoadObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const callback = entry.target.__loadSection;
          if (callback) callback();
        }
      });
    }, { rootMargin: '280px 0px' });
  }
  section.__loadSection = start;
  sectionLoadObserver.observe(section);
}

// Statistical estimates generated by the GitHub Actions workflow.
function renderPrediction(item) {
  const card = document.createElement('article');
  card.className = 'tip-card prediction-card';
  const league = document.createElement('p');
  league.className = 'prediction-league';
  league.textContent = item.competition || 'Football';
  const teams = document.createElement('div');
  teams.className = 'prediction-team-list';
  [[item.homeTeam || 'Équipe domicile', item.homeCrest], [item.awayTeam || 'Équipe extérieure', item.awayCrest]].forEach(([teamName, crest]) => {
    const row = document.createElement('div');
    row.className = 'prediction-team';
    const logo = document.createElement('img');
    logo.className = 'team-logo';
    logo.alt = '';
    logo.loading = 'lazy';
    if (crest) logo.src = crest;
    logo.addEventListener('error', () => { logo.hidden = true; }, { once: true });
    const name = document.createElement('strong');
    name.textContent = teamName;
    row.append(logo, name);
    teams.append(row);
  });
  const date = document.createElement('p');
  date.className = 'prediction-date';
  date.textContent = formatDate(item.utcDate);
  const bars = document.createElement('div');
  bars.className = 'probability-list';
  const values = [
    ['1', item.probabilities?.home ?? 0],
    ['N', item.probabilities?.draw ?? 0],
    ['2', item.probabilities?.away ?? 0]
  ];
  values.forEach(([label, value]) => {
    const line = document.createElement('div');
    line.className = 'probability-line';
    const name = document.createElement('span');
    name.textContent = label;
    const track = document.createElement('div');
    track.className = 'probability-track';
    const fill = document.createElement('span');
    fill.style.width = Math.max(0, Math.min(100, Number(value))) + '%';
    track.append(fill);
    const percent = document.createElement('strong');
    percent.textContent = Number(value).toFixed(1) + '%';
    line.append(name, track, percent);
    bars.append(line);
  });
  const trend = document.createElement('p');
  trend.className = 'prediction-trend';
  const trendLabel = item.trend?.label === '1' ? 'Victoire de ' + (item.homeTeam || 'l’équipe à domicile')
    : item.trend?.label === '2' ? 'Victoire de ' + (item.awayTeam || 'l’équipe à l’extérieur')
    : item.trend?.label === 'N' ? 'Match nul' : 'Indéterminée';
  trend.textContent = 'Tendance du modèle : ' + trendLabel +
    ' (' + Number(item.trend?.probability || 0).toFixed(1) + '%)';
  const sample = document.createElement('p');
  sample.className = 'prediction-sample';
  sample.textContent = 'Échantillon : ' + (item.sampleMatches || 0) + ' matchs récents analysés';
  card.append(league, teams, date, bars, trend, sample);
  return card;
}

async function loadPredictions() {
  const container = document.querySelector('#picks-container');
  const status = document.querySelector('#picks-status');
  if (!container) return;
  try {
    const response = await fetch('./predictions.json', { cache: 'default' });
    if (!response.ok) throw new Error('Fichier de pronostics indisponible');
    const data = await response.json();
    const picks = Array.isArray(data.predictions) ? data.predictions : [];
    predictionsByMatch = Object.fromEntries(picks.map(item => [String(item.matchId), item]));
    renderMatches();
    container.replaceChildren();
    if (!picks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Aucune analyse disponible pour les prochaines rencontres. Les équipes doivent avoir suffisamment de résultats récents.';
      container.append(empty);
    } else {
      picks.forEach(item => container.append(renderPrediction(item)));
    }
    if (status) {
      const stamp = data.generatedAt ? new Date(data.generatedAt) : null;
      status.textContent = picks.length + ' analyse(s) disponible(s)' +
        (stamp && !Number.isNaN(stamp.getTime()) ? ' • calculées le ' + new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', dateStyle: 'short', timeStyle: 'short' }).format(stamp) : '') + '.';
    }
  } catch (error) {
    container.textContent = 'Les analyses statistiques ne sont pas encore disponibles. Réessaie après la prochaine mise à jour.';
    if (status) status.textContent = 'Moteur d’analyse en attente de ses premières données.';
  }
}
// Charge aussi les données de pronostic pour alimenter l'analyse des matchs du jour et de demain.
loadPredictions();


const leagueSelect = document.querySelector('#league-select');
async function loadStandings() {
  const body = document.querySelector('#standings-body');
  const status = document.querySelector('#standings-status');
  if (!body) return;
  const code = leagueSelect?.value || 'PL';
  if (status) status.textContent = 'Chargement du classement…';
  try {
    const response = await fetch('./standings.json?t=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw new Error('Classement indisponible');
    const data = await response.json();
    const table = data.competitions?.[code];
    body.replaceChildren();
    if (!table?.table?.length) throw new Error(table?.error || 'Aucun classement disponible pour cette compétition.');
    table.table.forEach(team => {
      const tr = document.createElement('tr');
      const values = [team.position, team.team?.name || 'Club', team.playedGames, team.won, team.draw, team.lost, team.goalsFor, team.goalsAgainst, team.points];
      values.forEach((value, index) => {
        const td = document.createElement('td');
        if (index === 1) {
          td.className = 'standing-club';
          const img = document.createElement('img');
          img.alt = ''; img.loading = 'lazy'; img.src = team.team?.crest || '';
          img.addEventListener('error', () => { img.hidden = true; }, {once:true});
          const name = document.createElement('span'); name.textContent = value;
          td.append(img, name);
        } else td.textContent = value ?? '—';
        tr.append(td);
      });
      body.append(tr);
    });
    if (status) status.textContent = (table.competition || code) + ' • classement actualisé automatiquement.';
  } catch (error) {
    body.innerHTML = '<tr><td colspan="9">Classement momentanément indisponible pour cette compétition.</td></tr>';
    if (status) status.textContent = 'Les classements seront affichés dès que la source les fournira.';
  }
}
leagueSelect?.addEventListener('change', loadStandings);
loadSectionWhenNeeded('classements', loadStandings);


// Current top scorers by competition.
const scorerLeagueSelect = document.querySelector('#scorer-league-select');
async function loadScorers() {
  const body = document.querySelector('#scorers-body');
  const status = document.querySelector('#scorers-status');
  if (!body) return;
  const code = scorerLeagueSelect?.value || 'PL';
  if (status) status.textContent = 'Chargement des meilleurs buteurs…';
  try {
    const response = await fetch('./scorers.json', { cache: 'default' });
    if (!response.ok) throw new Error('Classement des buteurs indisponible');
    const data = await response.json();
    scorerData = data;
    renderMatches();
    const competition = data.competitions?.[code];
    const scorers = Array.isArray(competition?.scorers) ? competition.scorers : [];
    body.replaceChildren();
    if (!scorers.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = competition?.error ? 'Données non disponibles pour ce championnat avec la source actuelle.' : 'Aucun buteur disponible pour le moment.';
      tr.append(td); body.append(tr);
    } else {
      scorers.forEach((item, index) => {
        const tr = document.createElement('tr');
        const values = [index + 1, item.player?.name || 'Joueur', item.team?.shortName || item.team?.name || 'Club', item.playedMatches ?? '—', item.goals ?? 0, item.penalties ?? 0];
        values.forEach((value, column) => {
          const td = document.createElement('td');
          if (column === 1) {
            td.className = 'standing-club';
            td.textContent = value;
          } else td.textContent = String(value);
          tr.append(td);
        });
        body.append(tr);
      });
    }
    if (status) status.textContent = (competition?.competition || code) + ' • ' + scorers.length + ' buteur(s) affiché(s)' + (data.generatedAt ? ' • actualisé automatiquement.' : '.');
  } catch (error) {
    body.innerHTML = '<tr><td colspan="6">Classement des buteurs momentanément indisponible.</td></tr>';
    if (status) status.textContent = 'Les données des buteurs seront affichées dès que la source les fournira.';
  }
}
scorerLeagueSelect?.addEventListener('change', loadScorers);
loadSectionWhenNeeded('buteurs', loadScorers);


// Automatically refreshed football headlines from RSS and ESPN.
async function loadNews() {
  const container = document.querySelector('#news-container');
  const status = document.querySelector('#news-status');
  if (!container) return;
  try {
    const response = await fetch('./news.json?t=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw new Error('Actualités indisponibles');
    const data = await response.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];
    container.replaceChildren();
    if (!articles.length) {
      const empty = document.createElement('p'); empty.className = 'empty-state';
      empty.textContent = 'Aucune actualité récente reçue. La rubrique sera actualisée à la prochaine collecte.';
      container.append(empty);
    } else {
      articles.slice(0, 24).forEach(item => {
        const card = document.createElement('article'); card.className = 'tip-card news-card';
        const source = document.createElement('p'); source.className = 'prediction-league'; source.textContent = item.source || 'Actualité football';
        const title = document.createElement('h3'); title.textContent = item.title || 'Actualité';
        const summary = document.createElement('p'); summary.textContent = item.summary || '';
        const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Lire l’article original ↗';
        card.append(source, title, summary, link); container.append(card);
      });
    }
    if (status) status.textContent = articles.length + ' actualité(s) chargée(s)' + (data.generatedAt ? ' • mise à jour ' + new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',dateStyle:'short',timeStyle:'short'}).format(new Date(data.generatedAt)) : '') + '.';
  } catch (error) {
    container.textContent = 'Les actualités sont momentanément indisponibles. Réessaie après la prochaine collecte.';
    if (status) status.textContent = 'Source d’actualités en attente.';
  }
}
loadSectionWhenNeeded('actualites', loadNews);


/* Calendrier façon LiveScore : aujourd'hui, demain et sélection d'une date */
let calendarMatches = [];
let calendarDateIndex = new Map();
let calendarSelectedDate = localDateKey(new Date());
let calendarMonthValue = localMonthValue();
let calendarView = 'today';
let calendarDateOffset = 0;
let resultSlideIndex = 0;
let resultTimer = null;

function localDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Douala',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return parts.filter(p=>['year','month','day'].includes(p.type)).map(p=>p.value).join('-');
}
function localMonthValue() { return localDateKey(new Date()).slice(0,7); }
function dateOffsetKey(offset) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Douala',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const y=Number(parts.find(p=>p.type==='year').value),m=Number(parts.find(p=>p.type==='month').value),d=Number(parts.find(p=>p.type==='day').value);
  const date=new Date(Date.UTC(y,m-1,d+offset,12));
  return date.toISOString().slice(0,10);
}
function buildCalendarDateIndex(matches) {
  calendarDateIndex = new Map();
  matches.forEach(match => {
    const key = getMatchLocalDate(match);
    if (!key) return;
    if (!calendarDateIndex.has(key)) calendarDateIndex.set(key, []);
    calendarDateIndex.get(key).push(match);
  });
  calendarDateIndex.forEach(items => items.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)));
}
function matchesOnDate(dateKey) {
  return calendarDateIndex.get(dateKey) || [];
}
function appendCalendarGroups(container, matches) {
  if (!container) return;
  container.replaceChildren();
  if (!matches.length) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Aucun match reçu pour cette date. Les rencontres affichées dépendent des données disponibles auprès de la source.';
    container.append(p);
    return;
  }
  const groups = new Map();
  matches.forEach(match => {
    const name = match.competition?.name || 'Autres rencontres';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(match);
  });
  [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).forEach(([name, items]) => {
    const section = document.createElement('section');
    section.className = 'competition-group calendar-card-group';
    const heading = document.createElement('div');
    heading.className = 'competition-group-heading';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'calendar-competition-title';
    const emblemUrl = items.find(match => match.competition?.emblem)?.competition?.emblem;
    if (emblemUrl) {
      const emblem = document.createElement('img');
      emblem.className = 'calendar-competition-logo';
      emblem.alt = '';
      emblem.loading = 'lazy';
      emblem.decoding = 'async';
      emblem.src = emblemUrl;
      emblem.addEventListener('error', () => { emblem.hidden = true; }, { once: true });
      titleWrap.append(emblem);
    }
    const title = document.createElement('h3');
    title.textContent = name;
    titleWrap.append(title);
    const count = document.createElement('span');
    count.textContent = items.length + (items.length > 1 ? ' matchs' : ' match');
    heading.append(titleWrap, count);
    const grid = document.createElement('div');
    grid.className = 'match-grid competition-match-grid';
    items.forEach(match => {
      const card=renderMatch(match);
      const time=card.querySelector('.match-date');
      if(time && match.utcDate) time.textContent=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(match.utcDate));
      grid.append(card);
    });
    section.append(heading, grid);
    container.append(section);
  });
}

// Sports multisports : les données sont chargées à la demande pour respecter le quota gratuit.
const sportsConfig = {
  football:{id:1,label:'Football',icon:'⚽'}, basketball:{id:2,label:'Basket-ball',icon:'🏀'},
  'ice-hockey':{id:3,label:'Hockey sur glace',icon:'🏒'}, volleyball:{id:4,label:'Volleyball',icon:'🏐'},
  rugby:{id:5,label:'Rugby',icon:'🏉'}, handball:{id:6,label:'Handball',icon:'🤾'},
  'field-hockey':{id:13,label:'Hockey sur gazon',icon:'🏑'}, 'american-football':{id:9,label:'Football américain',icon:'🏈'},
  cricket:{id:11,label:'Cricket',icon:'🏏'}, baseball:{id:8,label:'Baseball',icon:'⚾'},
  futsal:{id:27,label:'Futsal',icon:'🥅'}, 'water-polo':{id:14,label:'Water-polo',icon:'🤽'}
};
let activeSport='football';
let sportEvents=[];
let sportRequestToken=0;
const sportNameMap={1:'Football',2:'Basket-ball',3:'Hockey sur glace',4:'Volleyball',5:'Rugby',6:'Handball',8:'Baseball',9:'Football américain',11:'Cricket',13:'Hockey sur gazon',14:'Water-polo',27:'Futsal'};
function renderSportEvents(){
  const host=document.querySelector('#calendar-container');if(!host)return;
  host.replaceChildren();
  const date=dateOffsetKey(calendarDateOffset);
  const day=sportEvents.filter(e=>(e.startsAt||'').slice(0,10)===date);
  const status=document.querySelector('#calendar-status');
  if(status)status.textContent=(sportsConfig[activeSport]?.label||'Sport')+' • '+date+' • '+day.length+' rencontre(s)';
  if(!day.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Aucune rencontre publiée pour ce sport, ce pays et cette date. Essaie un autre pays ou une autre date.';host.append(p);return;}
  const groups=new Map();day.forEach(e=>{const name=e.tournament||'Autres compétitions';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(e);});
  [...groups].sort((a,b)=>a[0].localeCompare(b[0],'fr')).forEach(([name,items])=>{
    const section=document.createElement('section');section.className='competition-group calendar-card-group';
    const heading=document.createElement('div');heading.className='competition-group-heading';
    const title=document.createElement('div');title.className='calendar-competition-title';
    const h=document.createElement('h3');h.textContent=name;title.append(h);
    const count=document.createElement('span');count.textContent=items.length+' match(s)';heading.append(title,count);
    const list=document.createElement('div');list.className='sport-event-list';
    items.forEach(e=>{
      const row=document.createElement('article');row.className='sport-event-row';
      const time=document.createElement('time');time.textContent=e.startsAt?new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',hour:'2-digit',minute:'2-digit'}).format(new Date(e.startsAt)):'Horaire à confirmer';
      const teams=document.createElement('strong');teams.textContent=(e.teamHome||'À déterminer')+'  —  '+(e.teamAway||'À déterminer');
      const score=document.createElement('span');score.textContent=e.result||'À venir';
      row.append(time,teams,score);list.append(row);
    });
    section.append(heading,list);host.append(section);
  });
}
async function loadSportEvents(){
  if(activeSport==='football'){renderCalendarDay();return;}
  const token=++sportRequestToken;
  const cfg=sportsConfig[activeSport],country=document.querySelector('#sport-country')?.value||'GB';
  const status=document.querySelector('#calendar-status'),note=document.querySelector('#sport-source-note');
  if(status)status.textContent='Chargement des rencontres '+cfg.label+'…';
  if(note)note.textContent='Recherche des compétitions et matchs publiés pour le pays choisi.';
  try{
    const from=dateOffsetKey(-7),to=dateOffsetKey(30);
    const url='https://sportsevents24.com/api/v1/events?country='+encodeURIComponent(country)+'&sport_id='+cfg.id+'&from='+from+'&to='+to+'&limit=100';
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(response.status===429?'Quota gratuit temporairement atteint':'Source indisponible ('+response.status+')');
    const data=await response.json();if(token!==sportRequestToken)return;
    sportEvents=Array.isArray(data.data)?data.data:[];
    renderSportEvents();
    if(note)note.textContent=(data.usage?.requestsRemaining??'—')+' requête(s) restante(s) aujourd’hui • '+(data.usage?.rowsRemaining??'—')+' ligne(s) ce mois-ci.';
  }catch(error){if(token!==sportRequestToken)return;if(status)status.textContent=error.message+' . Réessaie plus tard ou change de pays.';if(note)note.textContent='Source gratuite externe • couverture variable selon les compétitions.';}
}
document.querySelectorAll('.sport-chip[data-sport]').forEach(button=>button.addEventListener('click',()=>{
  activeSport=button.dataset.sport;
  document.querySelectorAll('.sport-chip').forEach(item=>item.classList.toggle('active',item===button));
  const isFootball=activeSport==='football';
  document.querySelector('#matchs')?.classList.toggle('sport-football-hidden',!isFootball);
  document.querySelector('#calendar-day-content')?.classList.remove('hidden');
  if(isFootball){loadMatches();renderCalendarDay();}
  else loadSportEvents();
}));
document.querySelector('#sport-country')?.addEventListener('change',()=>{if(activeSport!=='football')loadSportEvents();});

function renderCalendarDay() {
  if(activeSport!=='football'){renderSportEvents();return;}
  const date=dateOffsetKey(calendarDateOffset);
  const label=document.querySelector('#livescore-date-label');
  if(label) label.textContent=calendarDateOffset===0?'Aujourd’hui':calendarDateOffset===1?'Demain':calendarDateOffset===-1?'Hier':new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',weekday:'short',day:'numeric',month:'short'}).format(new Date(date+'T12:00:00Z'));
  calendarSelectedDate=date;
  const title=calendarDateOffset===0?'Aujourd’hui':calendarDateOffset===1?'Demain':new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00Z'));
  const status=document.querySelector('#calendar-status');
  if(status)status.textContent=title+' • '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00Z'))+' • '+matchesOnDate(date).length+' match(s)';
  appendCalendarGroups(document.querySelector('#calendar-container'),matchesOnDate(date));
}
function renderCalendarMonth() {
  const input=document.querySelector('#calendar-month');
  const grid=document.querySelector('#calendar-days');
  if(!input||!grid)return;
  if(!input.value)input.value=calendarMonthValue;
  calendarMonthValue=input.value;
  const [year,month]=calendarMonthValue.split('-').map(Number);
  const monthName=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(year,month-1,1));
  document.querySelector('#calendar-month-label').textContent=monthName;
  grid.replaceChildren();
  const firstDay=(new Date(year,month-1,1).getDay()+6)%7;
  const days=new Date(year,month,0).getDate();
  for(let i=0;i<firstDay;i++){const blank=document.createElement('span');blank.className='calendar-day blank';grid.append(blank);}
  for(let day=1;day<=days;day++){
    const key=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    const count=matchesOnDate(key).length;
    const button=document.createElement('button');button.type='button';button.className='calendar-day'+(key===calendarSelectedDate?' selected':'')+(count?' has-matches':'');
    button.textContent=String(day);button.setAttribute('aria-label',day+' '+monthName+', '+count+' match(s)');
    if(count){const dot=document.createElement('i');dot.textContent=String(count);button.append(dot);}
    button.addEventListener('click',()=>{calendarSelectedDate=key;renderCalendarMonth();renderSelectedCalendarDate();});
    grid.append(button);
  }
  renderSelectedCalendarDate();
}
function renderSelectedCalendarDate() {
  const date=calendarSelectedDate;
  const label=document.querySelector('#calendar-selected-label');
  if(label)label.textContent=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
  const matches=matchesOnDate(date);
  const status=document.querySelector('#calendar-month-status');
  if(status)status.textContent=matches.length+' rencontre(s) disponible(s) à cette date.';
  appendCalendarGroups(document.querySelector('#calendar-selected-matches'),matches);
}
function setCalendarView(view) {
  calendarView=view;
  if(view==='today')calendarDateOffset=0;else if(view==='tomorrow')calendarDateOffset=1;
  document.querySelectorAll('[data-calendar-view]').forEach(button=>{
    const active=button.dataset.calendarView===view;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));
  });
  const monthView=document.querySelector('#calendar-month-view');
  const dayContent=document.querySelector('#calendar-day-content');
  if(monthView)monthView.hidden=view!=='month';
  if(dayContent)dayContent.hidden=view==='month';
  if(view==='month')renderCalendarMonth();else renderCalendarDay();
}
document.querySelectorAll('[data-calendar-view]').forEach(button=>button.addEventListener('click',()=>setCalendarView(button.dataset.calendarView)));
document.querySelector('#calendar-month')?.addEventListener('change',event=>{calendarMonthValue=event.target.value;calendarSelectedDate=calendarMonthValue+'-01';renderCalendarMonth();});
document.querySelector('#calendar-prev-month')?.addEventListener('click',()=>changeCalendarMonth(-1));
document.querySelector('#calendar-next-month')?.addEventListener('click',()=>changeCalendarMonth(1));
document.querySelector('#date-prev')?.addEventListener('click',()=>{calendarDateOffset--;calendarView=calendarDateOffset===1?'tomorrow':'today';activeSport==='football'?renderCalendarDay():loadSportEvents();});
document.querySelector('#date-next')?.addEventListener('click',()=>{calendarDateOffset++;calendarView=calendarDateOffset===1?'tomorrow':'today';activeSport==='football'?renderCalendarDay():loadSportEvents();});
document.querySelector('#open-calendar')?.addEventListener('click',()=>setCalendarView('month'));
document.querySelector('#live-filter-button')?.addEventListener('click',()=>{document.querySelector('[data-filter="live"]')?.click();document.querySelector('#matchs')?.scrollIntoView({behavior:'smooth'});});

function changeCalendarMonth(delta) {
  const [y,m]=calendarMonthValue.split('-').map(Number);const d=new Date(y,m-1+delta,1);
  calendarMonthValue=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  const input=document.querySelector('#calendar-month');if(input)input.value=calendarMonthValue;
  calendarSelectedDate=calendarMonthValue+'-01';renderCalendarMonth();
}

/* Grande affiche défilante des derniers scores terminés.
   Les écussons officiels sont utilisés si aucune photo éditoriale du match n'est fournie. */

function renderResultHighlights() {
  const container=document.querySelector('#result-carousel');if(!container)return;
  const finished=allMatches.filter(m=>['FINISHED','AWARDED'].includes(m.status)&&m.score?.fullTime?.home!=null)
    .sort((a,b)=>new Date(b.utcDate)-new Date(a.utcDate)).slice(0,20);
  container.replaceChildren();
  if(!finished.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Les affiches des matchs terminés apparaîtront ici dès que les scores finaux seront transmis.';container.append(p);return;}
  resultSlideIndex=((resultSlideIndex%finished.length)+finished.length)%finished.length;
  const m=finished[resultSlideIndex];
  const data=matchStats[String(m.id)]||{};
  const slide=document.createElement('article');slide.className='result-slide';
  const league=document.createElement('p');league.className='result-league';league.textContent=m.competition?.name||'Football';
  const title=document.createElement('p');title.className='result-kicker';title.textContent='SCORE FINAL';
  slide.append(league,title);
  if(data.photo?.url){
    const photo=document.createElement('img');photo.className='result-match-photo';photo.src=data.photo.url;
    photo.alt=data.photo.caption||('Photo du match '+(m.homeTeam?.name||'')+' - '+(m.awayTeam?.name||''));
    photo.loading='lazy';photo.referrerPolicy='no-referrer';
    photo.addEventListener('error',()=>{photo.hidden=true;},{once:true});slide.append(photo);
  }
  const teams=document.createElement('div');teams.className='result-teams';
  [[m.homeTeam,m.score.fullTime.home],[m.awayTeam,m.score.fullTime.away]].forEach(([team,score])=>{
    const item=document.createElement('div');item.className='result-team';
    const crest=document.createElement('img');crest.alt='';crest.loading='lazy';crest.src=team?.crest||'';crest.addEventListener('error',()=>{crest.hidden=true;},{once:true});
    const name=document.createElement('strong');name.textContent=team?.shortName||team?.name||'Équipe';
    const goals=document.createElement('b');goals.textContent=String(score);
    item.append(crest,name,goals);teams.append(item);
  });
  const date=document.createElement('p');date.className='result-date';date.textContent=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Douala',dateStyle:'full'}).format(new Date(m.utcDate));
  slide.append(teams,date);
  if(Array.isArray(data.scorers)&&data.scorers.length){
    const heading=document.createElement('p');heading.className='result-scorers-heading';heading.textContent='BUTEURS';
    const list=document.createElement('div');list.className='result-scorers';
    data.scorers.forEach(scorer=>{
      const line=document.createElement('span');line.className='result-scorer';
      const minute=scorer.minute?' ('+scorer.minute+')':'';
      const team=scorer.team?' · '+scorer.team:'';
      line.textContent='⚽ '+(scorer.player||'Buteur')+minute+(scorer.ownGoal?' · CSC':'')+(scorer.penalty?' · Penalty':'')+team;
      list.append(line);
    });
    slide.append(heading,list);
  }else{
    const missing=document.createElement('p');missing.className='result-scorers-empty';
    missing.textContent='Les noms des buteurs ne sont pas transmis pour cette rencontre.';
    slide.append(missing);
  }
  container.append(slide);
}
function moveResultSlide(direction) {resultSlideIndex+=direction;renderResultHighlights();}
document.querySelector('#result-prev')?.addEventListener('click',()=>moveResultSlide(-1));
document.querySelector('#result-next')?.addEventListener('click',()=>moveResultSlide(1));
if(resultTimer)clearInterval(resultTimer);
resultTimer=setInterval(()=>moveResultSlide(1),7000);
