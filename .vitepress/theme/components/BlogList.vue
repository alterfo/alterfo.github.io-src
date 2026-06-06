<script setup lang="ts">
interface Post {
  title: string
  url: string
  date: { time: number; string: string }
}
defineProps<{ posts: Post[] }>()
</script>

<template>
  <div class="blog-list">
    <h1>Блог</h1>
    <ul class="post-list">
      <li v-for="post in posts" :key="post.url" class="post-item">
        <span class="post-date">{{ post.date.string }}</span>
        <a :href="post.url" class="post-title">{{ post.title }}</a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.blog-list {
  max-width: 740px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.post-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.post-item {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.post-date {
  flex-shrink: 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  min-width: 9rem;
}

.post-title {
  font-size: 1rem;
  color: var(--vp-c-text-1);
  text-decoration: none;
}

.post-title:hover {
  color: var(--vp-c-brand-1);
}
</style>
