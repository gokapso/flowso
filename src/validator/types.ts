export type ValidationSeverity = 'error' | 'warning';
export type ValidationPointer = { path: string };
export type ValidationIssue = {
  error: string;
  error_type: 'FLOW_JSON_ERROR';
  message: string;
  severity: ValidationSeverity;
  pointers: ValidationPointer[];
};
export type ValidationResult = { valid: boolean; issues: ValidationIssue[] };
