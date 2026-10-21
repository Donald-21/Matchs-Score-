
const menuButton = document.querySelector('#menu-button');
const nav = document.querySelector('nav');

menuButton?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(!!open));
});

nav?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  });
});

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

document.querySelector('#code-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.querySelector('#booking-code');
  const msg = document.querySelector('#code-message');
  const value = input?.value.trim();

  if (!value) {
    msg.textContent = 'Entre un code avant de continuer.';
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    msg.textContent = 'Code copié.';
  } catch {
    input.select();
    msg.textContent = 'Sélectionne le code puis copie-le manuellement.';
  }
});

async function loadMatches() {
  const container = document.querySelector('#matches-container');
  if (!container) return;

  try {
    const response = await fetch('./matches.json?t=' + Date.now());
    if (!response.ok) throw new Error('Fichier indisponible');

    const data = await response.json();
    const matches = data.matches || [];

    if (matches.length === 0) {
      container.textContent = 'Aucun match disponible pour le moment. Réessaie plus tard.';
      return;
    }

    container.replaceChildren();

    matches.forEach(match => {
      const card = document.createElement('article');
      card.className = 'match-card';

      const competition = document.createElement('p');
      competition.textContent = match.competition?.name || 'Football';

      const teams = document.createElement('h3');
      teams.textContent =
        (match.homeTeam?.name || 'Équipe à domicile') +
        ' - ' +
        (match.awayTeam?.name || 'Équipe visiteuse');

      const score = document.createElement('p');
      score.textContent =
        match.score?.fullTime?.home != null &&
        match.score?.fullTime?.away != null
          ? `${match.score.fullTime.home} - ${match.score.fullTime.away}`
          : 'Score : en attente';

      const status = document.createElement('p');
      status.textContent = match.status || 'Horaire à confirmer';

      const date = document.createElement('p');
      date.textContent = match.utcDate
        ? new Date(match.utcDate).toLocaleString('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short'
          })
        : '';

      card.append(competition, teams, score, status, date);
      container.appendChild(card);
    });
  } catch (error) {
    container.textContent = 'Impossible de charger les matchs. Réessaie plus tard.';
  }
}

loadMatches();
