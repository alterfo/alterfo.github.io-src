---
site: pro
title: Заметки
description: "Заметки об AI-системах, архитектуре, разработке и управлении командами — Олег Сидоркин."
---

<script setup>
import { data as posts } from './posts.data'
import BlogList from './.vitepress/theme/components/BlogList.vue'
</script>

<BlogList :posts="posts" heading="Заметки" />
