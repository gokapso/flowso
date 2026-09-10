<script setup lang="ts">
import type { RenderedNode } from '../../runtime/types';

defineProps<{ node: RenderedNode; disabled?: boolean }>();
</script>

<template>
  <div class="wa-unsupported">Component <code>{{ node.type }}</code> is not rendered by the simulator yet.</div>
</template>

<style scoped>
.wa-unsupported {
  padding: 8px 12px;
  border: 1px dashed var(--wa-border);
  border-radius: var(--wa-radius);
  color: var(--wa-text-muted);
  font-size: 13px;
}
</style>
