<template>
  <ClientOnly>
    <div class="idef0-editor-root">
      <svg
        class="idef0-svg"
        :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
        xmlns="http://www.w3.org/2000/svg"
      >
        <!-- Diagram title -->
        <text
          x="50%"
          y="24"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#333"
          font-size="14"
          font-weight="bold"
        >{{ currentDiagram?.title ?? 'IDEF0 Editor' }}</text>

        <!-- Empty state -->
        <text
          v-if="!currentDiagram || currentDiagram.boxes.length === 0"
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#999"
          font-size="18"
        >No diagram loaded</text>

        <!-- Boxes -->
        <g v-if="currentDiagram">
          <g
            v-for="(rbox, idx) in renderedBoxes"
            :key="rbox.box.id"
            class="idef0-box"
          >
            <rect v-bind="rbox.rect" />

            <!-- Label lines -->
            <text
              v-for="(line, li) in rbox.labelLines"
              :key="li"
              :x="rbox.labelX"
              :y="rbox.labelBaseY + li * rbox.lineHeight"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="12"
              fill="#333"
            >{{ line }}</text>

            <!-- Block number — bottom-right corner -->
            <text
              v-if="rbox.numText"
              :x="rbox.numX"
              :y="rbox.numY"
              text-anchor="end"
              dominant-baseline="auto"
              font-size="10"
              fill="#666"
            >{{ rbox.numText }}</text>

            <!-- Decomposition marker — bottom-left corner -->
            <text
              v-if="rbox.hasDecomposition"
              :x="rbox.decompX"
              :y="rbox.decompY"
              text-anchor="start"
              dominant-baseline="auto"
              font-size="10"
              fill="#2563eb"
            >[+]</text>
          </g>
        </g>
      </svg>
    </div>
  </ClientOnly>
</template>

<script setup>
import { computed } from 'vue'
import { currentDiagram } from './IDEF0Editor/model.js'
import { renderBox } from './IDEF0Editor/renderer.js'

const VIEW_W = 1200
const VIEW_H = 800

const renderedBoxes = computed(() => {
  if (!currentDiagram.value) return []
  return currentDiagram.value.boxes.map((box, idx) =>
    renderBox(box, false, idx + 1)
  )
})
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

.idef0-box {
  cursor: pointer;
}
</style>
