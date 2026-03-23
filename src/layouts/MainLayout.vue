<template>
  <q-layout view="hHh lpR fFf" class="bg-warm-page text-brown-10">
    <q-header bordered class="pizza-header">
      <q-toolbar class="q-px-md q-py-sm">
        <q-toolbar-title class="row items-center no-wrap header-brand">
          <div class="pizza-world-logo-wrap">
            <img :src="logoSrc" alt="Pizza World logo" class="pizza-world-logo" />
          </div>
          <div class="pizza-world-wordmark-wrap">
            <img :src="wordmarkSrc" alt="Pizza World" class="pizza-world-wordmark" />
            <div class="text-subtitle2 text-brown-7 text-center">
              Best pizzerias across the globe
            </div>
          </div>
        </q-toolbar-title>
        <div class="header-note text-caption text-brown-8">
          Showing only Google-rated pizzerias 4.8+
        </div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import logoSrc from 'src/assets/pizza-world-logo.png';
import wordmarkSrc from 'src/assets/pizza-world-text.png';
</script>

<style scoped>
.pizza-header {
  background: linear-gradient(120deg, #ffe8c5 0%, #ffd8ab 55%, #ffb66e 100%);
  border-bottom: 1px solid rgba(125, 56, 24, 0.2);
  overflow: hidden;
}

.header-brand {
  gap: 14px;
  justify-content: flex-start;
  position: relative;
  isolation: isolate;
}

.header-note {
  white-space: nowrap;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(125, 56, 24, 0.18);
}

.pizza-world-logo-wrap {
  width: 90px;
  height: 90px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  animation: pizza-roll-in 1.8s cubic-bezier(0.2, 0.85, 0.25, 1) both;
  transform-origin: center center;
  position: relative;
  z-index: 1; /* keep logo rolling behind wordmark */
}

.pizza-world-logo {
  width: 90px;
  height: 90px;
  object-fit: contain;
}

.pizza-world-wordmark-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  position: relative;
  z-index: 2;
}

.pizza-world-wordmark {
  height: 80px;
  width: auto;
  object-fit: contain;
}

@keyframes pizza-roll-in {
  0% {
    transform: translateX(52vw) rotate(900deg);
    opacity: 0.95;
  }
  68% {
    transform: translateX(-10px) rotate(-36deg);
    opacity: 1;
  }
  84% {
    transform: translateX(4px) rotate(14deg);
  }
  100% {
    transform: translateX(0) rotate(0deg);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pizza-world-logo-wrap {
    animation: none;
  }
}

@media (max-width: 599px) {
  .header-brand {
    gap: 10px;
  }

  .pizza-world-logo-wrap,
  .pizza-world-logo {
    width: 56px;
    height: 56px;
  }

  .pizza-world-wordmark {
    height: 44px;
  }

  .pizza-world-wordmark-wrap {
    align-items: flex-start;
  }

  .header-note {
    display: none;
  }
}
</style>
