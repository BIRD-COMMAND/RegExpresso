import {
  CompiledRegexResult,
  MacroIntentType,
  ParsedQuery,
  ParseOutcome,
  RegexStep
} from '../types';
import { escapeRegexLiteral } from '../grammar/tokens';
import { checkImpossibleRequest } from '../parser/impossibleGuard';
import { parseQueryClauses } from '../parser';
import { handleDeleteIntent, handleFindIntent } from './handlers/findAndDeleteHandler';
import { handleReplaceIntent, handleWrapIntent } from './handlers/replaceAndWrapHandler';
import { handleEnsureIntent, handleInsertAddIntent } from './handlers/insertAndEnsureHandler';
import { handleTrimIntent } from './handlers/trimHandler';
import {
  handleCaseTransformIntent,
  handleExtractIntent,
  handleSwapIntent
} from './handlers/transformAndExtractHandler';

export { escapeRegexLiteral };

export type IntentHandlerFn = (parsed: ParsedQuery) => CompiledRegexResult;

export const INTENT_HANDLERS: Record<MacroIntentType, IntentHandlerFn> = {
  FIND: handleFindIntent,
  DELETE: handleDeleteIntent,
  REPLACE: handleReplaceIntent,
  WRAP: handleWrapIntent,
  INSERT_ADD: handleInsertAddIntent,
  ENSURE: handleEnsureIntent,
  TRIM: handleTrimIntent,
  SWAP_REORDER: handleSwapIntent,
  CASE_TRANSFORM: handleCaseTransformIntent,
  EXTRACT_CAPTURE: handleExtractIntent
};

/**
 * Main compiler entry point: parses any English natural language regex request into a `ParseOutcome`.
 *
 * Pipeline stages:
 * 1. Pre-flight Impossible Guard (theoretical ECMAScript regex limitations + native workarounds)
 * 2. Multi-Step Pipeline Splitting (`"and then"`)
 * 3. Macro-Level Intent & Clause Decomposition (`parseQueryClauses`)
 * 4. Specialized Intent Handler Dispatch (`INTENT_HANDLERS[parsed.intent]`)
 */
export function parseNaturalLanguageRequest(prompt: string): ParseOutcome {
  const clean = prompt.trim();

  // Stage 1: Check if the request is theoretically or practically impossible in VS Code Regex
  const impossible = checkImpossibleRequest(clean);
  if (impossible) {
    return impossible;
  }

  // Stage 2: Check if user chained two distinct commands with "and then"
  if (/\band\s+then\b/i.test(clean)) {
    const subPrompts = clean
      .split(/\band\s+then\b/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (subPrompts.length >= 2) {
      const steps: RegexStep[] = [];
      const features: string[] = ['Multi-step pipeline'];
      for (const sp of subPrompts) {
        const subOutcome = parseNaturalLanguageRequest(sp);
        if (subOutcome.isPossible) {
          steps.push(...subOutcome.steps);
          features.push(...subOutcome.featuresUsed);
        }
      }
      if (steps.length >= 2) {
        return {
          isPossible: true,
          mode: 'multi-step',
          summary: `Execute ${steps.length}-step regex pipeline: ${subPrompts.join(' → ')}.`,
          steps,
          featuresUsed: Array.from(new Set(features)),
          confidence: 'high',
          preferredAction: 'replace-all'
        };
      }
    }
  }

  // Stage 3: Macro-Level Intent & Clause Decomposition
  const parsed = parseQueryClauses(clean);

  // Stage 4: Delegate to Specialized Intent Handler
  const handler = INTENT_HANDLERS[parsed.intent];
  return handler(parsed);
}
