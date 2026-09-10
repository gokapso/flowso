import { computed, ref, watch, type Ref } from 'vue';
import type { FlowJson, Component, Screen } from '../src/schema/flow-json';
import { COMPONENT_CATALOG, CATALOG_CATEGORIES } from '../src/catalog/component-catalog';
import { insertComponent, insertScreen, rewireNextTargets } from '../src/catalog/insert-component';
import { validateFlowJson } from '../src/validator/index';

/** Gallery state shared by the list (left column) and the detail panel (right column). */
export function useGallery(flow: Ref<FlowJson | null>) {
  const search = ref('');
  const selectedId = ref(COMPONENT_CATALOG[0]?.id ?? '');
  const targetScreen = ref('');
  const snippetSource = ref('');
  const snippetError = ref<string | null>(null);
  const message = ref<string | null>(null);

  const entry = computed(() => COMPONENT_CATALOG.find((item) => item.id === selectedId.value) ?? null);
  const screens = computed(() => flow.value?.screens ?? []);

  const grouped = computed(() => {
    const term = search.value.trim().toLowerCase();

    return CATALOG_CATEGORIES.map((category) => ({
      ...category,
      entries: COMPONENT_CATALOG.filter(
        (item) => item.category === category.id && (!term || `${item.name} ${item.description}`.toLowerCase().includes(term)),
      ),
    })).filter((category) => category.entries.length > 0);
  });

  watch(
    entry,
    (value) => {
      snippetSource.value = value ? JSON.stringify(value.placement === 'screen' ? value.screen : value.component, null, 2) : '';
      snippetError.value = null;
      message.value = null;
    },
    { immediate: true },
  );

  watch(
    flow,
    (value) => {
      if (value && !value.screens.some((screen) => screen.id === targetScreen.value)) targetScreen.value = value.screens[0]?.id ?? '';
    },
    { immediate: true },
  );

  const parsedSnippet = computed<Component | Screen | null>(() => {
    try {
      const value = JSON.parse(snippetSource.value) as Component | Screen;
      snippetError.value = null;

      return value;
    } catch (error) {
      snippetError.value = error instanceof Error ? error.message : String(error);

      return null;
    }
  });

  /** One-screen flow around the snippet so the real runtime renders it in the same phone. */
  const previewFlow = computed<FlowJson | null>(() => {
    const current = entry.value;
    const snippet = parsedSnippet.value;
    if (!current || !snippet) return null;
    if (current.placement === 'screen') {
      return { version: '7.3', routing_model: {}, screens: [rewireNextTargets(snippet as Screen, 'PREVIEW')] };
    }
    const component = rewireNextTargets(snippet as Component, 'PREVIEW');
    const children: Component[] = [...(current.previewContext ?? []), component];
    if (component.type !== 'Footer') children.push({ type: 'Footer', label: 'Continue', 'on-click-action': { name: 'complete', payload: {} } });

    return {
      version: '7.3',
      routing_model: {},
      screens: [{ id: 'PREVIEW', title: current.name, terminal: true, data: current.previewData, layout: { type: 'SingleColumnLayout', children } }],
    };
  });

  const previewIssues = computed(() => (previewFlow.value ? validateFlowJson(previewFlow.value).issues.filter((issue) => issue.severity === 'error') : []));

  function copyJson() {
    void navigator.clipboard.writeText(snippetSource.value);
    message.value = 'Copied to clipboard';
  }

  /** Returns the new flow and insertion path, or null (message explains why). */
  function insert(): { flow: FlowJson; path: string } | null {
    const current = entry.value;
    const snippet = parsedSnippet.value;
    if (!flow.value || !current || !snippet) return null;
    const result = current.placement === 'screen'
      ? insertScreen(flow.value, snippet as Screen)
      : insertComponent(flow.value, snippet as Component, { screenId: targetScreen.value });
    if (!result.ok) {
      message.value = result.error;

      return null;
    }
    message.value = `Inserted at ${result.path}`;

    return { flow: result.flow, path: result.path };
  }

  return { search, selectedId, targetScreen, snippetSource, snippetError, message, entry, screens, grouped, parsedSnippet, previewFlow, previewIssues, copyJson, insert };
}

export type GalleryState = ReturnType<typeof useGallery>;
