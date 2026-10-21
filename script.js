
const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#nav');

menuButton?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(Boolean(open)));
});

nav?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  });
});

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

document.querySelector('#code-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#booking-code');
  const message = document.querySelector('#code-message');
  const value = input?.value.trim();

  if (!value) {
    if (message) message.textContent = 'Entre un code avant de continuer.';
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    if (message) message.textContent = 'Code copié.';
  } catch {
    input?.select();
    if (message) message.textContent = 'Sélectionne le code puis copie-le manuellement.';
  }
});

const labels = {
  SCHEDULED: 'À venir',
  TIMED: 'À venir',
  IN_PLAY: 'En cours',
  PAUSED: 'Mi-temps / pause',
  FINISHED: 'Terminé',
  POSTPONED: 'Reporté',
  SUSPENDED: 'Suspendu',
  CANCELLED: 'Annulé',
  AWARDED: 'Décision officielle',
  LIVE: 'En cours'
};

function formatDate(value) {
  if (!value) return 'Horaire indisponible';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horaire indisponible';

  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Douala',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function makeTeam(team, scoreValue) {
  const row = document.createElement('div');
  row.className = 'team-row';

  const logo = document.createElement('img');
  logo.className = 'team-logo';
  logo.alt = '';
  logo.loading = 'lazy';
  logo.src = team?.crest || '';

  logo.addEventListener('error', () => {
    logo.hidden = true;
  }, { once: true });

  const name = document.createElement('span');
  name.className = 'team-name';
  name.textContent = team?.shortName || team?.name || 'Équipe inconnue';

  const score = document.createElement('strong');
  score.className = 'team-score';
  score.textContent =
    scoreValue === null || scoreValue === undefined
      ? '–'
      : String(scoreValue);

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
    emblem.addEventListener('error', () => {
      emblem.hidden = true;
    }, { once: true });
    league.append(emblem);
  }

  const leagueName = document.createElement('span');
  leagueName.textContent = match.competition?.name || 'Football';
  league.append(leagueName);

  const date = document.createElement('p');
  date.className = 'match-date';
  date.textContent = formatDate(match.utcDate) + ' • Heure du Cameroun';

  const homeScore = match.score?.fullTime?.home;
  const awayScore = match.score?.fullTime?.away;

  const teams = document.createElement('div');
  teams.className = 'match-teams';
  teams.append(
    makeTeam(match.homeTeam, homeScore),
    makeTeam(match.awayTeam, awayScore)
  );

  const bottom = document.createElement('div');
  bottom.className = 'match-bottom';

  const status = document.createElement('span');
  status.className = 'pill';
  status.textContent = labels[match.status] || match.status || 'Statut inconnu';

  const round = document.createElement('span');
  round.className = 'matchday';
  round.textContent = match.matchday
    ? 'Journée ' + match.matchday
    : '';

  bottom.append(status, round);
  card.append(league, date, teams, bottom);

  return card;
}

async function loadMatches() {
  const container = document.querySelector('#matches-container');
  if (!container) return;

  container.textContent = 'Chargement des matchs…';

  try {
    const response = await fetch('./matches.json?t=' + Date.now(), {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('Erreur HTTP ' + response.status);
    }

    const data = await response.json();
    const matches = Array.isArray(data.matches) ? data.matches : [];

    if (!matches.length) {
      container.textContent = 'Aucun match disponible pour le moment.';
      return;
    }

    matches.sort((a, b) =>
      new Date(a.utcDate || 0) - new Date(b.utcDate || 0)
    );

    const fragment = document.createDocumentFragment();

    matches.forEach(match => {
      fragment.appendChild(renderMatch(match));
    });

    container.replaceChildren(fragment);
  } catch (error) {
    container.textContent =
      'Impossible de charger les matchs. Vérifie ta connexion et réessaie.';
  }
}

document.querySelector('#refresh-matches')
  ?.addEventListener('click', loadMatches);

loadMatches();
