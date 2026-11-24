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
  SUSPENDED: 'Suspendu', CANCELLED: 'Annulé', AWARDED: 'Décision officielle',
  LIVE: 'En cours'
};
let currentFilter = 'all';
let allMatches = [];
let matchStats = {};

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
  if (['IN_PLAY', 'PAUSED', 'LIVE'].includes(status)) return 'live';
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

  const bottom = document.createElement('div');
  bottom.className = 'match-bottom';
  const status = document.createElement('span');
  status.className = 'pill ' + matchGroup(match.status);
  status.textContent = labels[match.status] || match.status || 'Statut inconnu';
  const round = document.createElement('span');
  round.className = 'matchday';
  round.textContent = match.matchday ? 'Journée ' + match.matchday : '';
  bottom.append(status, round);
  card.append(league, date, teams, bottom);
  return card;
}

function renderMatches() {
  const container = document.querySelector('#matches-container');
  if (!container) return;
  const filtered = allMatches.filter(match => currentFilter === 'all' || matchGroup(match.status) === currentFilter);
  container.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = currentFilter === 'all' ? 'Aucun match disponible pour le moment.' : 'Aucun match dans cette catégorie pour le moment.';
    container.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  filtered.forEach(match => fragment.append(renderMatch(match)));
  container.append(fragment);
}

async function loadMatches() {
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
    renderMatches();
    const count = allMatches.length;
    const updated = data.matches?.reduce((latest, item) => {
      const value = item.lastUpdated ? new Date(item.lastUpdated) : null;
      return value && (!latest || value > latest) ? value : latest;
    }, null);
    const stamp = updated ? ' • données reçues : ' + new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(updated) : '';
    if (status) status.textContent = count + ' rencontre(s) chargée(s)' + stamp + '.';
  } catch (error) {
    if (status) status.textContent = 'Impossible de charger les matchs. Vérifie ta connexion puis réessaie.';
    container.textContent = 'Les rencontres ne sont pas accessibles pour le moment.';
  } finally {
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
loadMatches();

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
