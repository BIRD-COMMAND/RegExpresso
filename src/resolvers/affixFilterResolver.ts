import { ResolvedTarget } from '../types';
import { extractPerLineSuffix, matchAffixFilterPredicate } from '../grammar/patterns';
import { parseNumberToken } from '../grammar/tokens';
import { BlockSpec, resolveBlockSpec } from '../lexicon';
import { extractQuantifier } from './quantifierExtractor';
import { resolveDelimiterOrLiteral, resolveRawLiteralOrCharClass } from './primitiveResolver';

function buildBlockAffixTarget(
  spec: BlockSpec,
  operator: 'starts-with' | 'ends-with' | 'contains' | 'not-contains',
  lit: string
): ResolvedTarget {
  const negCls = `[^${spec.negatedInnerChar}]*`;

  switch (operator) {
    case 'not-contains': {
      const pat = spec.isDualQuote
        ? `(?:"(?![^"\\r\\n]*${lit})[^"\\r\\n]*"|'(?![^'\\r\\n]*${lit})[^'\\r\\n]*')`
        : `${spec.open}(?!${negCls}${lit})${negCls}${spec.close}`;
      return {
        pattern: pat,
        label: `${spec.label} not containing ${lit}`,
        features: [...spec.features, `Negative lookahead ((?!${negCls}${lit}))`],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    case 'starts-with': {
      const pat = spec.isDualQuote
        ? `(?:"${lit}[^"\\r\\n]*"|'${lit}[^'\\r\\n]*')`
        : `${spec.open}${lit}${negCls}${spec.close}`;
      return {
        pattern: pat,
        label: `${spec.label} starting with ${lit}`,
        features: [...spec.features, `Prefix match (${lit})`],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    case 'ends-with': {
      const pat = spec.isDualQuote
        ? `(?:"[^"\\r\\n]*${lit}"|'[^'\\r\\n]*${lit}')`
        : `${spec.open}${negCls}${lit}${spec.close}`;
      return {
        pattern: pat,
        label: `${spec.label} ending with ${lit}`,
        features: [...spec.features, `Suffix match (${lit})`],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
    case 'contains': {
      const pat = spec.isDualQuote
        ? `(?:"[^"\\r\\n]*${lit}[^"\\r\\n]*"|'[^'\\r\\n]*${lit}[^'\\r\\n]*')`
        : `${spec.open}${negCls}${lit}${negCls}${spec.close}`;
      return {
        pattern: pat,
        label: `${spec.label} containing ${lit}`,
        features: [...spec.features, `Substring match (${lit})`],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }
}

/**
 * Resolves structural word, string, block, line, and span modifiers:
 * - First / last N (chars / words / letters / digits / . / *) per line
 * - Words / numbers with N letters / digits
 * - Words starting/ending/containing/not-containing X
 * - Strings / quotations starting/ending/containing/not-containing X
 * - Delimited blocks starting/ending/containing/not-containing X
 * - Lines starting/ending/containing/not-containing X
 * - Everything before / after X
 */
export function tryResolveAffixOrLineFilter(
  phrase: string,
  quotes: string[]
): ResolvedTarget | null {
  // 1. First / last N (chars / words / letters / digits / . / *) per line
  const { cleaned: basePhrase, hasPerLine } = extractPerLineSuffix(phrase);
  const firstLastLineMatch = basePhrase.match(
    /^(?:the\s+)?(first|last)(?:\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten))?(?:\s+(words?|characters?|chars?|letters?|digits?|\.|\*))?$/i
  );
  if (firstLastLineMatch && (hasPerLine || firstLastLineMatch[3] !== undefined)) {
    const pos = firstLastLineMatch[1].toLowerCase();
    const count = firstLastLineMatch[2] ? parseNumberToken(firstLastLineMatch[2]) ?? 1 : 1;
    const rawUnitToken = firstLastLineMatch[3]?.toLowerCase() ?? 'chars';
    const unitLabel = rawUnitToken === '.' || rawUnitToken === '*' ? 'chars' : rawUnitToken;

    let unitPat = '.';
    if (unitLabel.startsWith('word')) unitPat = '\\w+';
    else if (unitLabel.startsWith('letter')) unitPat = '[a-zA-Z]';
    else if (unitLabel.startsWith('digit')) unitPat = '\\d';

    const quant = count > 1 && unitPat !== '\\w+' ? `{${count}}` : '';
    const pattern = pos === 'first' ? `^${unitPat}${quant}` : `${unitPat}${quant}$`;
    return {
      pattern,
      label: `${pos} ${count > 1 ? count + ' ' : ''}${unitLabel} of each line`,
      features: [pos === 'first' ? 'Line start anchor (^)' : 'Line end anchor ($)'],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  // 2. "words with 3 to 5 letters" / "numbers with 4 digits"
  const wordsWithLen = phrase.match(
    /^words?\s+(?:with|of|having)\s+(.+?)\s+(?:letters?|characters?|chars?|length)$/i
  );
  if (wordsWithLen) {
    const qExt = extractQuantifier(`${wordsWithLen[1]} letters`);
    if (qExt.quantifier) {
      return {
        pattern: `\\b[a-zA-Z]${qExt.quantifier}\\b`,
        label: `words with ${wordsWithLen[1]} letters`,
        features: [
          'Word boundary (\\b)',
          'Character range ([a-zA-Z])',
          ...(qExt.feature ? [qExt.feature] : [])
        ],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  const numbersWithLen = phrase.match(
    /^numbers?\s+(?:with|of|having)\s+(.+?)\s+(?:digits?|length)$/i
  );
  if (numbersWithLen) {
    const qExt = extractQuantifier(`${numbersWithLen[1]} digits`);
    if (qExt.quantifier) {
      return {
        pattern: `\\b\\d${qExt.quantifier}\\b`,
        label: `numbers with ${numbersWithLen[1]} digits`,
        features: [
          'Word boundary (\\b)',
          'Digit shorthand (\\d)',
          ...(qExt.feature ? [qExt.feature] : [])
        ],
        needsMultiline: false,
        needsCaseInsensitive: false
      };
    }
  }

  // 3. Words starting/ending/containing/not-containing <X>
  const wordSubjectMatch = phrase.match(/^words?\s+(.+)$/i);
  if (wordSubjectMatch) {
    const pred = matchAffixFilterPredicate(wordSubjectMatch[1]);
    if (pred) {
      const lit = resolveRawLiteralOrCharClass(pred.argument, quotes);
      switch (pred.operator) {
        case 'starts-with':
          return {
            pattern: `\\b${lit}[a-zA-Z0-9_]*\\b`,
            label: `words starting with ${lit}`,
            features: ['Word boundary (\\b)', 'Word continuation ([a-zA-Z0-9_]*)'],
            needsMultiline: false,
            needsCaseInsensitive: false
          };
        case 'ends-with':
          return {
            pattern: `\\b[a-zA-Z0-9_]*${lit}\\b`,
            label: `words ending with ${lit}`,
            features: ['Word boundary (\\b)', 'Word prefix ([a-zA-Z0-9_]*)'],
            needsMultiline: false,
            needsCaseInsensitive: false
          };
        case 'not-contains':
          return {
            pattern: `\\b(?![a-zA-Z0-9_]*${lit})[a-zA-Z0-9_]+\\b`,
            label: `words not containing ${lit}`,
            features: ['Word boundary (\\b)', `Negative lookahead ((?![a-zA-Z0-9_]*${lit}))`],
            needsMultiline: false,
            needsCaseInsensitive: false
          };
        case 'contains':
          return {
            pattern: `\\b[a-zA-Z0-9_]*${lit}[a-zA-Z0-9_]*\\b`,
            label: `words containing ${lit}`,
            features: ['Word boundary (\\b)', 'Substring match'],
            needsMultiline: false,
            needsCaseInsensitive: false
          };
      }
    }
  }

  // 4. Strings / quotations starting/ending/containing/not-containing <X>
  const stringSubjectMatch = phrase.match(
    /^(?:strings?|quotations?|quoted[\s_]+strings?)\s+(.+)$/i
  );
  if (stringSubjectMatch) {
    const pred = matchAffixFilterPredicate(stringSubjectMatch[1]);
    if (pred) {
      const lit = resolveRawLiteralOrCharClass(pred.argument, quotes);
      switch (pred.operator) {
        case 'starts-with':
          return {
            pattern: `(?:"${lit}[^"\\r\\n]*"|'${lit}[^'\\r\\n]*')`,
            label: `quoted strings starting with ${lit}`,
            features: ['Quoted string literal', `Prefix match (${lit})`],
            needsMultiline: false,
            needsCaseInsensitive: false
          };
        case 'ends-with':
          return {
            pattern: `(?:"[^"\\r\\n]*${lit}"|'[^'\\r\\n]*${lit}')`,
            label: `quoted strings ending with ${lit}`,
            features: ['Quoted string literal', `Suffix match (${lit})`],
            needsMultiline: false,
            needsCaseInsensitive: false
          };
        case 'not-contains':
          return {
            pattern: `(?:"(?![^"\\r\\n]*${lit})[^"\\r\\n]*"|'(?![^'\\r\\n]*${lit})[^'\\r\\n]*')`,
            label: `quoted strings not containing ${lit}`,
            features: ['Quoted string literal', `Negative lookahead ((?![^"]*${lit}))`],
            needsMultiline: false,
            needsCaseInsensitive: false
          };
        case 'contains':
          return {
            pattern: `(?:"[^"\\r\\n]*${lit}[^"\\r\\n]*"|'[^'\\r\\n]*${lit}[^'\\r\\n]*')`,
            label: `quoted strings containing ${lit}`,
            features: ['Quoted string literal', `Substring match (${lit})`],
            needsMultiline: false,
            needsCaseInsensitive: false
          };
      }
    }
  }

  // 5. <delimiter> blocks starting/ending/containing/not-containing <X>
  const blockSubjectMatch = phrase.match(/^(.+?)\s+blocks?\s+(.+)$/i);
  if (blockSubjectMatch) {
    const spec = resolveBlockSpec(blockSubjectMatch[1].trim(), quotes);
    if (spec) {
      const pred = matchAffixFilterPredicate(blockSubjectMatch[2]);
      if (pred) {
        const lit = resolveRawLiteralOrCharClass(pred.argument, quotes);
        return buildBlockAffixTarget(spec, pred.operator, lit);
      }
    }
  }

  // 6. Lines starting/ending/containing/not-containing <X>
  const lineSubjectMatch = phrase.match(/^lines?\s+(.+)$/i);
  if (lineSubjectMatch) {
    const pred = matchAffixFilterPredicate(lineSubjectMatch[1]);
    if (pred) {
      const lit = resolveRawLiteralOrCharClass(pred.argument, quotes);
      switch (pred.operator) {
        case 'starts-with':
          return {
            pattern: `^[ \\t]*${lit}.*$`,
            label: `lines starting with ${lit}`,
            features: ['Line start/end anchors (^...$)', 'Wildcard (.*)'],
            needsMultiline: true,
            needsCaseInsensitive: false,
            isWholeLine: true
          };
        case 'ends-with':
          return {
            pattern: `^.*${lit}[ \\t]*$`,
            label: `lines ending with ${lit}`,
            features: ['Line start/end anchors (^...$)', 'Wildcard (.*)'],
            needsMultiline: true,
            needsCaseInsensitive: false,
            isWholeLine: true
          };
        case 'not-contains':
          return {
            pattern: `^(?!.*${lit}).+$`,
            label: `lines not containing ${lit}`,
            features: ['Negative lookahead ((?!.*...))', 'Line anchors (^...$)'],
            needsMultiline: true,
            needsCaseInsensitive: false,
            isWholeLine: true
          };
        case 'contains':
          return {
            pattern: `^.*${lit}.*$`,
            label: `lines containing ${lit}`,
            features: ['Line start/end anchors (^...$)', 'Wildcard (.*)'],
            needsMultiline: true,
            needsCaseInsensitive: false,
            isWholeLine: true
          };
      }
    }
  }

  // 7. "everything after X" / "everything before X"
  const afterMatch = phrase.match(
    /^(?:everything|anything|text|content|characters?|chars?|rest[\s_]+of[\s_]+(?:the[\s_]+)?line|all(?:[\s_]+(?:text|content|characters?|chars?))?)[\s_]+after\s+(.+)$/i
  );
  if (afterMatch) {
    const lit = resolveDelimiterOrLiteral(afterMatch[1], quotes);
    return {
      pattern: `(?<=${lit}).*$`,
      label: `text after ${lit}`,
      features: [`Positive lookbehind ((?<=${lit}))`, 'Line end anchor ($)'],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  const beforeMatch = phrase.match(
    /^(?:everything|anything|text|content|characters?|chars?|all(?:[\s_]+(?:text|content|characters?|chars?))?)[\s_]+before\s+(.+)$/i
  );
  if (beforeMatch) {
    const lit = resolveDelimiterOrLiteral(beforeMatch[1], quotes);
    return {
      pattern: `^.*?(?=${lit})`,
      label: `text before ${lit}`,
      features: [`Positive lookahead ((?=${lit}))`, 'Lazy quantifier (.*?)'],
      needsMultiline: true,
      needsCaseInsensitive: false
    };
  }

  return null;
}
