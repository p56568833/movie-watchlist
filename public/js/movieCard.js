import { posterUrl, esc } from './utils.js';

export function createMovieCard(movie, index, handlers) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.style.animationDelay = `${index * 0.04}s`;
  card.dataset.id = movie.id;
  card.addEventListener('click', () => handlers.onOpen(movie));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'card-delete-btn';
  deleteButton.innerHTML = '✕';
  deleteButton.title = '删除';
  deleteButton.setAttribute('aria-label', `删除《${movie.title}》`);
  deleteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.onDelete(deleteButton, movie);
  });
  card.appendChild(deleteButton);

  // Rating badge (top-left)
  if (movie.rating > 0) {
    const rating = document.createElement('div');
    rating.className = 'card-rating';
    const score = Number(movie.rating) === Math.floor(movie.rating)
      ? movie.rating
      : Number(movie.rating).toFixed(1);
    rating.textContent = score;
    card.appendChild(rating);
  }

  const poster = document.createElement('div');
  poster.className = 'card-poster';

  const url = posterUrl(movie);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = movie.title;
    img.loading = 'lazy';
    img.onerror = () => {
      img.remove();
      poster.appendChild(createPosterPlaceholder(movie));
    };
    poster.appendChild(img);
  } else {
    poster.appendChild(createPosterPlaceholder(movie));
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'card-title-row';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = movie.title;

  const year = document.createElement('span');
  year.className = 'card-year';
  year.textContent = movie.year || '-';

  titleRow.appendChild(title);
  titleRow.appendChild(year);
  body.appendChild(titleRow);

  if (movie.director) {
    const director = document.createElement('p');
    director.className = 'card-director';
    director.textContent = movie.director;
    body.appendChild(director);
  }

  if (movie.tags?.length) {
    const tags = document.createElement('div');
    tags.className = 'card-tags';

    movie.tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'card-tag';
      chip.textContent = tag;
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        handlers.onTag(tag);
      });
      tags.appendChild(chip);
    });

    body.appendChild(tags);
  }

  if (movie.notes) {
    const notes = document.createElement('p');
    notes.className = 'card-notes';
    notes.textContent = movie.notes.length > 80 ? `${movie.notes.slice(0, 80)}...` : movie.notes;
    body.appendChild(notes);
  }

  card.appendChild(poster);
  card.appendChild(body);

  return card;
}

function createPosterPlaceholder(movie) {
  const placeholder = document.createElement('div');
  placeholder.className = 'card-poster-placeholder';
  const title = movie?.title || 'Untitled';
  const year = movie?.year || '0000';

  placeholder.innerHTML = `
    <span class="placeholder-catalog">CC / ${esc(String(year))}</span>
    <span class="placeholder-title">${esc(title)}</span>
    <span class="placeholder-mark">C</span>
  `;

  return placeholder;
}
