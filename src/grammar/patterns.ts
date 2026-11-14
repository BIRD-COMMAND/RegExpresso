/**
 * Shared natural-language grammar patterns, suffix extractors, and predicate matchers
 * reused across the parser and target resolvers.
 */

export const PER_LINE_SUFFIX_SOURCE =
  '(?:per|per[-\\s]lines?|(?:of|on|in|to|at|per|for)\\s+(?:every\\s+|each\\s+|all\\s+|a\\s+|the\\s+)?lines?)';

const PER_LINE_TARGET_SUFFIX_REGEX =
  /\s+(?:all|per|per[-\s]lines?|(?:of|on|in|per|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?)$/i;

/**
 * Strips trailing per-line scope modifiers ("per", "per line", "per-line", "on every line", "of each line")
 * if stripping them leaves a non-empty base phrase.
 */
export function extractPerLineSuffix(text: string): { cleaned: string; hasPerLine: boolean } {
  const match = text.match(PER_LINE_TARGET_SUFFIX_REGEX);
  if (match && match.index !== undefined) {
    const cleaned = text.slice(0, match.index).trim();
    if (cleaned.length > 0) {
      return { cleaned, hasPerLine: true };
    }
  }
  return { cleaned: text.trim(), hasPerLine: false };
}

const MISSING_CONDITION_SUFFIX_REGEX =
  /\s+(?:(?:that\s+|which\s+)?(?:doesn't|does\s+not|don't|do\s+not|didn't|did\s+not)\s+(?:already\s+)?(?:have|end\s+with|start\s+with|begin\s+with|contain|include)\b.*|(?:without|lacking|missing)\s+(?:already\s+)?(?:having\s+|ending\s+with\s+|starting\s+with\s+)?(?:one|it|them|that|\S+).*|if\s+(?:not\s+(?:already\s+)?(?:present|there|existing)|missing|needed|necessary|absent).*|(?:where|when)\s+(?:missing|needed|not\s+present|absent).*|unless\s+(?:already\s+)?(?:present|there).*)$/i;

/**
 * Extracts trailing conditional-existence clauses such as:
 * - "that doesn't have one"
 * - "without one"
 * - "if not already present" / "if missing" / "where needed"
 */
export function extractMissingCondition(text: string): { cleaned: string; hasMissingCheck: boolean } {
  const match = text.match(MISSING_CONDITION_SUFFIX_REGEX);
  if (match && match.index !== undefined) {
    const cleaned = text.slice(0, match.index).trim();
    if (cleaned.length > 0) {
      return { cleaned, hasMissingCheck: true };
    }
  }
  return { cleaned: text.trim(), hasMissingCheck: false };
}

export type AffixOperator = 'starts-with' | 'ends-with' | 'contains' | 'not-contains';

export interface AffixFilterMatch {
  operator: AffixOperator;
  argument: string;
}

const STARTS_WITH_PREDICATE_REGEX =
  /^(?:(?:that|which)\s+)?(?:starts?(?:ed|ing)?|beg[ai]ns?(?:ning)?)[\s_]+(?:with|in)\s+(.+)$/i;

const ENDS_WITH_PREDICATE_REGEX =
  /^(?:(?:that|which)\s+)?ends?(?:ed|ing)?[\s_]+(?:with|in)\s+(.+)$/i;

const NOT_CONTAINS_PREDICATE_REGEX =
  /^(?:without|lacking|omitting|(?:(?:that|which)\s+)?(?:do(?:es)?[\s_]+not|don'?t|doesn'?t)\s+(?:contains?|hav(?:e|ing))|not\s+(?:containing|having))\s+(.+)$/i;

const CONTAINS_PREDICATE_REGEX =
  /^(?:(?:that|which)\s+)?(?:contain(?:s|ed|ing)?|with|hav(?:e|ing)|has)\s+(.+)$/i;

/**
 * Unified predicate matcher for affix and containment filters on words, strings, blocks, and lines:
 * - "starting with X" / "that begins with X"
 * - "ending with X" / "that ends in X"
 * - "without X" / "not containing X" / "that doesn't have X"
 * - "containing X" / "with X" / "that has X"
 */
export function matchAffixFilterPredicate(predicate: string): AffixFilterMatch | null {
  const trimmed = predicate.trim();

  const startMatch = trimmed.match(STARTS_WITH_PREDICATE_REGEX);
  if (startMatch) {
    return { operator: 'starts-with', argument: startMatch[1].trim() };
  }

  const endMatch = trimmed.match(ENDS_WITH_PREDICATE_REGEX);
  if (endMatch) {
    return { operator: 'ends-with', argument: endMatch[1].trim() };
  }

  // Check negative containment before positive containment ("without" vs "with")
  const notContainMatch = trimmed.match(NOT_CONTAINS_PREDICATE_REGEX);
  if (notContainMatch) {
    return { operator: 'not-contains', argument: notContainMatch[1].trim() };
  }

  const containMatch = trimmed.match(CONTAINS_PREDICATE_REGEX);
  if (containMatch) {
    return { operator: 'contains', argument: containMatch[1].trim() };
  }

  return null;
}
