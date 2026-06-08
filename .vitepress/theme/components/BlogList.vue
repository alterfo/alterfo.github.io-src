<script setup lang="ts">
import { computed } from 'vue'

interface Post {
  title: string
  url: string
  date: { time: number; string: string }
  excerpt: string
}

const props = defineProps<{ posts: Post[] }>()

const groupedPosts = computed(() => {
  const map = new Map<number, Post[]>()
  for (const p of props.posts) {
    const year = new Date(p.date.time).getFullYear()
    if (!map.has(year)) map.set(year, [])
    map.get(year)!.push(p)
  }
  return [...map.entries()].sort(([a], [b]) => b - a)
})
</script>

<template>
  <div class="blog-list">
    <h1 class="blog-heading">Блог</h1>
    <section v-for="[year, yearPosts] in groupedPosts" :key="year" class="year-section">
      <h2 class="year-header">{{ year }}</h2>
      <article v-for="post in yearPosts" :key="post.url" class="post-article">
        <a :href="post.url" class="post-link">
          <h3 class="post-title">{{ post.title }}</h3>
          <time class="post-date">{{ post.date.string }}</time>
          <p v-if="post.excerpt" class="post-excerpt">{{ post.excerpt }}</p>
        </a>
      </article>
    </section>
  </div>
</template>

<style scoped>
.blog-list {
  max-width: 700px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.blog-heading {
  font-size: 1.6rem;
  font-weight: 700;
  color: rgba(230, 220, 255, 0.9);
  margin-bottom: 2.5rem;
  border: none;
}

.year-section {
  margin-bottom: 2rem;
}

.year-header {
  font-family: Georgia, serif;
  font-size: 0.75rem;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(200, 180, 255, 0.35);
  margin: 0 0 0.75rem;
  padding: 0 0 0.5rem 0.75rem;
  border: none;
  border-left: 2px solid rgba(200, 180, 255, 0.2);
}

.post-article {
  margin: 0;
}

.post-link {
  display: block;
  padding: 1rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  text-decoration: none;
  transition: border-color 0.2s;
}

.post-link:hover {
  border-bottom-color: rgba(179, 77, 255, 0.5);
}

.post-link:hover .post-title {
  color: rgba(230, 220, 255, 1);
}

.post-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: rgba(230, 220, 255, 0.9);
  margin: 0 0 0.3rem;
  transition: color 0.2s;
}

.post-date {
  font-size: 0.78rem;
  color: rgba(200, 180, 255, 0.35);
  display: block;
  margin-bottom: 0.35rem;
}

.post-excerpt {
  font-size: 0.85rem;
  color: rgba(200, 180, 255, 0.45);
  line-height: 1.5;
  margin: 0;
}
</style>
