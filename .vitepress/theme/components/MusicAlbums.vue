<script setup>
import { ref } from 'vue'
import { ALBUMS, formatDuration, albumUrl, embedUrl } from './music.js'

const expandedId = ref(null)

function togglePlayer(id) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <div class="music-albums">
    <div v-for="album in ALBUMS" :key="album.id" class="album-card">
      <div class="album-header">
        <img
          class="album-cover"
          :src="album.cover"
          :alt="album.title"
          loading="lazy"
          width="200"
          height="200"
        />
        <div class="album-info">
          <h2 class="album-title">{{ album.title }}</h2>
          <p class="album-meta">{{ album.year }}&thinsp;·&thinsp;{{ album.tracks.length }}&nbsp;треков&thinsp;·&thinsp;{{ album.genreLabel }}</p>
          <ol class="track-list">
            <li v-for="(track, i) in album.tracks" :key="i" class="track-item">
              <span class="track-num">{{ i + 1 }}</span>
              <span class="track-title">{{ track.title }}</span>
              <span class="track-duration">{{ formatDuration(track.seconds) }}</span>
            </li>
          </ol>
          <div class="album-actions">
            <button
              class="btn-listen"
              :class="{ active: expandedId === album.id }"
              @click="togglePlayer(album.id)"
            >{{ expandedId === album.id ? '✕ Закрыть плеер' : '▶ Слушать здесь' }}</button>
            <a
              class="btn-yandex"
              :href="albumUrl(album.id)"
              target="_blank"
              rel="noopener"
            >Открыть в&nbsp;Яндекс&nbsp;Музыке&nbsp;→</a>
          </div>
        </div>
      </div>
      <div v-if="expandedId === album.id" class="player-wrap">
        <iframe
          :src="embedUrl(album.id)"
          class="player-frame"
          frameborder="0"
          allow="autoplay"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<style scoped>
.music-albums {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  max-width: 860px;
  margin: 0 auto;
  padding: 0 1.5rem 3rem;
}

.album-card {
  background: var(--ds-surface-solid);
  border: 1px solid rgba(255, 230, 51, 0.15);
  border-radius: var(--ds-radius);
  overflow: hidden;
  transition: border-color 0.2s;
}

.album-card:hover {
  border-color: rgba(255, 230, 51, 0.4);
}

.album-header {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 0;
}

.album-cover {
  display: block;
  width: 200px;
  height: 200px;
  object-fit: cover;
  flex-shrink: 0;
}

.album-info {
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.album-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--ds-text-strong);
  margin: 0;
  border: none;
  padding: 0;
}

.album-meta {
  font-size: 0.8rem;
  color: var(--ds-text-muted);
  margin: 0;
  letter-spacing: 0.02em;
}

.track-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.track-item {
  display: grid;
  grid-template-columns: 1.4rem 1fr auto;
  gap: 0.4rem;
  align-items: baseline;
  font-size: 0.82rem;
  color: var(--ds-text);
  line-height: 1.55;
}

.track-num {
  color: var(--ds-text-dim);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.track-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-duration {
  color: var(--ds-text-muted);
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  white-space: nowrap;
}

.album-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: auto;
  padding-top: 0.25rem;
}

.btn-listen {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.45rem 1rem;
  border-radius: var(--ds-radius);
  border: 1px solid #ffe633;
  background: transparent;
  color: #ffe633;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.btn-listen:hover,
.btn-listen.active {
  background: rgba(255, 230, 51, 0.12);
}

.btn-yandex {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 1rem;
  border-radius: var(--ds-radius);
  border: 1px solid var(--ds-border);
  background: transparent;
  color: var(--ds-text-muted);
  font-size: 0.85rem;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;
}

.btn-yandex:hover {
  border-color: rgba(255, 230, 51, 0.4);
  color: var(--ds-text);
}

.player-wrap {
  border-top: 1px solid rgba(255, 230, 51, 0.15);
}

.player-frame {
  display: block;
  width: 100%;
  height: 470px;
  border: none;
}

@media (max-width: 600px) {
  .album-header {
    grid-template-columns: 1fr;
  }

  .album-cover {
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
  }
}

@media (max-width: 480px) {
  .music-albums {
    padding: 0 1rem 2rem;
  }

  .album-info {
    padding: 1rem;
  }

  .album-title {
    font-size: 1.1rem;
  }

  .track-item {
    font-size: 0.78rem;
  }

  .btn-listen,
  .btn-yandex {
    font-size: 0.8rem;
    padding: 0.4rem 0.75rem;
  }
}
</style>
