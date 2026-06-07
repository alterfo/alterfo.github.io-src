<template>
  <ClientOnly>
    <div class="idef0-editor-root">
      <svg
        class="idef0-svg"
        :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text
          x="50%"
          y="40"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#333"
          font-size="14"
          font-weight="bold"
        >{{ currentDiagram?.title ?? 'IDEF0 Editor' }}</text>

        <text
          v-if="!currentDiagram || currentDiagram.boxes.length === 0"
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#999"
          font-size="18"
        >No diagram loaded</text>

        <g v-if="currentDiagram">
          <g v-for="box in currentDiagram.boxes" :key="box.id">
            <rect
              :x="box.x"
              :y="box.y"
              :width="box.w"
              :height="box.h"
              fill="white"
              stroke="black"
              stroke-width="1"
            />
            <text
              :x="box.x + box.w / 2"
              :y="box.y + box.h / 2"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="12"
              fill="#333"
            >{{ box.label }}</text>
          </g>
        </g>
      </svg>
    </div>
  </ClientOnly>
</template>

<script setup>
import { currentDiagram } from './IDEF0Editor/model.js'

const VIEW_W = 1200
const VIEW_H = 800
</script>

<style scoped>
.idef0-editor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.idef0-svg {
  flex: 1;
  width: 100%;
  height: 100%;
  background: #fff;
  border: 1px solid #ddd;
}
</style>
