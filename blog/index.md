---
title: Блог
---

<script setup>
import { data as posts } from '../posts.data'
import BlogList from '../.vitepress/theme/components/BlogList.vue'
</script>

<BlogList :posts="posts" />
