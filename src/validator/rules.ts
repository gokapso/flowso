import { validateComponents } from './components';
import { validateEndpointUsage } from './endpoint';
import type { Rule } from './context';
import { validateLimits } from './limits';
import { validateReferences } from './references';
import { validateRouting } from './routing';
import { validateScreens } from './screens';
import { validateStructure } from './structure';
import { validateVersions } from './versions';

export const rules: readonly Rule[] = [
  validateStructure, validateScreens, validateRouting, validateComponents, validateVersions, validateLimits, validateReferences,
  validateEndpointUsage,
];
