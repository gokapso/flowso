import { computed, ref, watch, type Ref } from 'vue';
import type { FlowJson, Component, Screen } from '../src/schema/flow-json';
import { COMPONENT_CATALOG, CATALOG_CATEGORIES } from '../src/catalog/component-catalog';
import { insertComponent, insertScreen, rewireNextTargets } from '../src/catalog/insert-component';
import { compareVersions } from '../src/schema/versions';
import type { CatalogEntry } from '../src/catalog/component-catalog';
import { validateFlowJson } from '../src/validator/index';

/** Gallery state shared by the list (left column) and the detail panel (right column). */
export function useGallery(flow: Ref<FlowJson | null>) {
  const search = ref('');
  const selectedId = ref(COMPONENT_CATALOG[0]?.id ?? '');
  /** Entry under the mouse in the list: the phone peeks at it until the pointer leaves. */
  const hoveredId = ref<string | null>(null);
  const targetScreen = ref('');
  const snippetSource = ref('');
  const snippetError = ref<string | null>(null);
  const message = ref<string | null>(null);

  const entry = computed(() => COMPONENT_CATALOG.find((item) => item.id === selectedId.value) ?? null);
  const hoveredEntry = computed(() => (hoveredId.value ? COMPONENT_CATALOG.find((item) => item.id === hoveredId.value) ?? null : null));
  /** What the phone shows: the hovered entry (peek) or the selected one. */
  const previewEntry = computed(() => hoveredEntry.value ?? entry.value);
  const previewId = computed(() => previewEntry.value?.id ?? '');
  const screens = computed(() => flow.value?.screens ?? []);
  const flowVersion = computed(() => flow.value?.version ?? null);

  /** True when the current flow's version is older than what the entry needs. */
  function needsNewerVersion(item: CatalogEntry): boolean {
    return flowVersion.value !== null && compareVersions(flowVersion.value, item.minVersion) < 0;
  }

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
    const current = previewEntry.value;
    const peeking = hoveredEntry.value !== null && hoveredEntry.value.id !== entry.value?.id;
    const snippet: Component | Screen | null = peeking
      ? (current?.placement === 'screen' ? current.screen ?? null : current?.component ?? null)
      : parsedSnippet.value;
    if (!current || !snippet) return null;
    if (current.placement === 'screen') {
      return { version: '7.3', data_api_version: '3.0', routing_model: {}, screens: [rewireNextTargets(snippet as Screen, 'PREVIEW')] };
    }
    const component = rewireNextTargets(snippet as Component, 'PREVIEW');
    const children: Component[] = [...(current.previewContext ?? []), component];
    if (component.type !== 'Footer') children.push({ type: 'Footer', label: 'Continue', 'on-click-action': { name: 'complete', payload: {} } });

    return {
      version: '7.3',
      data_api_version: '3.0',
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

  return { search, selectedId, hoveredId, previewId, needsNewerVersion, flowVersion, targetScreen, snippetSource, snippetError, message, entry, screens, grouped, parsedSnippet, previewFlow, previewIssues, copyJson, insert };
}

export type GalleryState = ReturnType<typeof useGallery>;
