<template>
  <ClientOnly>
    <div class="idef0-editor-root">
      <svg
        class="idef0-svg"
        :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#999" font-size="18">
          IDEF0 Editor — loading…
        </text>
      </svg>
    </div>
  </ClientOnly>
</template>

<script setup>
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
