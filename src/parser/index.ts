import {
  CaseTransformMode,
  ExecutionAction,
  LookaroundCondition,
  MacroIntentType,
  ParsedQuery
} from '../types';
import { maskQuotedLiterals, unmaskQuotes } from '../grammar/tokens';
import { normalizeAndExtractGlobalHints, parseCaseTransformMode } from './normalizers';
import { extractLookaroundConditions } from './lookaroundExtractor';
import { INTENT_MATCHERS, IntentMatchContext, matchFindFallbackIntent } from './intentMatchers';

export {
  MacroIntentType,
  CaseTransformMode,
  LookaroundCondition,
  ParsedQuery,
  maskQuotedLiterals,
  unmaskQuotes,
  parseCaseTransformMode
};

/**
 * Parses a raw natural-language query into a structured `ParsedQuery` AST/IR:
 * 1. Masks quoted literals (`__Q0__`) and raw regex tokens (`__R0__`)
 * 2. Strips conversational prefixes/suffixes and extracts global flags, hints, and exclusions
 * 3. Extracts positive/negative lookahead and lookbehind clauses
 * 4. Runs the ordered `INTENT_MATCHERS` pipeline to classify intent and decompose target/replacement clauses
 */
export function parseQueryClauses(rawPrompt: string): ParsedQuery {
  const raw = rawPrompt.trim();
  const { masked: initialMasked, quotes } = maskQuotedLiterals(raw);

  const normalized = normalizeAndExtractGlobalHints(initialMasked, quotes);
  const { working: afterLookarounds, conditions } = extractLookaroundConditions(
    normalized.working,
    quotes
  );

  let working = afterLookarounds;
  let preferredAction: ExecutionAction | undefined;

  if (/^(?:copy|cp)\s+/i.test(working)) {
    preferredAction = 'copy-matches';
    working = working.replace(/^(?:copy|cp)\s+/i, 'find ');
  } else if (/^(?:select|sel|get)\b/i.test(working)) {
    preferredAction = 'select-matches';
  }

  const ctx: IntentMatchContext = {
    raw,
    working,
    conditions,
    exclusionClause: normalized.exclusionClause,
    locationHint: normalized.locationHint,
    nonGreedyHint: normalized.nonGreedyHint,
    flags: normalized.flags,
    preferredAction,
    quotes
  };

  for (const matcher of INTENT_MATCHERS) {
    const matched = matcher(ctx);
    if (matched) {
      return matched;
    }
  }

  return matchFindFallbackIntent(ctx);
}
