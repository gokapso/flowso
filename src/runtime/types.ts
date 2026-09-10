import type { Action, ComponentType, FlowJson } from '../schema/flow-json';

/** Minimal endpoint contract used by the runtime. `endpoint` module implements it. */
export type FlowDataExchangeRequest = {
  version: string;
  action: 'INIT' | 'data_exchange' | 'BACK' | 'ping';
  screen?: string;
  data?: Record<string, unknown>;
  flow_token: string;
};

export type FlowDataExchangeResponse = {
  version?: string;
  screen?: string;
  data?: Record<string, unknown>;
};

export type FlowDataEndpoint = {
  exchange(request: FlowDataExchangeRequest): Promise<FlowDataExchangeResponse>;
};

export type RuntimeStatus = 'idle' | 'ready' | 'loading' | 'completed' | 'error';

export type RuntimeEvent =
  | { type: 'start'; mode: 'navigate' | 'data_exchange'; screenId: string }
  | { type: 'navigate'; from: string | null; to: string; payload: Record<string, unknown> }
  | { type: 'back'; from: string; to: string }
  | { type: 'data_exchange:request'; request: FlowDataExchangeRequest }
  | { type: 'data_exchange:response'; response: FlowDataExchangeResponse; durationMs: number }
  | { type: 'update_data'; screenId: string; payload: Record<string, unknown> }
  | { type: 'complete'; screenId: string; params: Record<string, unknown> }
  | { type: 'open_url'; url: string }
  | { type: 'validation_failed'; screenId: string; errors: Record<string, string> }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string; kind: RuntimeErrorKind };

export type RuntimeErrorKind = 'routing' | 'endpoint' | 'expression' | 'unknown_screen' | 'invalid_action';

export type FlowCompletion = {
  screenId: string;
  params: Record<string, unknown>;
  /** What WhatsApp would send back as `interactive.nfm_reply.response_json`. */
  responseJson: string;
};

export type FlowRuntimeState = {
  status: RuntimeStatus;
  screenId: string | null;
  /** Screen ids from first to current. */
  history: string[];
  screenData: Record<string, Record<string, unknown>>;
  formValues: Record<string, Record<string, unknown>>;
  fieldErrors: Record<string, Record<string, string>>;
  /** `error_message` returned by the endpoint for the current screen. */
  errorMessage: string | null;
  completion: FlowCompletion | null;
  error: { kind: RuntimeErrorKind; message: string } | null;
  events: RuntimeEvent[];
};

export type StartOptions =
  | { mode: 'navigate'; screen?: string; data?: Record<string, unknown> }
  | { mode: 'data_exchange' };

export type DispatchOptions = {
  /** Validate the current screen's form before running the action. Default: true for Footer actions. */
  validate?: boolean;
};

export type FlowRuntimeOptions = {
  flow: FlowJson;
  endpoint?: FlowDataEndpoint;
  flowToken?: string;
  /** Use `__example__` values from screen data declarations when data is missing (Meta's preview does). Default true. */
  useExamples?: boolean;
  /** Reject navigation that is not allowed by `routing_model`. Default true. */
  strictRouting?: boolean;
  onEvent?: (event: RuntimeEvent) => void;
};

export type RenderedNode = {
  key: string;
  /** Location of the source component inside `screen.layout`, e.g. `children[2].children[0]` or `children[1].then[0]`. */
  path: string;
  type: ComponentType;
  /** All component properties with dynamic values resolved. */
  props: Record<string, unknown>;
  /** For input components: the field name. */
  name?: string;
  /** For input components: current value. */
  value?: unknown;
  /** For input components: validation error, if any. */
  error?: string | null;
};

export type RenderedScreen = {
  id: string;
  title: string;
  terminal: boolean;
  success: boolean;
  children: RenderedNode[];
  errorMessage: string | null;
  /** False while a visible, enabled, required input is empty. The WhatsApp client greys out the Footer button. */
  canSubmit: boolean;
};

export type FlowRuntime = {
  readonly flow: FlowJson;
  getState(): FlowRuntimeState;
  subscribe(listener: (state: FlowRuntimeState) => void): () => void;
  start(options?: StartOptions): Promise<FlowRuntimeState>;
  setFormValue(name: string, value: unknown): Promise<FlowRuntimeState>;
  dispatch(action: Action, options?: DispatchOptions): Promise<FlowRuntimeState>;
  back(): Promise<FlowRuntimeState>;
  render(): RenderedScreen | null;
  reset(): FlowRuntimeState;
};
