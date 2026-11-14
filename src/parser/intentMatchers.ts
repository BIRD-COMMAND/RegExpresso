import { ExecutionAction, LocationHint, LookaroundCondition, ParsedQuery } from '../types';
import { extractMissingCondition } from '../grammar/patterns';
import { parseCaseTransformMode, splitTargetAndReplacement } from './normalizers';

export interface IntentMatchContext {
  raw: string;
  working: string;
  conditions: LookaroundCondition[];
  exclusionClause?: string;
  locationHint?: LocationHint;
  nonGreedyHint: boolean;
  flags: {
    caseInsensitive: boolean;
    multiline: boolean;
  };
  preferredAction?: ExecutionAction;
  quotes: string[];
}

export type IntentMatcherFn = (ctx: IntentMatchContext) => ParsedQuery | null;

function createParsedQuery(
  ctx: IntentMatchContext,
  fields: Pick<ParsedQuery, 'intent' | 'targetClause'> &
    Partial<
      Pick<
        ParsedQuery,
        | 'replacementClause'
        | 'insertPosition'
        | 'missingCheck'
        | 'caseTargetMode'
        | 'flags'
        | 'preferredAction'
      >
    >
): ParsedQuery {
  return {
    raw: ctx.raw,
    intent: fields.intent,
    targetClause: fields.targetClause,
    replacementClause: fields.replacementClause,
    insertPosition: fields.insertPosition,
    missingCheck: fields.missingCheck,
    caseTargetMode: fields.caseTargetMode,
    conditions: ctx.conditions,
    exclusionClause: ctx.exclusionClause,
    locationHint: ctx.locationHint,
    nonGreedyHint: ctx.nonGreedyHint,
    flags: fields.flags ?? ctx.flags,
    preferredAction: fields.preferredAction ?? ctx.preferredAction,
    quotes: ctx.quotes
  };
}

/**
 * 1. Explicit Multi-Cursor Placement ("place carets at the start/end of <X>")
 */
export function matchCaretPlacementIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const caretStartMatch = ctx.working.match(
    /^(?:place|put|add|set)\s+(?:a\s+|an\s+|individual\s+|multi-?)?(?:carets?|cursors?)\s+(?:at\s+(?:the\s+)?(?:start|beginning)\s+of|before|in\s+front\s+of)\s+(.+)$/i
  );
  if (caretStartMatch) {
    return createParsedQuery(ctx, {
      intent: 'FIND',
      targetClause: caretStartMatch[1].trim(),
      preferredAction: 'carets-at-start'
    });
  }

  const caretEndMatch = ctx.working.match(
    /^(?:place|put|add|set)\s+(?:a\s+|an\s+|individual\s+|multi-?)?(?:carets?|cursors?)\s+(?:at\s+(?:the\s+)?end\s+of|after|behind)\s+(.+)$/i
  );
  if (caretEndMatch) {
    return createParsedQuery(ctx, {
      intent: 'FIND',
      targetClause: caretEndMatch[1].trim(),
      preferredAction: 'carets-at-end'
    });
  }

  return null;
}

/**
 * 2. Compound "Find <X> and delete/replace/wrap <Y>"
 */
export function matchCompoundFindAndActionIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const findAndDeleteMatch = ctx.working.match(
    /^(?:find|fnd|match|select|sel|locate|get|grab)(?:(?:\s*\/\s*|\s+or\s+)(?:find|fnd|match|select|sel|locate|get|grab))?\s+(.+?)\s+and\s+(?:delete|del|rm|remove|strip|erase)(?:\s+(.+))?$/i
  );
  if (findAndDeleteMatch) {
    const targetPart = findAndDeleteMatch[1].trim();
    const deleteTarget = (findAndDeleteMatch[2] ?? 'it').trim();
    if (
      /^(?:the\s+second\s+one|the\s+duplicate|the\s+repeated\s+one|it|them|all\s+of\s+them|matches?)$/i.test(
        deleteTarget
      )
    ) {
      return createParsedQuery(ctx, {
        intent: 'DELETE',
        targetClause: targetPart,
        replacementClause: '',
        preferredAction: 'replace-all'
      });
    }
  }

  const findAndReplaceMatch = ctx.working.match(
    /^(?:find|fnd|match|select|sel|locate|get|grab)(?:(?:\s*\/\s*|\s+or\s+)(?:find|fnd|match|select|sel|locate|get|grab))?\s+(.+?)\s+and\s+(?:replace|rep|sub|chg|change|substitute|turn)\s+(?:it\s+|them\s+|all\s+of\s+them\s+|matches?\s+)?(?:with|to|into|by)\s+(.+)$/i
  );
  if (findAndReplaceMatch) {
    return createParsedQuery(ctx, {
      intent: 'REPLACE',
      targetClause: findAndReplaceMatch[1].trim(),
      replacementClause: findAndReplaceMatch[2].trim(),
      preferredAction: 'replace-all'
    });
  }

  const findAndWrapMatch = ctx.working.match(
    /^(?:find|fnd|match|select|sel|locate|get|grab)(?:(?:\s*\/\s*|\s+or\s+)(?:find|fnd|match|select|sel|locate|get|grab))?\s+(.+?)\s+and\s+(?:wrap|surround|enclose)\s+(?:it\s+|them\s+)?(?:in|with|inside|within)\s+(.+)$/i
  );
  if (findAndWrapMatch) {
    return createParsedQuery(ctx, {
      intent: 'WRAP',
      targetClause: findAndWrapMatch[1].trim(),
      replacementClause: findAndWrapMatch[2].trim(),
      preferredAction: 'replace-all'
    });
  }

  return null;
}

/**
 * 3. EXTRACT_CAPTURE Intent ("Extract the domain part of an email address into named variables")
 */
export function matchExtractCaptureIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const extractNamedMatch = ctx.working.match(
    /^(?:extract|capture|parse|split)\s+(.+?)\s+into\s+(?:named\s+)?(?:variables?|groups?|captures?)$/i
  );
  if (extractNamedMatch) {
    return createParsedQuery(ctx, {
      intent: 'EXTRACT_CAPTURE',
      targetClause: extractNamedMatch[1].trim()
    });
  }
  return null;
}

/**
 * 4. WRAP Intent ("Put <wrapper> around <target>" / "Wrap <target> in <wrapper>")
 */
export function matchWrapIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const putAroundMatch = ctx.working.match(/^(?:put|add|place)\s+(.+?)\s+around\s+(.+)$/i);
  if (putAroundMatch) {
    return createParsedQuery(ctx, {
      intent: 'WRAP',
      targetClause: putAroundMatch[2].trim(),
      replacementClause: putAroundMatch[1].trim(),
      preferredAction: 'replace-all'
    });
  }

  const wrapInMatch = ctx.working.match(
    /^(?:wrap|surround|enclose)\s+(.+?)\s+(?:in|with|inside|within|into|using)\s+(.+?)(?:\s+without\s+losing.*)?$/i
  );
  if (wrapInMatch) {
    return createParsedQuery(ctx, {
      intent: 'WRAP',
      targetClause: wrapInMatch[1].trim(),
      replacementClause: wrapInMatch[2].trim(),
      preferredAction: 'replace-all'
    });
  }

  return null;
}

/**
 * 5. ENSURE Intent ("ensure trailing ;", "ensure leading //", "ensure every line ends with ;", "ensure space after commas")
 */
export function matchEnsureIntent(ctx: IntentMatchContext): ParsedQuery | null {
  if (!/^ensure\s+/i.test(ctx.working)) {
    return null;
  }

  const ensureBody = extractMissingCondition(
    ctx.working.replace(/^ensure\s+(?:that\s+)?/i, '').trim()
  ).cleaned;

  const ensureTrailingMatch = ensureBody.match(
    /^(?:a\s+|an\s+|the\s+|all\s+|every\s+|each\s+)?trailing\s+(.+?)(?:\s+(?:per|per[-\s]lines?|(?:on|in|of|to|at|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i
  );
  if (ensureTrailingMatch) {
    return createParsedQuery(ctx, {
      intent: 'ENSURE',
      targetClause: 'every line',
      replacementClause: ensureTrailingMatch[1].trim(),
      insertPosition: 'end-of-line',
      missingCheck: true,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const ensureLeadingMatch = ensureBody.match(
    /^(?:a\s+|an\s+|the\s+|all\s+|every\s+|each\s+)?leading\s+(.+?)(?:\s+(?:per|per[-\s]lines?|(?:on|in|of|to|at|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i
  );
  if (ensureLeadingMatch) {
    return createParsedQuery(ctx, {
      intent: 'ENSURE',
      targetClause: 'every line',
      replacementClause: ensureLeadingMatch[1].trim(),
      insertPosition: 'start-of-line',
      missingCheck: true,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const ensureLineVerbMatch = ensureBody.match(
    /^(?:every\s+|each\s+|all\s+)?lines?\s+(ends?|starts?|begins?)\s+(?:with|in)\s+(.+)$/i
  );
  if (ensureLineVerbMatch) {
    const isEnd = /^end/i.test(ensureLineVerbMatch[1]);
    return createParsedQuery(ctx, {
      intent: 'ENSURE',
      targetClause: 'every line',
      replacementClause: ensureLineVerbMatch[2].trim(),
      insertPosition: isEnd ? 'end-of-line' : 'start-of-line',
      missingCheck: true,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const ensureAtEndMatch = ensureBody.match(
    /^(.+?)\s+(?:to|at|on|in|onto)\s+(?:the\s+|each\s+|every\s+|all\s+)?(?:(?:end|ending)s?(?:\s+of\s+.+)?|line\s+(?:end|ending)s?)(?:\s+(?:per|per[-\s]lines?))?$/i
  );
  if (ensureAtEndMatch) {
    return createParsedQuery(ctx, {
      intent: 'ENSURE',
      targetClause: 'every line',
      replacementClause: ensureAtEndMatch[1].trim(),
      insertPosition: 'end-of-line',
      missingCheck: true,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const ensureAtStartMatch = ensureBody.match(
    /^(.+?)\s+(?:to|at|on|in|onto)\s+(?:the\s+|each\s+|every\s+|all\s+)?(?:(?:start|beginning|front)s?(?:\s+of\s+.+)?|line\s+(?:start|beginning|front)s?)(?:\s+(?:per|per[-\s]lines?))?$/i
  );
  if (ensureAtStartMatch) {
    return createParsedQuery(ctx, {
      intent: 'ENSURE',
      targetClause: 'every line',
      replacementClause: ensureAtStartMatch[1].trim(),
      insertPosition: 'start-of-line',
      missingCheck: true,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const ensureRelMatch = ensureBody.match(
    /^(.+?)\s+(before|in\s+front\s+of|preceding|after|behind|following)\s+(.+)$/i
  );
  if (ensureRelMatch) {
    const isBefore = /^(?:before|in\s+front\s+of|preceding)$/i.test(ensureRelMatch[2].trim());
    return createParsedQuery(ctx, {
      intent: 'ENSURE',
      targetClause: ensureRelMatch[3].trim(),
      replacementClause: ensureRelMatch[1].trim(),
      insertPosition: isBefore ? 'before-target' : 'after-target',
      missingCheck: true,
      preferredAction: 'replace-all'
    });
  }

  const ensureBarePerLine = ensureBody.match(
    /^(.+?)(?:\s+(?:per|per[-\s]lines?|(?:on|in|of|to|at|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i
  );
  if (ensureBarePerLine) {
    return createParsedQuery(ctx, {
      intent: 'ENSURE',
      targetClause: 'every line',
      replacementClause: ensureBarePerLine[1].trim(),
      insertPosition: 'end-of-line',
      missingCheck: true,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  return null;
}

/**
 * 6. INSERT_ADD Intent (including conditional insertion promoted to ENSURE)
 */
export function matchInsertAddIntent(ctx: IntentMatchContext): ParsedQuery | null {
  if (!/^(?:add|append|app|prepend|prep|put|insert|ins)\b/i.test(ctx.working)) {
    return null;
  }

  const { cleaned: insertWorking, hasMissingCheck: insertMissingCheck } = extractMissingCondition(
    ctx.working
  );

  const addTrailingShorthand = insertWorking.match(
    /^(?:add|append|app|put|insert|ins)\s+(?:a\s+|an\s+|the\s+)?trailing\s+(.+?)(?:\s+(?:per|per[-\s]lines?|(?:on|in|of|to|at|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i
  );
  if (addTrailingShorthand) {
    return createParsedQuery(ctx, {
      intent: insertMissingCheck ? 'ENSURE' : 'INSERT_ADD',
      targetClause: 'every line',
      replacementClause: addTrailingShorthand[1].trim(),
      insertPosition: 'end-of-line',
      missingCheck: insertMissingCheck,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const addLeadingShorthand = insertWorking.match(
    /^(?:add|prepend|prep|put|insert|ins)\s+(?:a\s+|an\s+|the\s+)?leading\s+(.+?)(?:\s+(?:per|per[-\s]lines?|(?:on|in|of|to|at|for)\s+(?:every\s+|each\s+|all\s+|a\s+|the\s+)?lines?))?$/i
  );
  if (addLeadingShorthand) {
    return createParsedQuery(ctx, {
      intent: insertMissingCheck ? 'ENSURE' : 'INSERT_ADD',
      targetClause: 'every line',
      replacementClause: addLeadingShorthand[1].trim(),
      insertPosition: 'start-of-line',
      missingCheck: insertMissingCheck,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const addEndMatch = insertWorking.match(
    /^(?:add|append|app|put|insert|ins)\s+(.+?)\s+(?:to|at|on|in|onto)\s+(?:(?:the\s+)?(?:end|ending)s?(?:\s+(?:of\s+(.+)|per|per[-\s]lines?))?|(?:each\s+|every\s+|all\s+|the\s+|a\s+)?line\s+(?:end|ending)s?(?:\s+(?:per|per[-\s]lines?))?)$/i
  );
  if (addEndMatch) {
    const extracted = extractMissingCondition((addEndMatch[2] ?? 'every line').trim());
    const missingCheck = insertMissingCheck || extracted.hasMissingCheck;
    return createParsedQuery(ctx, {
      intent: missingCheck ? 'ENSURE' : 'INSERT_ADD',
      targetClause: extracted.cleaned,
      replacementClause: addEndMatch[1].trim(),
      insertPosition: 'end-of-line',
      missingCheck,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const addStartMatch = insertWorking.match(
    /^(?:add|prepend|prep|put|insert|ins)\s+(.+?)\s+(?:to|at|on|in|onto)\s+(?:(?:the\s+)?(?:start|beginning|front)s?(?:\s+(?:of\s+(.+)|per|per[-\s]lines?))?|(?:each\s+|every\s+|all\s+|the\s+|a\s+)?line\s+(?:start|beginning|front)s?(?:\s+(?:per|per[-\s]lines?))?)$/i
  );
  if (addStartMatch) {
    const extracted = extractMissingCondition((addStartMatch[2] ?? 'every line').trim());
    const missingCheck = insertMissingCheck || extracted.hasMissingCheck;
    return createParsedQuery(ctx, {
      intent: missingCheck ? 'ENSURE' : 'INSERT_ADD',
      targetClause: extracted.cleaned,
      replacementClause: addStartMatch[1].trim(),
      insertPosition: 'start-of-line',
      missingCheck,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const prependToMatch = insertWorking.match(
    /^(?:prepend|prep)\s+(.+?)\s+(?:to\s+(.+)|per|per[-\s]lines?)$/i
  );
  if (prependToMatch) {
    return createParsedQuery(ctx, {
      intent: insertMissingCheck ? 'ENSURE' : 'INSERT_ADD',
      targetClause: (prependToMatch[2] ?? 'every line').trim(),
      replacementClause: prependToMatch[1].trim(),
      insertPosition: 'start-of-line',
      missingCheck: insertMissingCheck,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const appendToMatch = insertWorking.match(
    /^(?:append|app)\s+(.+?)\s+(?:to\s+(.+)|per|per[-\s]lines?)$/i
  );
  if (appendToMatch) {
    return createParsedQuery(ctx, {
      intent: insertMissingCheck ? 'ENSURE' : 'INSERT_ADD',
      targetClause: (appendToMatch[2] ?? 'every line').trim(),
      replacementClause: appendToMatch[1].trim(),
      insertPosition: 'end-of-line',
      missingCheck: insertMissingCheck,
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }

  const insertRelMatch = insertWorking.match(
    /^(?:insert|ins|add|put)\s+(.+?)\s+(before|in\s+front\s+of|preceding|after|behind|following)\s+(.+)$/i
  );
  if (insertRelMatch) {
    const isBefore = /^(?:before|in\s+front\s+of|preceding)$/i.test(insertRelMatch[2].trim());
    return createParsedQuery(ctx, {
      intent: insertMissingCheck ? 'ENSURE' : 'INSERT_ADD',
      targetClause: insertRelMatch[3].trim(),
      replacementClause: insertRelMatch[1].trim(),
      insertPosition: isBefore ? 'before-target' : 'after-target',
      missingCheck: insertMissingCheck,
      preferredAction: 'replace-all'
    });
  }

  return null;
}

/**
 * 7. SWAP_REORDER Intent ("Swap first and last names in this comma-separated list")
 */
export function matchSwapReorderIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const swapMatch = ctx.working.match(/^(?:swap|reverse|switch|flip|exchange)\s+(.+)$/i);
  if (swapMatch && !/\s+with\s+/i.test(swapMatch[1])) {
    return createParsedQuery(ctx, {
      intent: 'SWAP_REORDER',
      targetClause: swapMatch[1].trim(),
      preferredAction: 'replace-all'
    });
  }
  return null;
}

/**
 * 8. CASE_TRANSFORM Intent ("Capitalize <target>", "Uppercase <target>", "Make <target> <CaseMode>")
 */
export function matchCaseTransformIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const capitalizeMatch = ctx.working.match(/^(?:capitalize|cap|title[- ]?case)\s+(.+)$/i);
  if (capitalizeMatch) {
    return createParsedQuery(ctx, {
      intent: 'CASE_TRANSFORM',
      targetClause: capitalizeMatch[1].trim(),
      caseTargetMode: 'capitalize-first',
      preferredAction: 'replace-all'
    });
  }

  const upperVerbMatch = ctx.working.match(/^(?:uppercase|upper[- ]case|upper)\s+(.+)$/i);
  if (upperVerbMatch) {
    return createParsedQuery(ctx, {
      intent: 'CASE_TRANSFORM',
      targetClause: upperVerbMatch[1].trim(),
      caseTargetMode: 'upper',
      preferredAction: 'replace-all'
    });
  }

  const lowerVerbMatch = ctx.working.match(
    /^(?:lowercase|lower[- ]case|lower|uncapitalize|uncap)\s+(.+)$/i
  );
  if (lowerVerbMatch) {
    return createParsedQuery(ctx, {
      intent: 'CASE_TRANSFORM',
      targetClause: lowerVerbMatch[1].trim(),
      caseTargetMode: 'lower',
      preferredAction: 'replace-all'
    });
  }

  const makeCaseMatch = ctx.working.match(
    /^make\s+(.+?)\s+(title\s*case|uppercase|upper\s+case|all\s+caps|caps|lowercase|lower\s+case|camel\s*case|pascal\s*case|snake[_\s]case|screaming[_\s]snake[_\s]case|kebab[-\s]case|capitalized)$/i
  );
  if (makeCaseMatch) {
    const mode = parseCaseTransformMode(makeCaseMatch[2], ctx.quotes);
    if (mode) {
      return createParsedQuery(ctx, {
        intent: 'CASE_TRANSFORM',
        targetClause: makeCaseMatch[1].trim(),
        caseTargetMode: mode,
        preferredAction: 'replace-all'
      });
    }
  }

  return null;
}

/**
 * 9. REPLACE Intent ("replace/rep/sub/chg/change/convert <X> with/to/into <Y>", "substitute <Y> for <X>")
 */
export function matchReplaceIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const substituteForMatch = ctx.working.match(/^(?:substitute|sub)\s+(.+?)\s+for\s+(.+)$/i);
  if (substituteForMatch && !/\s+with\s+/i.test(ctx.working)) {
    return createParsedQuery(ctx, {
      intent: 'REPLACE',
      targetClause: substituteForMatch[2].trim(),
      replacementClause: substituteForMatch[1].trim(),
      preferredAction: 'replace-all'
    });
  }

  const replaceVerbMatch = ctx.working.match(
    /^(?:replace|rep|sub|chg|change|convert|turn|transform|substitute|translate|switch|swap)\s+(.+)$/i
  );
  if (replaceVerbMatch) {
    const split = splitTargetAndReplacement(replaceVerbMatch[1].trim());
    if (split) {
      const maybeCaseMode = parseCaseTransformMode(split.replacement, ctx.quotes);
      if (maybeCaseMode) {
        return createParsedQuery(ctx, {
          intent: 'CASE_TRANSFORM',
          targetClause: split.target,
          caseTargetMode: maybeCaseMode,
          preferredAction: 'replace-all'
        });
      }

      return createParsedQuery(ctx, {
        intent: 'REPLACE',
        targetClause: split.target,
        replacementClause: split.replacement,
        preferredAction: 'replace-all'
      });
    }
  }

  return null;
}

/**
 * 10. TRIM Intent ("trim", "trim blanks", "trim leading <X>", "trim trailing <Y>", "trim <X>")
 */
export function matchTrimIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const trimVerbMatch = ctx.working.match(/^trim(?:\s+(.+))?$/i);
  if (trimVerbMatch) {
    const rest = trimVerbMatch[1]?.trim() ?? '';
    return createParsedQuery(ctx, {
      intent: 'TRIM',
      targetClause: rest,
      replacementClause: '',
      flags: { ...ctx.flags, multiline: true },
      preferredAction: 'replace-all'
    });
  }
  return null;
}

/**
 * 11. DELETE Intent ("delete/del/rm/remove/strip/erase/clear <X>")
 */
export function matchDeleteIntent(ctx: IntentMatchContext): ParsedQuery | null {
  const deleteVerbMatch = ctx.working.match(
    /^(?:delete|del|rm|remove|strip(?:\s+out)?|erase|clear|clr|drop|omit|eliminate|wipe|scrub|get\s+rid\s+of|collapse)\s+(.+)$/i
  );
  if (deleteVerbMatch) {
    return createParsedQuery(ctx, {
      intent: 'DELETE',
      targetClause: deleteVerbMatch[1].trim(),
      replacementClause: '',
      preferredAction: 'replace-all'
    });
  }
  return null;
}

/**
 * 12. FIND Intent (explicit find/match/select/sel/get verb or bare noun phrase fallback)
 */
export function matchFindFallbackIntent(ctx: IntentMatchContext): ParsedQuery {
  const findVerbMatch = ctx.working.match(
    /^(?:find|fnd|match|select|sel|locate|search\s+for|search|highlight|grab|get|give\s+me|show\s+me|show|look\s+for|pick|identify|capture|extract)(?:(?:\s*\/\s*|\s+or\s+)(?:find|fnd|match|select|sel|locate|get|grab))?\s+(.+)$/i
  );
  const targetClause = findVerbMatch ? findVerbMatch[1].trim() : ctx.working;

  return createParsedQuery(ctx, {
    intent: 'FIND',
    targetClause
  });
}

/**
 * Ordered declarative pipeline of intent matchers evaluated before the FIND fallback.
 */
export const INTENT_MATCHERS: IntentMatcherFn[] = [
  matchCaretPlacementIntent,
  matchCompoundFindAndActionIntent,
  matchExtractCaptureIntent,
  matchWrapIntent,
  matchEnsureIntent,
  matchInsertAddIntent,
  matchSwapReorderIntent,
  matchCaseTransformIntent,
  matchReplaceIntent,
  matchTrimIntent,
  matchDeleteIntent
];
