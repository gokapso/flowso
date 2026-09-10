import { describe, expect, it } from 'vitest';
import { CATALOG_CATEGORIES, COMPONENT_CATALOG, findCatalogEntry, type CatalogEntry } from '../../src/catalog/component-catalog';
import type { Component, FlowJson, Screen } from '../../src/schema/flow-json';
import { isInputComponent } from '../../src/schema/flow-json';
import { ACTION_MIN_VERSION, COMPONENT_MIN_VERSION, compareVersions } from '../../src/schema/versions';
import { createFlowRuntime } from '../../src/runtime/runtime';
import { validateFlowJson } from '../../src/validator';

function componentsIn(components: Component[]): Component[] {
  return components.flatMap((component) => {
    switch (component.type) {
      case 'Form': return [component, ...componentsIn(component.children)];
      case 'If': return [component, ...componentsIn(component.then), ...componentsIn(component.else ?? [])];
      case 'Switch': return [component, ...componentsIn(Object.values(component.cases).flat())];
      default: return [component];
    }
  });
}

function completeFooter(): Component {
  return { type: 'Footer', label: 'Done', 'on-click-action': { name: 'complete', payload: {} } };
}

function navigatesToNext(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(navigatesToNext);
  if (!value || typeof value !== 'object') return false;
  const object = value as Record<string, unknown>;
  if (object.name === 'navigate' && object.next && typeof object.next === 'object'
    && 'name' in object.next && object.next.name === 'NEXT') return true;

  return Object.values(object).some(navigatesToNext);
}

function previewFlow(entry: CatalogEntry): FlowJson {
  if (entry.placement === 'screen') {
    if (!entry.screen) throw new Error(`Missing screen: ${entry.id}`);

    return { version: '7.3', routing_model: {}, screens: [entry.screen] };
  }
  if (!entry.component) throw new Error(`Missing component: ${entry.id}`);
  const children = [...(entry.previewContext ?? []), entry.component];
  // A Form can provide the screen's Footer itself; never append a second one.
  if (!componentsIn(children).some((component) => component.type === 'Footer')) children.push(completeFooter());
  const screen: Screen = {
    id: 'PREVIEW', title: entry.name, terminal: true, data: entry.previewData,
    layout: { type: 'SingleColumnLayout', children },
  };
  if (navigatesToNext(children)) {
    return {
      version: '7.3', routing_model: { PREVIEW: ['NEXT'], NEXT: [] },
      screens: [screen, {
        id: 'NEXT', terminal: true,
        layout: { type: 'SingleColumnLayout', children: [{ type: 'TextBody', text: 'Next screen' }, completeFooter()] },
      }],
    };
  }

  return { version: '7.3', routing_model: {}, screens: [screen] };
}

function entryFor(id: string): CatalogEntry {
  const entry = findCatalogEntry(id);
  if (!entry) throw new Error(`Missing catalog entry: ${id}`);

  return entry;
}

describe('component catalog', () => {
  it.each(COMPONENT_CATALOG)('$id validates and renders with the real runtime', async (entry) => {
    const flow = previewFlow(entry);
    const errors = validateFlowJson(flow).issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
    const runtime = createFlowRuntime({ flow });
    await runtime.start();
    const rendered = runtime.render();
    expect(rendered?.children.length).toBeGreaterThan(0);
    expect(rendered?.errorMessage).toBeNull();
    expect(runtime.getState().error).toBeNull();
  });

  it('has unique kebab-case IDs, HTTPS documentation, and exactly one snippet per entry', () => {
    const ids = COMPONENT_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of COMPONENT_CATALOG) {
      expect(entry.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(entry.docsUrl.startsWith('https://')).toBe(true);
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(entry.minVersion).toMatch(/^\d+\.\d+$/);
      expect(compareVersions(entry.minVersion, '7.3')).toBeLessThanOrEqual(0);
      if (entry.placement === 'component') {
        expect(entry.component).toBeDefined();
        expect(entry.screen).toBeUndefined();
      } else {
        expect(entry.screen).toBeDefined();
        expect(entry.component).toBeUndefined();
      }
    }
  });

  it('covers every component type and every required variant and pattern', () => {
    const types = COMPONENT_CATALOG.flatMap((entry) => entry.component ? [entry.component.type] : []);
    expect([...new Set(types)].sort()).toEqual(Object.keys(COMPONENT_MIN_VERSION).sort());
    expect(COMPONENT_CATALOG.map((entry) => entry.id).sort()).toEqual([
      'text-heading', 'text-subheading', 'text-body', 'text-body-markdown', 'text-caption', 'rich-text',
      'image', 'image-carousel', 'text-input', 'text-input-email', 'text-input-pattern', 'text-area',
      'checkbox-group', 'radio-buttons-group', 'radio-buttons-group-dynamic', 'dropdown', 'chips-selector',
      'opt-in', 'date-picker', 'calendar-picker-range', 'photo-picker', 'document-picker', 'footer',
      'footer-captions', 'embedded-link', 'navigation-list', 'if', 'switch', 'form', 'update-data',
      'login-screen', 'appointment-slot-picker', 'survey', 'success-screen',
    ].sort());
    expect(entryFor('text-body').component?.markdown).not.toBe(true);
    expect(entryFor('text-body-markdown').component).toMatchObject({ markdown: true, text: expect.stringMatching(/\*[^*]+\*.*_[^_]+_/) });
    expect(entryFor('rich-text').component?.text).toMatch(/^# .+\n[\s\S]*- .+[\s\S]*\*\*.+\*\*/);
    expect(entryFor('text-input-email').component).toMatchObject({ 'input-type': 'email', 'helper-text': expect.any(String) });
    expect(entryFor('text-input-pattern').component).toMatchObject({ pattern: expect.any(String), 'error-message': expect.any(String), 'helper-text': expect.any(String) });
    expect(entryFor('checkbox-group').component).toMatchObject({ 'min-selected-items': 1, 'data-source': expect.arrayContaining([expect.objectContaining({ description: expect.any(String) })]) });
    expect(entryFor('radio-buttons-group-dynamic').component?.['data-source']).toBe('${data.options}');
    expect(entryFor('opt-in').component).toMatchObject({ 'on-click-action': { name: 'open_url' } });
    expect(entryFor('date-picker').component).toMatchObject({ 'min-date': expect.any(String), 'unavailable-dates': [expect.any(String)] });
    expect(entryFor('calendar-picker-range').component).toMatchObject({ mode: 'range', label: expect.any(String) });
    expect(entryFor('footer').component).toMatchObject({ 'on-click-action': { name: 'navigate', next: { name: 'NEXT' } } });
    expect(entryFor('footer-captions').component).toMatchObject({ 'left-caption': expect.any(String), 'right-caption': expect.any(String) });
    expect(entryFor('embedded-link').component).toMatchObject({ 'on-click-action': { name: 'open_url' } });
    const navigation = entryFor('navigation-list').component;
    if (navigation?.type !== 'NavigationList' || !Array.isArray(navigation['list-items'])) throw new Error('Missing navigation items');
    expect(navigation['list-items']).toHaveLength(3);
    expect(navigation['list-items'].filter((item) => item.badge)).toHaveLength(1);
    for (const item of navigation['list-items']) {
      expect(item.start).toBeUndefined();
      expect(item.end?.title).toBeTruthy();
    }
    expect(entryFor('if').component?.condition).toBe('${data.is_member}');
    expect(entryFor('switch').component?.value).toBe('${data.plan}');
    expect(entryFor('update-data').component).toMatchObject({ type: 'RadioButtonsGroup', 'on-select-action': { name: 'update_data', payload: { show_details: expect.any(String) } } });
    expect(entryFor('update-data').previewContext).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'If', condition: '${data.show_details}' })]));
    const login = entryFor('login-screen').screen;
    expect(login?.layout.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TextInput', 'input-type': 'email' }),
      expect.objectContaining({ type: 'TextInput', 'input-type': 'password' }),
      expect.objectContaining({ type: 'OptIn' }),
    ]));
    expect(entryFor('appointment-slot-picker').screen?.layout.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'Dropdown', 'data-source': '${data.slots}' }),
      expect.objectContaining({ type: 'Footer', 'on-click-action': expect.objectContaining({ name: 'data_exchange' }) }),
    ]));
    expect(entryFor('survey').screen?.layout.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'RadioButtonsGroup' }), expect.objectContaining({ type: 'TextArea' }),
    ]));
    expect(entryFor('success-screen').screen).toMatchObject({ terminal: true, success: true });
    expect(entryFor('success-screen').screen?.layout.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TextHeading' }), expect.objectContaining({ type: 'TextBody' }),
    ]));
    for (const id of ['login-screen', 'survey', 'success-screen']) {
      expect(entryFor(id).screen).toMatchObject({ terminal: true });
      expect(entryFor(id).screen?.layout.children).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'Footer', 'on-click-action': expect.objectContaining({ name: 'complete' }) }),
      ]));
    }
  });

  it('provides each category once and supports lookup including missing IDs', () => {
    expect(CATALOG_CATEGORIES.map((category) => category.id).sort()).toEqual(['text', 'media', 'input', 'selection', 'datetime', 'action', 'logic', 'pattern'].sort());
    for (const category of CATALOG_CATEGORIES) {
      expect(category.label.trim()).not.toBe('');
      expect(COMPONENT_CATALOG.some((entry) => entry.category === category.id)).toBe(true);
    }
    for (const entry of COMPONENT_CATALOG) {
      expect(CATALOG_CATEGORIES.some((category) => category.id === entry.category)).toBe(true);
      expect(findCatalogEntry(entry.id)).toBe(entry);
    }
    expect(findCatalogEntry('missing-entry')).toBeUndefined();
  });

  it('declares preview examples and unique labeled inputs with compatible version floors', () => {
    for (const entry of COMPONENT_CATALOG) {
      const screen = previewFlow(entry).screens[0];
      if (!screen) throw new Error(`Missing preview: ${entry.id}`);
      for (const declaration of Object.values(screen.data ?? {})) expect(declaration).toHaveProperty('__example__');
      const components = componentsIn(screen.layout.children);
      const inputs = components.filter(isInputComponent);
      expect(new Set(inputs.map((input) => input.name)).size).toBe(inputs.length);
      for (const input of inputs) expect(input.label.trim().length).toBeGreaterThan(0);
      for (const component of components) {
        expect(compareVersions(entry.minVersion, COMPONENT_MIN_VERSION[component.type])).toBeGreaterThanOrEqual(0);
        for (const key of ['on-click-action', 'on-select-action', 'on-unselect-action']) {
          const action = component[key];
          if (action && typeof action === 'object' && 'name' in action) {
            const minimum = ACTION_MIN_VERSION[action.name as keyof typeof ACTION_MIN_VERSION];
            expect(compareVersions(entry.minVersion, minimum)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('uses the same small inline PNG in the Image and both carousel images', () => {
    const image = entryFor('image').component;
    const carousel = entryFor('image-carousel').component;
    if (image?.type !== 'Image' || carousel?.type !== 'ImageCarousel' || !Array.isArray(carousel.images)) throw new Error('Missing images');
    expect(carousel.images).toHaveLength(2);
    expect(carousel.images.every((item) => item.src === image.src)).toBe(true);
    const png = Buffer.from(image.src, 'base64');
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.length).toBeLessThan(200);
    expect(png.readUInt32BE(16)).toBe(1);
    expect(png.readUInt32BE(20)).toBe(1);
  });

  it('changes the If preview in both directions when update_data options are selected', async () => {
    const runtime = createFlowRuntime({ flow: previewFlow(entryFor('update-data')) });
    await runtime.start();
    const text = () => runtime.render()?.children.filter((node) => node.type === 'TextBody').map((node) => node.props.text);
    expect(text()).toEqual(['Select Show details to learn what is included.']);
    await runtime.setFormValue('details_preference', 'show');
    expect(runtime.getState().screenData.PREVIEW?.show_details).toBe(true);
    expect(text()).toEqual(['Your visit includes a checkup and a written care plan.']);
    await runtime.setFormValue('details_preference', 'hide');
    expect(runtime.getState().screenData.PREVIEW?.show_details).toBe(false);
    expect(text()).toEqual(['Select Show details to learn what is included.']);
    expect(runtime.render()?.errorMessage).toBeNull();
    expect(runtime.getState().events.filter((event) => event.type === 'update_data')).toHaveLength(2);
  });

  it('resolves dynamic choices and allows selecting the supplied examples', async () => {
    for (const [id, name, choice] of [
      ['radio-buttons-group-dynamic', 'dynamic_option', 'extended'],
      ['appointment-slot-picker', 'appointment_slot', 'afternoon'],
    ] as const) {
      const runtime = createFlowRuntime({ flow: previewFlow(entryFor(id)) });
      await runtime.start();
      const input = runtime.render()?.children.find((node) => node.name === name);
      expect(input?.props['data-source']).toEqual(expect.arrayContaining([expect.objectContaining({ id: choice })]));
      await runtime.setFormValue(name, choice);
      expect(runtime.render()?.children.find((node) => node.name === name)?.value).toBe(choice);
      expect(runtime.getState().error).toBeNull();
    }
  });

  it('initializes both Form inputs and completes with their values using a single Footer', async () => {
    const form = entryFor('form').component;
    if (form?.type !== 'Form') throw new Error('Missing Form');
    expect(form['init-values']).toEqual({ form_first_name: 'Alex', form_last_name: 'Rivera' });
    expect(form.children.filter(isInputComponent)).toHaveLength(2);
    const runtime = createFlowRuntime({ flow: previewFlow(entryFor('form')) });
    await runtime.start();
    expect(runtime.getState().formValues.PREVIEW).toEqual({ form_first_name: 'Alex', form_last_name: 'Rivera' });
    expect(runtime.render()?.children.filter((node) => node.type === 'Footer')).toHaveLength(1);
    const footer = form.children.find((component) => component.type === 'Footer');
    if (!footer) throw new Error('Missing Form Footer');
    await runtime.dispatch(footer['on-click-action']);
    expect(runtime.getState().completion?.params).toEqual({ first_name: 'Alex', last_name: 'Rivera' });
  });

  it('navigates the Footer preview to the supplied NEXT screen', async () => {
    const entry = entryFor('footer');
    if (entry.component?.type !== 'Footer') throw new Error('Missing Footer');
    const runtime = createFlowRuntime({ flow: previewFlow(entry) });
    await runtime.start();
    await runtime.dispatch(entry.component['on-click-action']);
    expect(runtime.getState().screenId).toBe('NEXT');
    expect(runtime.getState().error).toBeNull();
    expect(runtime.render()?.errorMessage).toBeNull();
  });
});
