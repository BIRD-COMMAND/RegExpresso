import { LookaroundCondition } from '../types';
import { unmaskQuotes } from '../grammar/tokens';

function canExtractPositiveLookaround(
  prefix: string,
  prep: string,
  rhs: string,
  canonicalPrefix: string
): boolean {
  const isSpanPrefix =
    /\b(?:everything|all\s+text|text|anything|rest\s+of\s+(?:the\s+)?line)$/i.test(prefix);
  const hasReplaceSepInRhs =
    /^(?:replace|rep|sub|chg|change|convert|turn|transform|substitute|switch|swap)\b/i.test(
      prefix
    ) && /\s+(?:with|into|to|by)\s+|\s*(?:->|=>)\s*/i.test(rhs);

  return (prep.startsWith(canonicalPrefix) || !isSpanPrefix) && !hasReplaceSepInRhs;
}

/**
 * Extracts positive/negative lookbehind and lookahead condition clauses from the working query.
 */
export function extractLookaroundConditions(
  initialWorking: string,
  quotes: string[]
): { working: string; conditions: LookaroundCondition[] } {
  let working = initialWorking;
  const conditions: LookaroundCondition[] = [];

  const isPositionalInsertOrCaretQuery =
    /^(?:insert|ins|add|put|place|set|append|app|prepend|prep|ensure)\b/i.test(working);

  // 1. "but only if they have <X> directly in front of them" (Example #10)
  const onlyIfInFrontMatch = working.match(
    /,?\s*(?:but\s+)?(?:only\s+)?if\s+(?:they|it)\s+(?:have|has)\s+(.+?)\s+(?:directly\s+|immediately\s+)?(?:in\s+front\s+of\s+(?:them|it)|before\s+(?:them|it))$/i
  );
  if (onlyIfInFrontMatch) {
    conditions.push({
      type: 'preceded-by',
      targetPhrase: unmaskQuotes(onlyIfInFrontMatch[1].trim(), quotes)
    });
    working = working.slice(0, onlyIfInFrontMatch.index).trim();
  }

  // 2. Negative lookahead: "that isn't / is not / not (immediately) followed by / before / preceding / in front of <X>" (Example #11)
  const notFollowedMatch = working.match(
    /\s+(?:that\s+|which\s+)?(?:isn't|is\s+not|aren't|are\s+not|not)\s+(?:immediately\s+|directly\s+)?(?:followed\s+by|before|preceding|in\s+front\s+of)\s+(.+)$/i
  );
  if (notFollowedMatch) {
    conditions.push({
      type: 'not-followed-by',
      targetPhrase: unmaskQuotes(notFollowedMatch[1].trim(), quotes)
    });
    working = working.slice(0, notFollowedMatch.index).trim();
  }

  // 3. Positive lookahead: "(that is/are) (immediately) followed by / before / preceding / in front of <X>"
  if (!isPositionalInsertOrCaretQuery) {
    const followedMatch = working.match(
      /\s+(?:that\s+(?:is|are)\s+|which\s+(?:is|are)\s+)?(?:immediately\s+|directly\s+)?(followed\s+by|before|preceding|in\s+front\s+of)\s+(.+)$/i
    );
    if (followedMatch && followedMatch.index !== undefined) {
      const prefix = working.slice(0, followedMatch.index).trim();
      const prep = followedMatch[1].toLowerCase();
      const rhs = followedMatch[2].trim();
      if (canExtractPositiveLookaround(prefix, prep, rhs, 'followed')) {
        conditions.push({
          type: 'followed-by',
          targetPhrase: unmaskQuotes(rhs, quotes)
        });
        working = prefix;
      }
    }
  }

  // 4. Negative lookbehind: "(that isn't / is not / not) (immediately) preceded by / after / following / behind <X>"
  const notPrecededMatch = working.match(
    /\s+(?:that\s+|which\s+)?(?:isn't|is\s+not|aren't|are\s+not|not)\s+(?:immediately\s+|directly\s+)?(?:preceded\s+by|after|following|behind)\s+(.+)$/i
  );
  if (notPrecededMatch) {
    conditions.push({
      type: 'not-preceded-by',
      targetPhrase: unmaskQuotes(notPrecededMatch[1].trim(), quotes)
    });
    working = working.slice(0, notPrecededMatch.index).trim();
  }

  // 5. Positive lookbehind: "(that is/are) (immediately) preceded by / after / following / behind <X>"
  if (!isPositionalInsertOrCaretQuery) {
    const precededMatch = working.match(
      /\s+(?:that\s+(?:is|are)\s+|which\s+(?:is|are)\s+)?(?:immediately\s+|directly\s+)?(preceded\s+by|after|following|behind)\s+(.+)$/i
    );
    if (precededMatch && precededMatch.index !== undefined) {
      const prefix = working.slice(0, precededMatch.index).trim();
      const prep = precededMatch[1].toLowerCase();
      const rhs = precededMatch[2].trim();
      if (canExtractPositiveLookaround(prefix, prep, rhs, 'preceded')) {
        conditions.push({
          type: 'preceded-by',
          targetPhrase: unmaskQuotes(rhs, quotes)
        });
        working = prefix;
      }
    }
  }

  return { working, conditions };
}
