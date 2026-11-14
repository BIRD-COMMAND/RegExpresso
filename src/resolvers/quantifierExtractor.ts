import { NUM_TOKEN_PATTERN, parseNumberToken } from '../grammar/tokens';

export interface QuantifierExtract {
  quantifier: string;
  feature?: string;
  remainingText: string;
  isSingleUnitRequest: boolean;
}

/**
 * Extracts explicit quantifiers from a target clause:
 * - "three to five digits" -> {3,5}
 * - "at least 2 spaces" -> {2,}
 * - "at most 4 letters" -> {1,4}
 * - "exactly 3 digits" / "3 digits" -> {3}
 * - "one or more" -> +
 * - "zero or more" -> *
 * - "optional" / "zero or one" -> ?
 */
export function extractQuantifier(text: string): QuantifierExtract {
  let working = text.trim();

  // Strip introductory filler like "any place where someone typed", "any place where there are"
  working = working
    .replace(
      /^(?:any\s+place\s+where\s+(?:someone\s+typed|there\s+(?:is|are))|places?\s+where\s+(?:someone\s+typed|there\s+(?:is|are)))\s+/i,
      ''
    )
    .trim();

  // Strip trailing "in a row" / "consecutively" unless preceded by "twice"
  if (!/\btwice\s+in\s+a\s+row\b/i.test(working)) {
    working = working.replace(/\s+(?:in\s+a\s+row|consecutively)\b/gi, '').trim();
  }

  // 1. Range quantifier: "three to five", "3 to 5", "between 3 and 5", "3-5"
  const rangeRegex = new RegExp(
    `^(?:between\\s+)?(${NUM_TOKEN_PATTERN})\\s*(?:to|through|and|-)\\s*(${NUM_TOKEN_PATTERN})\\s+(.+)$`,
    'i'
  );
  const rangeMatch = working.match(rangeRegex);
  if (rangeMatch) {
    const min = parseNumberToken(rangeMatch[1]);
    const max = parseNumberToken(rangeMatch[2]);
    if (min !== null && max !== null) {
      const q = `{${min},${max}}`;
      return {
        quantifier: q,
        feature: `Range quantifier (${q})`,
        remainingText: rangeMatch[3].trim(),
        isSingleUnitRequest: false
      };
    }
  }

  // 2. Lower-bound quantifier: "at least N", "N or more", "minimum of N"
  const atLeastRegex = new RegExp(
    `^(?:at\\s+least\\s+(${NUM_TOKEN_PATTERN})|minimum\\s+(?:of\\s+)?(${NUM_TOKEN_PATTERN})|(${NUM_TOKEN_PATTERN})\\s+or\\s+more)\\s+(.+)$`,
    'i'
  );
  const atLeastMatch = working.match(atLeastRegex);
  if (atLeastMatch) {
    const n = parseNumberToken(atLeastMatch[1] ?? atLeastMatch[2] ?? atLeastMatch[3]);
    if (n !== null) {
      const q = n === 1 ? '+' : `{${n},}`;
      return {
        quantifier: q,
        feature: n === 1 ? 'One-or-more quantifier (+)' : `Lower-bound quantifier (${q})`,
        remainingText: atLeastMatch[4].trim(),
        isSingleUnitRequest: false
      };
    }
  }

  // 3. Upper-bound quantifier: "at most N", "up to N", "no more than N"
  const atMostRegex = new RegExp(
    `^(?:at\\s+most|up\\s+to|no\\s+more\\s+than)\\s+(${NUM_TOKEN_PATTERN})\\s+(.+)$`,
    'i'
  );
  const atMostMatch = working.match(atMostRegex);
  if (atMostMatch) {
    const max = parseNumberToken(atMostMatch[1]);
    if (max !== null && max >= 1) {
      const q = `{1,${max}}`;
      return {
        quantifier: q,
        feature: `Range quantifier (${q})`,
        remainingText: atMostMatch[2].trim(),
        isSingleUnitRequest: false
      };
    }
  }

  // 4. Zero or more / One or more / Optional
  if (/^zero\s+or\s+more\s+(.+)$/i.test(working)) {
    const m = working.match(/^zero\s+or\s+more\s+(.+)$/i)!;
    return {
      quantifier: '*',
      feature: 'Zero-or-more quantifier (*)',
      remainingText: m[1].trim(),
      isSingleUnitRequest: false
    };
  }
  if (/^one\s+or\s+more\s+(.+)$/i.test(working)) {
    const m = working.match(/^one\s+or\s+more\s+(.+)$/i)!;
    return {
      quantifier: '+',
      feature: 'One-or-more quantifier (+)',
      remainingText: m[1].trim(),
      isSingleUnitRequest: false
    };
  }
  if (/^(?:optional|zero\s+or\s+one)\s+(.+)$/i.test(working)) {
    const m = working.match(/^(?:optional|zero\s+or\s+one)\s+(.+)$/i)!;
    return {
      quantifier: '?',
      feature: 'Zero-or-one quantifier (?)',
      remainingText: m[1].trim(),
      isSingleUnitRequest: false
    };
  }

  // 5. Exact count: "(exactly) N <target>" (excluding "four-digit years" which is a lexicon concept)
  if (!/^(?:four|4)[-\s]digit\s+years?\b/i.test(working)) {
    const exactRegex = new RegExp(`^(?:exactly\\s+)?(${NUM_TOKEN_PATTERN})[-\\s]+(.+)$`, 'i');
    const exactMatch = working.match(exactRegex);
    if (exactMatch) {
      const count = parseNumberToken(exactMatch[1]);
      const rest = exactMatch[2].trim();
      if (count !== null && count > 1) {
        const nLetterWord = rest.match(/^(?:letter|character|char)\s+words?$/i);
        if (nLetterWord) {
          return {
            quantifier: `{${count}}`,
            feature: `Exact quantifier ({${count}})`,
            remainingText: 'letters_as_word',
            isSingleUnitRequest: false
          };
        }
        const nDigitNum = rest.match(/^digit\s+numbers?$/i);
        if (nDigitNum) {
          return {
            quantifier: `{${count}}`,
            feature: `Exact quantifier ({${count}})`,
            remainingText: 'digits_as_word',
            isSingleUnitRequest: false
          };
        }
        const q = `{${count}}`;
        return {
          quantifier: q,
          feature: `Exact quantifier (${q})`,
          remainingText: rest,
          isSingleUnitRequest: false
        };
      } else if (count === 1 && /^exactly\s+/i.test(working)) {
        return {
          quantifier: '',
          remainingText: rest,
          isSingleUnitRequest: true
        };
      }
    }
  }

  return {
    quantifier: '',
    remainingText: working,
    isSingleUnitRequest: /^(?:a\s+single|single|each\s+individual)\s+/i.test(working)
  };
}
