<template>
  <div class="pro-panel pro-team">
    <div class="pro-panel-bar">
      <span class="pro-bar-label">Связи / модель команды</span>
      <span class="pro-bar-status is-ok">{{ grouped ? groupLabel : 'одна группа' }}</span>
    </div>

    <div class="pro-team-body">
      <div class="pro-team-graph">
        <svg viewBox="0 0 340 240" role="img" :aria-label="'Граф связей: ' + nodes.length + ' человек'">
          <line
            v-for="link in links"
            :key="link.key"
            :x1="link.x1"
            :y1="link.y1"
            :x2="link.x2"
            :y2="link.y2"
            :class="['pro-link', link.cross ? 'cross' : '']"
          />
          <circle
            v-for="(node, i) in nodes"
            :key="'n' + i"
            :cx="node.x"
            :cy="node.y"
            :r="node.r"
            :class="['pro-node', 'g' + (node.group % 3)]"
          />
        </svg>
        <p class="pro-team-formula">каналов: n(n−1)/2</p>
      </div>

      <div class="pro-team-side">
        <div class="pro-big">
          <b>{{ grouped ? split.total : one }}</b>
          <span>каналов связи</span>
        </div>
        <div class="pro-team-toggle">
          <button type="button" class="pro-chip" :class="{ on: !grouped }" @click="grouped = false">
            одна команда
          </button>
          <button type="button" class="pro-chip" :class="{ on: grouped }" @click="grouped = true">
            группы по 8
          </button>
        </div>
        <label class="pro-slider">
          <span>людей: <b>{{ people }}</b></span>
          <input v-model.number="people" type="range" min="3" max="30" step="1" />
        </label>
        <dl class="pro-team-facts">
          <div><dt>на человека</dt><dd>{{ perPerson }}</dd></div>
          <div v-if="grouped"><dt>внутри групп</dt><dd>{{ split.within }}</dd></div>
          <div v-if="grouped"><dt>между группами</dt><dd>{{ split.cross }}</dd></div>
          <div v-else><dt>групп</dt><dd>1</dd></div>
        </dl>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { channels, groupModelExact } from './topology.js'

const people = ref(24)
const grouped = ref(true)

const one = computed(() => channels(people.value))
const split = computed(() => groupModelExact(people.value, 8))
const groups = computed(() => split.value.groups)
const groupLabel = computed(() => {
  const n = groups.value
  const word = n === 1 ? 'группа' : n >= 2 && n <= 4 ? 'группы' : 'групп'
  return n + ' ' + word
})
const perPerson = computed(() => ((grouped.value ? split.value.total : one.value) / people.value).toFixed(1))

const sizes = computed(() => (grouped.value ? split.value.sizes : [people.value]))
const nodes = computed(() => {
  const out = []
  if (!grouped.value) {
    for (let i = 0; i < people.value; i++) {
      const angle = -Math.PI / 2 + (i / Math.max(1, people.value)) * Math.PI * 2
      out.push({
        x: +(170 + Math.cos(angle) * 132).toFixed(2),
        y: +(120 + Math.sin(angle) * 94).toFixed(2),
        r: 3,
        group: 0,
        lead: i === 0,
      })
    }
    return out
  }

  const list = sizes.value
  const centers = list.map((_, gi) => {
    const a = -Math.PI / 2 + gi * ((Math.PI * 2) / list.length)
    return { x: 170 + Math.cos(a) * 92, y: 120 + Math.sin(a) * 62 }
  })

  list.forEach((count, gi) => {
    const c = centers[gi]
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (k / Math.max(1, count)) * Math.PI * 2
      const rad = count > 1 ? 27 : 0
      out.push({
        x: +(c.x + Math.cos(a) * rad).toFixed(2),
        y: +(c.y + Math.sin(a) * rad).toFixed(2),
        r: 3.3,
        group: gi,
        lead: k === 0,
      })
    }
  })
  return out
})

const links = computed(() => {
  const out = []
  const list = nodes.value
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].group
      const b = list[j].group
      if (!grouped.value || a === b) {
        out.push({
          key: i + '-' + j,
          x1: list[i].x,
          y1: list[i].y,
          x2: list[j].x,
          y2: list[j].y,
          cross: false,
        })
      } else if (list[i].lead && list[j].lead) {
        out.push({
          key: i + '-' + j,
          x1: list[i].x,
          y1: list[i].y,
          x2: list[j].x,
          y2: list[j].y,
          cross: true,
        })
      }
    }
  }
  return out
})
</script>
