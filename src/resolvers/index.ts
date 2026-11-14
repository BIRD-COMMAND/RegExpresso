import { ResolvedTarget, TargetResolutionContext } from '../types';
import { extractPerLineSuffix } from '../grammar/patterns';
import {
  escapeRegexLiteral,
  isAtomicRegexUnit,
  unmaskQuotes
} from '../grammar/tokens';
import { findLexiconEntry, LEXICON_ENTRIES } from '../lexicon';
import { extractQuantifier } from './quantifierExtractor';
import { finalizeLineAnchors, stripDeterminersAndClassifiers } from './determinerStripper';
import {
  tryResolveMaskedToken,
  tryResolveUnquotedDirectRegex
} from './directRegexResolver';
import { tryResolveInsideOrBetween } from './insideDelimiterResolver';
import {
  tryResolveCharacterRange,
  tryResolveNegatedCharClass
} from './charClassResolver';
import { tryResolveAffixOrLineFilter } from './affixFilterResolver';
import { tryResolveBlock } from './blockResolver';
import { tryResolveAlternationOrVariant } from './alternationResolver';
import {
  resolveDelimiterOrLiteral,
  resolveRawLiteralOrCharClass
} from './primitiveResolver';
import { resolveReplacementClause } from './replacementResolver';

export {
  ResolvedTarget,
  TargetResolutionContext,
  extractPerLineSuffix,
  findLexiconEntry,
  resolveDelimiterOrLiteral,
  resolveRawLiteralOrCharClass,
  resolveReplacementClause
};

export interface TargetResolverPipelineContext {
  rawTargetClause: string;
  cleaned: string;
  quotes: string[];
  quantifier: string;
  quantFeatures: string[];
  isSingleUnitRequest: boolean;
  effectiveWholeWord: boolean;
  startOfLineHint: boolean;
  endOfLineHint: boolean;
  context?: TargetResolutionContext;
}

export type TargetResolverStageFn = (
  ctx: TargetResolverPipelineContext
) => ResolvedTarget | null;

const resolveMaskedTokenStage: TargetResolverStageFn = (ctx) => {
  const maskedResolved = tryResolveMaskedToken(
    ctx.cleaned,
    ctx.quotes,
    ctx.quantifier,
    ctx.quantFeatures,
    ctx.effectiveWholeWord,
    ctx.startOfLineHint,
    ctx.endOfLineHint
  );
  if (maskedResolved && ctx.context?.locationHint === 'middle-of-word') {
    maskedResolved.pattern = `\\B${maskedResolved.pattern}\\B`;
    maskedResolved.features.unshift('Non-word boundary anchor (\\B)');
  }
  return maskedResolved;
};

const resolveInsideDelimiterStage: TargetResolverStageFn = (ctx) =>
  tryResolveInsideOrBetween(ctx.cleaned, ctx.quotes);

const resolveNegatedCharClassStage: TargetResolverStageFn = (ctx) => {
  const negatedResolved = tryResolveNegatedCharClass(
    ctx.cleaned,
    ctx.quotes,
    ctx.quantifier
  );
  if (negatedResolved && ctx.context?.locationHint === 'middle-of-word') {
    negatedResolved.pattern = `\\B${negatedResolved.pattern}\\B`;
    negatedResolved.features.unshift('Non-word boundary anchor (\\B)');
  }
  return negatedResolved;
};

const resolveCharacterRangeStage: TargetResolverStageFn = (ctx) =>
  tryResolveCharacterRange(ctx.cleaned, ctx.quantifier);

const resolveAffixOrLineFilterStage: TargetResolverStageFn = (ctx) =>
  tryResolveAffixOrLineFilter(ctx.cleaned, ctx.quotes);

const resolveDelimitedBlockStage: TargetResolverStageFn = (ctx) => {
  const blockResolved = tryResolveBlock(ctx.cleaned, ctx.quotes);
  if (!blockResolved) return null;

  const features = [...blockResolved.features, ...ctx.quantFeatures];
  let pat = ctx.quantifier
    ? `(?:${blockResolved.pattern})${ctx.quantifier}`
    : blockResolved.pattern;
  pat = finalizeLineAnchors(pat, ctx.startOfLineHint, ctx.endOfLineHint, features);

  return {
    ...blockResolved,
    pattern: pat,
    features,
    needsMultiline:
      blockResolved.needsMultiline || ctx.startOfLineHint || ctx.endOfLineHint
  };
};

const resolveAlternationOrVariantStage: TargetResolverStageFn = (ctx) =>
  tryResolveAlternationOrVariant(
    ctx.cleaned,
    ctx.quotes,
    ctx.effectiveWholeWord,
    ctx.quantifier
  );

const resolveLexiconOrDirectRegexStage: TargetResolverStageFn = (ctx) => {
  let lexiconEntry = findLexiconEntry(ctx.cleaned);

  if (!lexiconEntry) {
    const directRegexResolved = tryResolveUnquotedDirectRegex(
      ctx.cleaned,
      ctx.quotes,
      ctx.quantifier,
      ctx.quantFeatures,
      ctx.startOfLineHint,
      ctx.endOfLineHint,
      ctx.context?.locationHint
    );
    if (directRegexResolved) {
      return directRegexResolved;
    }

    for (const entry of LEXICON_ENTRIES) {
      if (entry.keywordMatcher && entry.keywordMatcher.test(ctx.cleaned)) {
        lexiconEntry = entry;
        break;
      }
    }
  }

  if (!lexiconEntry) {
    return null;
  }

  const features = [...lexiconEntry.features, ...ctx.quantFeatures];
  let pat: string;

  if (
    lexiconEntry.id === 'numbers' &&
    ctx.context?.hasCurrencyLookbehind &&
    !ctx.quantifier
  ) {
    pat = '\\d+(?:\\.\\d{2})?';
    features.push('Non-capturing decimal group ((?:\\.\\d{2})?)');
  } else if (ctx.quantifier) {
    const unit = lexiconEntry.singleUnitPattern;
    pat = isAtomicRegexUnit(unit) ? `${unit}${ctx.quantifier}` : `(?:${unit})${ctx.quantifier}`;
  } else if (ctx.isSingleUnitRequest) {
    pat = lexiconEntry.singleUnitPattern;
  } else {
    pat = lexiconEntry.findPattern;
  }

  if (
    ctx.effectiveWholeWord &&
    lexiconEntry.supportsWordBoundary &&
    !pat.startsWith('\\b')
  ) {
    pat = `\\b${pat}\\b`;
    if (!features.some((f) => f.includes('\\b'))) {
      features.push('Word boundary anchor (\\b)');
    }
  }

  if (ctx.context?.locationHint === 'middle-of-word' && !pat.startsWith('\\B')) {
    pat = `\\B${pat}\\B`;
    features.unshift('Non-word boundary anchor (\\B)');
  }

  pat = finalizeLineAnchors(pat, ctx.startOfLineHint, ctx.endOfLineHint, features);

  return {
    pattern: pat,
    label: lexiconEntry.label,
    features,
    needsMultiline: Boolean(
      lexiconEntry.needsMultiline || ctx.startOfLineHint || ctx.endOfLineHint
    ),
    needsCaseInsensitive: lexiconEntry.id === 'duplicate-words',
    defaultReplace: lexiconEntry.replaceLiteral,
    lexiconId: lexiconEntry.id,
    isWholeLine:
      lexiconEntry.id === 'non-empty-lines' || lexiconEntry.id === 'blank-lines',
    hasCaptureGroups: /\([^?]/.test(pat)
  };
};

function resolveUnquotedLiteralFallback(ctx: TargetResolverPipelineContext): ResolvedTarget {
  const unmaskedLiteral = unmaskQuotes(ctx.cleaned, ctx.quotes).trim();
  const escapedLiteral = escapeRegexLiteral(unmaskedLiteral);
  const features = [...ctx.quantFeatures];

  let finalPattern = ctx.quantifier
    ? escapedLiteral.length === 1
      ? `${escapedLiteral}${ctx.quantifier}`
      : `(?:${escapedLiteral})${ctx.quantifier}`
    : escapedLiteral;

  if (ctx.effectiveWholeWord && /^\w+$/.test(unmaskedLiteral)) {
    finalPattern = `\\b${finalPattern}\\b`;
    features.push('Word boundary anchor (\\b)');
  } else {
    features.push(`Literal pattern (${finalPattern})`);
  }

  if (ctx.context?.locationHint === 'middle-of-word' && !finalPattern.startsWith('\\B')) {
    finalPattern = `\\B${finalPattern}\\B`;
    features.unshift('Non-word boundary anchor (\\B)');
  }

  finalPattern = finalizeLineAnchors(
    finalPattern,
    ctx.startOfLineHint,
    ctx.endOfLineHint,
    features
  );

  return {
    pattern: finalPattern,
    label: `'${unmaskedLiteral}'`,
    features,
    needsMultiline: ctx.startOfLineHint || ctx.endOfLineHint,
    needsCaseInsensitive: false
  };
}

/**
 * Ordered declarative pipeline of target resolution stages.
 */
export const TARGET_RESOLVER_PIPELINE: TargetResolverStageFn[] = [
  resolveMaskedTokenStage,
  resolveInsideDelimiterStage,
  resolveNegatedCharClassStage,
  resolveCharacterRangeStage,
  resolveAffixOrLineFilterStage,
  resolveDelimitedBlockStage,
  resolveAlternationOrVariantStage,
  resolveLexiconOrDirectRegexStage
];

/**
 * Main target resolver: resolves any natural language target clause into a structured `ResolvedTarget`.
 */
export function resolveTargetClause(
  rawTargetClause: string,
  quotes: string[],
  context?: TargetResolutionContext
): ResolvedTarget {
  const quantExtract = extractQuantifier(rawTargetClause);
  const quantifier = quantExtract.quantifier;
  const quantFeatures = quantExtract.feature ? [quantExtract.feature] : [];

  if (quantExtract.remainingText === 'letters_as_word') {
    return {
      pattern: `\\b[a-zA-Z]${quantifier}\\b`,
      label: `${quantifier}-letter words`,
      features: ['Word boundary (\\b)', 'Character range ([a-zA-Z])', ...quantFeatures],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }
  if (quantExtract.remainingText === 'digits_as_word') {
    return {
      pattern: `\\b\\d${quantifier}\\b`,
      label: `${quantifier}-digit numbers`,
      features: ['Word boundary (\\b)', 'Digit shorthand (\\d)', ...quantFeatures],
      needsMultiline: false,
      needsCaseInsensitive: false
    };
  }

  const { cleaned, wholeWordHint, startOfLineHint, endOfLineHint } =
    stripDeterminersAndClassifiers(quantExtract.remainingText);

  const pipelineCtx: TargetResolverPipelineContext = {
    rawTargetClause,
    cleaned,
    quotes,
    quantifier,
    quantFeatures,
    isSingleUnitRequest: quantExtract.isSingleUnitRequest,
    effectiveWholeWord: wholeWordHint || context?.locationHint === 'whole-word',
    startOfLineHint,
    endOfLineHint,
    context
  };

  for (const stage of TARGET_RESOLVER_PIPELINE) {
    const resolved = stage(pipelineCtx);
    if (resolved) {
      return resolved;
    }
  }

  return resolveUnquotedLiteralFallback(pipelineCtx);
}
