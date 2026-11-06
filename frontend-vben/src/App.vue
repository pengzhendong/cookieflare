<script setup lang="ts">
import { computed } from 'vue';
import { useAntdDesignTokens } from '@vben/hooks';
import { usePreferences } from '@vben/preferences';
import { App, ConfigProvider, theme } from 'ant-design-vue';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import SessionGate from './SessionGate.vue';
const { isDark } = usePreferences();
const { tokens } = useAntdDesignTokens();
const tokenTheme = computed(() => ({ algorithm: isDark.value ? theme.darkAlgorithm : theme.defaultAlgorithm, token: tokens }));
</script>
<template><ConfigProvider :locale="zhCN" :theme="tokenTheme"><App><SessionGate /></App></ConfigProvider></template>
