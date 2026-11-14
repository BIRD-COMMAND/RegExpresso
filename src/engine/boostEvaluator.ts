import { RegexStep } from '../types';

/**
 * Evaluates VS Code / Boost replacement strings including:
 * - $& (whole match), $$ (literal $)
 * - $1 .. $99 (numbered capture groups)
 * - $<name> (named capture groups)
 * - \n, \r, \t (whitespace escapes)
 * - \u (uppercase next char), \l (lowercase next char)
 * - \U (uppercase until \E or end), \L (lowercase until \E or end), \E (end case block)
 */
export function evaluateBoostReplacement(
  replaceTemplate: string,
  match: RegExpExecArray
): string {
  // 1. Expand escape sequences \n, \r, \t
  let interpolated = replaceTemplate
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');

  // 2. Substitute $$, $&, $<name>, and $1..$99
  interpolated = interpolated.replace(
    /\$(?:\$|&|<([^>]+)>|(\d{1,2}))/g,
    (fullToken, namedGroup?: string, numberedGroup?: string) => {
      if (fullToken === '$$') return '$';
      if (fullToken === '$&') return match[0];
      if (namedGroup !== undefined) {
        return match.groups?.[namedGroup] ?? '';
      }
      if (numberedGroup !== undefined) {
        const idx = parseInt(numberedGroup, 10);
        return match[idx] ?? '';
      }
      return fullToken;
    }
  );

  // 3. Evaluate Boost Case Modifiers (\U, \L, \u, \l, \E)
  let output = '';
  let blockMode: 'none' | 'upper' | 'lower' = 'none';
  let singleCharMode: 'none' | 'upper' | 'lower' = 'none';

  for (let i = 0; i < interpolated.length; i++) {
    if (interpolated[i] === '\\' && i + 1 < interpolated.length) {
      const next = interpolated[i + 1];
      if (next === 'U') {
        blockMode = 'upper';
        i++;
        continue;
      } else if (next === 'L') {
        blockMode = 'lower';
        i++;
        continue;
      } else if (next === 'E') {
        blockMode = 'none';
        i++;
        continue;
      } else if (next === 'u') {
        singleCharMode = 'upper';
        i++;
        continue;
      } else if (next === 'l') {
        singleCharMode = 'lower';
        i++;
        continue;
      }
    }

    let ch = interpolated[i];
    if (singleCharMode === 'upper') {
      ch = ch.toUpperCase();
      singleCharMode = 'none';
    } else if (singleCharMode === 'lower') {
      ch = ch.toLowerCase();
      singleCharMode = 'none';
    } else if (blockMode === 'upper') {
      ch = ch.toUpperCase();
    } else if (blockMode === 'lower') {
      ch = ch.toLowerCase();
    }

    output += ch;
  }

  return output;
}

/**
 * Applies a single RegexStep to a raw string using the Boost-compatible evaluator.
 * Handles zero-length lookaround/anchor matches safely across both LF and CRLF line endings.
 */
export function applyStepToText(
  text: string,
  step: RegexStep
): { newText: string; matchCount: number } {
  const flags = step.flags.includes('g') ? step.flags : step.flags + 'g';
  const regex = new RegExp(step.find, flags);
  const replaceTemplate = step.replace ?? '$&';

  let matchCount = 0;
  let lastIndex = 0;
  let result = '';
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Guard against ECMAScript multiline `/m` matching `^` or `$` inside a `\r\n` CRLF pair
    if (
      match[0].length === 0 &&
      match.index > 0 &&
      text[match.index - 1] === '\r' &&
      text[match.index] === '\n'
    ) {
      regex.lastIndex = match.index + 1;
      continue;
    }

    matchCount++;
    result += text.slice(lastIndex, match.index);
    result += evaluateBoostReplacement(replaceTemplate, match);
    lastIndex = match.index + match[0].length;

    // Prevent infinite loop on zero-length matches (e.g., lookarounds at line ends)
    // Step over CRLF (\r\n) as a 2-char unit so regex.lastIndex never lands between \r and \n.
    if (match[0].length === 0) {
      if (regex.lastIndex < text.length) {
        const stepLen =
          text[regex.lastIndex] === '\r' && text[regex.lastIndex + 1] === '\n' ? 2 : 1;
        result += text.slice(regex.lastIndex, regex.lastIndex + stepLen);
        lastIndex = regex.lastIndex + stepLen;
        regex.lastIndex += stepLen;
      } else {
        regex.lastIndex++;
      }
    }
  }

  result += text.slice(lastIndex);
  return { newText: result, matchCount };
}

/**
 * Formats a replacement string for the inline editor preview decoration (`after.contentText`).
 * Renders tabs (`\t`) as `⇥`, newlines (`\r?\n`) as `↵`, and pure spaces as `·`.
 */
export function formatReplacementPreview(replacementText: string): string {
  if (replacementText === '') {
    return '∅ (deleted)';
  }
  const formatted = replacementText.replace(/\r?\n/g, '↵').replace(/\t/g, '⇥');
  if (/^ +$/.test(formatted)) {
    return '·'.repeat(formatted.length);
  }
  return formatted;
}
