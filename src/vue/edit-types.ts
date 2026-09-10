import type { RenderedNode } from '../runtime/types';

/** Emitted by FlowScreen / FlowPhone when the user uses the hover toolbar or drags a component. */
export type ScreenEdit =
  | { kind: 'up' | 'down' | 'remove' | 'select'; node: RenderedNode; screenId: string }
  | { kind: 'move'; node: RenderedNode; screenId: string; target: { path: string; position: 'before' | 'after' } };
