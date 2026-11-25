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
  const section = document.createElement('div');
  section.className = 'match-stats';
  const title = document.createElement('strong');
  title.className = 'match-stats-title';
  title.textContent = 'Statistiques du match';
  section.append(title);
  const labels = [
    ['Possession', 'possessionPct', '%'], ['Tirs', 'totalShots', ''],
    ['Tirs cadrés', 'shotsOnTarget', ''], ['Tirs bloqués', 'blockedShots', ''],
    ['Précision des tirs', 'shotPct', '%'], ['Corners', 'wonCorners', ''],
    ['Hors-jeu', 'offsides', ''], ['Fautes', 'foulsCommitted', ''],
    ['Cartons jaunes', 'yellowCards', ''], ['Cartons rouges', 'redCards', ''],
    ['Arrêts du gardien', 'saves', ''], ['Passes réussies', 'accuratePasses', ''],
    ['Passes tentées', 'totalPasses', ''], ['Précision des passes', 'passPct', '%'],
    ['Centres réussis', 'accurateCrosses', ''], ['Centres tentés', 'totalCrosses', ''],
    ['Précision des centres', 'crossPct', '%'], ['Longs ballons réussis', 'accurateLongBalls', ''],
    ['Longs ballons tentés', 'totalLongBalls', ''], ['Précision des longs ballons', 'longballPct', '%'],
    ['Tacles réussis', 'effectiveTackles', ''], ['Tacles tentés', 'totalTackles', ''],
    ['Réussite des tacles', 'tacklePct', '%'], ['Interceptions', 'interceptions', ''],
    ['Dégagements', 'effectiveClearance', ''], ['Total dégagements', 'totalClearance', ''],
    ['Buts sur penalty', 'penaltyKickGoals', ''], ['Tirs au but sur penalty', 'penaltyKickShots', '']
  ];
  const grid = document.createElement('div');
  grid.className = 'match-stats-grid';
  const sides = [
    ['Domicile', data.home || {}],
    ['Extérieur', data.away || {}]
  ];
  sides.forEach(([side, values]) => {
    const column = document.createElement('div');
    column.className = 'match-stats-side';
    const heading = document.createElement('span');
    heading.className = 'match-stats-side-title';
    heading.textContent = side;
    column.append(heading);
    labels.forEach(([label, key, suffix]) => {
      if (values[key] === undefined || values[key] === null) return;
      const line = document.createElement('p');
      line.className = 'match-stats-line';
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('strong');
      const rawValue = Number(values[key]);
      const percentKeys = ['shotPct', 'passPct', 'crossPct', 'longballPct', 'tacklePct'];
      const displayValue = percentKeys.includes(key) && Number.isFinite(rawValue)
        ? (rawValue <= 1 ? Math.round(rawValue * 100) : rawValue) + '%'
        : String(values[key]) + suffix;
      value.textContent = displayValue;
      line.append(name, value);
      column.append(line);
    });
    grid.append(column);
  });
  section.append(grid);
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
    detailPanel.hidden = isOpen;
    openDetails.setAttribute('aria-expanded', String(!isOpen));
    openDetails.textContent = isOpen ? 'Voir le match et les statistiques' : 'Masquer les détails';
  });
  card.append(openDetails);

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

  const stats = renderMatchStats(match);
  if (stats) detailPanel.append(stats);
  if (!stats) {
    const unavailable = document.createElement('p');
    unavailable.className = 'stats-unavailable';
    unavailable.textContent = 'Les statistiques détaillées ne sont pas encore fournies pour cette rencontre.';
    detailPanel.append(unavailable);
  }
  card.append(detailPanel);
  return card;
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
    const dateParts = match.utcDate ? new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Douala', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date(match.utcDate)) : [];
    const localDate = dateParts.length ? dateParts.filter(part => ['year','month','day'].includes(part.type)).map(part => part.value).join('-') : '';
    const dateOk = !date || localDate === date;
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
    const response = await fetch('./matches.json?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    allMatches = Array.isArray(data.matches) ? data.matches : [];
    allMatches.sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));
    updateCompetitionOptions();
    renderMatches();
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
    const response = await fetch('./match_stats.json?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Statistiques indisponibles');
    const data = await response.json();
    matchStats = data.matches && typeof data.matches === 'object' ? data.matches : {};
    renderMatches();
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
setInterval(loadMatches, 60 * 1000);

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
    const response = await fetch('./predictions.json?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Fichier de pronostics indisponible');
    const data = await response.json();
    const picks = Array.isArray(data.predictions) ? data.predictions : [];
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
loadStandings();


// Current top scorers by competition.
const scorerLeagueSelect = document.querySelector('#scorer-league-select');
async function loadScorers() {
  const body = document.querySelector('#scorers-body');
  const status = document.querySelector('#scorers-status');
  if (!body) return;
  const code = scorerLeagueSelect?.value || 'PL';
  if (status) status.textContent = 'Chargement des meilleurs buteurs…';
  try {
    const response = await fetch('./scorers.json?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Classement des buteurs indisponible');
    const data = await response.json();
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
loadScorers();


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
loadNews();
