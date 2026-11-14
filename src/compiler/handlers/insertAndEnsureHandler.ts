import { CompiledRegexResult, ParsedQuery } from '../../types';
import { escapeRegexLiteral } from '../../grammar/tokens';
import { resolveReplacementClause, resolveTargetClause } from '../../resolvers';
import { buildFlagsString } from '../lookaroundApplier';

export function handleEnsureIntent(parsed: ParsedQuery): CompiledRegexResult {
  const ins = resolveReplacementClause(parsed.replacementClause ?? '', parsed.quotes);
  const charToInsert = ins.replace;
  const escapedChar = escapeRegexLiteral(charToInsert);

  if (parsed.insertPosition === 'end-of-line') {
    return {
      isPossible: true,
      mode: 'replace',
      summary: `Ensure every non-empty line ends with '${charToInsert}', preserving trailing horizontal whitespace.`,
      steps: [
        {
          description: `Match non-empty lines not ending in '${charToInsert}' and append '${charToInsert}'`,
          find: `^([^\\r\\n]*?\\S)(?<!${escapedChar})([ \\t]*)$`,
          replace: `$1${charToInsert}$2`,
          flags: 'gm'
        }
      ],
      featuresUsed: [
        'Line start/end anchors (^...$)',
        `Negative lookbehind ((?<!${escapedChar}))`,
        'Horizontal whitespace preservation ([ \\t]*)'
      ],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  if (parsed.insertPosition === 'start-of-line') {
    const startsWithSpace = /^\s/.test(charToInsert);
    const findPat = startsWithSpace
      ? `^(?!${escapedChar})(?=[ \\t]*\\S)([^\\r\\n]+)$`
      : `^([ \\t]*)(?!${escapedChar})(\\S[^\\r\\n]*)$`;
    const replacePat = startsWithSpace ? `${charToInsert}$1` : `$1${charToInsert}$2`;

    return {
      isPossible: true,
      mode: 'replace',
      summary: `Ensure every non-empty line starts with '${charToInsert}'.`,
      steps: [
        {
          description: `Match non-empty lines not starting with '${charToInsert}' and prepend '${charToInsert}'`,
          find: findPat,
          replace: replacePat,
          flags: 'gm'
        }
      ],
      featuresUsed: [
        'Line start/end anchors (^...$)',
        `Negative lookahead ((?!${escapedChar}))`,
        'Backreference ($1)'
      ],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  const target = resolveTargetClause(parsed.targetClause, parsed.quotes);
  const isBefore = parsed.insertPosition === 'before-target';
  const findPat = isBefore
    ? `(?<!${escapedChar})(${target.pattern})`
    : `(${target.pattern})(?!${escapedChar})`;
  const replacePat = isBefore ? `${charToInsert}$1` : `$1${charToInsert}`;

  return {
    isPossible: true,
    mode: 'replace',
    summary: `Ensure '${charToInsert}' appears ${isBefore ? 'before' : 'after'} every ${target.label}.`,
    steps: [
      {
        description: `Insert '${charToInsert}' ${isBefore ? 'before' : 'after'} ${target.label} when not already present`,
        find: findPat,
        replace: replacePat,
        flags: buildFlagsString(parsed, target.needsMultiline, target.needsCaseInsensitive)
      }
    ],
    featuresUsed: [
      ...target.features,
      isBefore
        ? `Negative lookbehind ((?<!${escapedChar}))`
        : `Negative lookahead ((?!${escapedChar}))`,
      'Capture group ($1)'
    ],
    confidence: 'high',
    preferredAction: 'replace-all'
  };
}

export function handleInsertAddIntent(parsed: ParsedQuery): CompiledRegexResult {
  if (parsed.missingCheck) {
    return handleEnsureIntent(parsed);
  }

  const ins = resolveReplacementClause(parsed.replacementClause ?? '', parsed.quotes);
  const charToInsert = ins.replace;

  if (parsed.insertPosition === 'end-of-line') {
    return {
      isPossible: true,
      mode: 'replace',
      summary: `Append '${charToInsert}' to the end of every non-empty line.`,
      steps: [
        {
          description: `Match non-empty line and append '${charToInsert}'`,
          find: '^([^\\r\\n]*\\S[^\\r\\n]*)$',
          replace: `$1${charToInsert}`,
          flags: 'gm'
        }
      ],
      featuresUsed: ['Line start/end anchors (^...$)', 'Backreference ($1)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  if (parsed.insertPosition === 'start-of-line') {
    return {
      isPossible: true,
      mode: 'replace',
      summary: `Prepend '${charToInsert}' to the beginning of every non-empty line.`,
      steps: [
        {
          description: `Match start of non-empty line and prepend '${charToInsert}'`,
          find: '^([^\\r\\n]*\\S[^\\r\\n]*)$',
          replace: `${charToInsert}$1`,
          flags: 'gm'
        }
      ],
      featuresUsed: ['Line start/end anchors (^...$)', 'Backreference ($1)'],
      confidence: 'high',
      preferredAction: 'replace-all'
    };
  }

  const target = resolveTargetClause(parsed.targetClause, parsed.quotes);
  const isBefore = parsed.insertPosition === 'before-target';
  const findPat = `(${target.pattern})`;
  const replacePat = isBefore ? `${charToInsert}$1` : `$1${charToInsert}`;

  return {
    isPossible: true,
    mode: 'replace',
    summary: `Insert '${charToInsert}' ${isBefore ? 'before' : 'after'} every ${target.label}.`,
    steps: [
      {
        description: `Capture ${target.label} and insert '${charToInsert}' ${isBefore ? 'before' : 'after'} $1`,
        find: findPat,
        replace: replacePat,
        flags: buildFlagsString(parsed, target.needsMultiline, target.needsCaseInsensitive)
      }
    ],
    featuresUsed: [...target.features, 'Capture group ($1)'],
    confidence: 'high',
    preferredAction: 'replace-all'
  };
}
