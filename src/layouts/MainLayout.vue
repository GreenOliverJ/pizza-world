<template>
  <q-layout view="hHh lpR fFf" class="bg-dark-page text-white">
    <q-header bordered class="pizza-header">
      <q-toolbar class="q-px-md q-py-sm">
        <q-toolbar-title class="row items-center no-wrap">
          <q-icon name="rocket_launch" color="warning" size="26px" class="q-mr-sm" />
          <div>
            <div class="text-h6 text-weight-bold">Pizza Atlas</div>
            <div class="text-caption text-grey-4">Pizza Planet | Pizza World</div>
          </div>
        </q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.pizza-header {
  background: linear-gradient(120deg, #101828 0%, #1d1d1d 55%, #c10015 100%);
  backdrop-filter: blur(2px);
}
</style>
