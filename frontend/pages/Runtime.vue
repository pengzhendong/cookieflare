<script setup lang="ts">
import RuntimeOverview from '@pengzhendong/worker-kit/vue/runtime-overview';
import { api, path } from '../api';
</script>

<template>
  <RuntimeOverview
    :client="api"
    :status-url="path('/runtime')"
    :metrics-url="path('/runtime/metrics')"
    initially-automatic
  />
</template>
