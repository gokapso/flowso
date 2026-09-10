import type { RenderedNode } from '../runtime/types';

/** Emitted by FlowScreen / FlowPhone when the user uses the hover toolbar in editable mode. */
export type ScreenEdit = { kind: 'up' | 'down' | 'remove' | 'select'; node: RenderedNode; screenId: string };
