---
title: Блог
description: "Заметки об аудио, AI, архитектуре и локальных инструментах без облака — блог Олега Сидоркина."
---

<script setup>
import { data as posts } from './posts.data'
import BlogList from './.vitepress/theme/components/BlogList.vue'
</script>

<BlogList :posts="posts" />
