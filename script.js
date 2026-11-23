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