import * as assert from 'node:assert/strict';
import { RegexStep } from '../../types';
import { applyStepToText } from '../../engine/boostEvaluator';

export interface ExtractedMatchDetails {
  fullMatches: string[];
  group1Matches: (string | undefined)[];
  namedGroups: Record<string, string>[];
}

/**
 * Runs a compiled `RegexStep` against `text` and extracts all matched spans,
 * `$1` capture groups, and named capture groups `(?<name>...)`.
 * Includes CRLF-aware zero-width match advancement identical to `executor.ts`.
 */
export function extractMatchDetails(text: string, step: RegexStep): ExtractedMatchDetails {
  const flags = step.flags.includes('g') ? step.flags : step.flags + 'g';
  const regex = new RegExp(step.find, flags);

  const fullMatches: string[] = [];
  const group1Matches: (string | undefined)[] = [];
  const namedGroups: Record<string, string>[] = [];

  let match: RegExpExecArray | null;
  let safetyCounter = 0;

  while ((match = regex.exec(text)) !== null && safetyCounter < 5000) {
    safetyCounter++;
    fullMatches.push(match[0]);
    group1Matches.push(match[1]);
    if (match.groups) {
      namedGroups.push({ ...match.groups });
    }

    if (match[0].length === 0) {
      const stepLen =
        text[regex.lastIndex] === '\r' && text[regex.lastIndex + 1] === '\n' ? 2 : 1;
      regex.lastIndex += stepLen;
    }
  }

  return { fullMatches, group1Matches, namedGroups };
}

/**
 * Sequentially applies an array of `RegexStep`s to `text` using `applyStepToText`.
 */
export function executeStepsOnText(text: string, steps: RegexStep[]): string {
  let current = text;
  for (const step of steps) {
    current = applyStepToText(current, step).newText;
  }
  return current;
}

/**
 * Normalizes a multi-line fixture string to LF (`\n`) and CRLF (`\r\n`) and runs
 * `assertionFn` against both line-ending representations.
 */
export function runDualLineEndings(
  baseText: string,
  assertionFn: (text: string, eol: '\n' | '\r\n', modeLabel: 'LF' | 'CRLF') => void
): void {
  const lfText = baseText.replace(/\r\n/g, '\n');
  const crlfText = lfText.replace(/\n/g, '\r\n');

  assertionFn(lfText, '\n', 'LF');
  assertionFn(crlfText, '\r\n', 'CRLF');
}

export interface CaptureGroupLintReport {
  numberedCaptureCount: number;
  nonCapturingCount: number;
  namedGroupNames: string[];
  duplicateNamedGroups: string[];
  patternBackreferences: number[];
}

/**
 * Layer 4 Static Lexical Scanner for Regular Expression Capture-Group Hygiene.
 * Walks a regex pattern character-by-character, tracking escape sequences (`\x`)
 * and character classes (`[...]`) so escaped parentheses `\(` or `[(]` are ignored.
 */
export function lintRegexCaptureGroups(pattern: string): CaptureGroupLintReport {
  let inCharClass = false;
  let numberedCaptureCount = 0;
  let nonCapturingCount = 0;
  const namedGroupNames: string[] = [];
  const duplicateNamedGroups: string[] = [];
  const patternBackreferences: number[] = [];

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (ch === '\\') {
      const next = pattern[i + 1];
      if (!inCharClass && next && /^[1-9]$/.test(next)) {
        patternBackreferences.push( parseInt(next, 10) );
      }
      i++; // Skip escaped char
      continue;
    }

    if (ch === '[' && !inCharClass) {
      inCharClass = true;
      continue;
    }

    if (ch === ']' && inCharClass) {
      inCharClass = false;
      continue;
    }

    if (!inCharClass && ch === '(') {
      if (pattern[i + 1] === '?') {
        const rest = pattern.slice(i + 2);
        // Check for named capture group `(?<name>...)` (excluding lookbehinds `(?<=` and `(?<!`)
        if (rest.startsWith('<') && !rest.startsWith('<=') && !rest.startsWith('<!')) {
          const nameMatch = rest.match(/^<([a-zA-Z0-9_]+)>/);
          if (nameMatch) {
            const groupName = nameMatch[1];
            if (namedGroupNames.includes(groupName)) {
              duplicateNamedGroups.push(groupName);
            } else {
              namedGroupNames.push(groupName);
            }
            numberedCaptureCount++;
          }
        } else {
          nonCapturingCount++;
        }
      } else {
        numberedCaptureCount++;
      }
    }
  }

  return {
    numberedCaptureCount,
    nonCapturingCount,
    namedGroupNames,
    duplicateNamedGroups,
    patternBackreferences
  };
}

/**
 * Verifies that all `$1..$9` and `$<name>` references in a replacement string
 * correspond to defined capture groups in the find pattern.
 */
export function assertReplacementBackreferencesValid(step: RegexStep): void {
  const report = lintRegexCaptureGroups(step.find);

  assert.equal(
    report.duplicateNamedGroups.length,
    0,
    `Duplicate named capture groups [${report.duplicateNamedGroups.join(', ')}] in /${step.find}/`
  );

  for (const backref of report.patternBackreferences) {
    assert.ok(
      backref <= report.numberedCaptureCount,
      `In-pattern backreference \\${backref} exceeds capture group count (${report.numberedCaptureCount}) in /${step.find}/`
    );
  }

  if (step.replace === undefined) {
    return;
  }

  const rep = step.replace;
  for (let i = 0; i < rep.length; i++) {
    if (rep[i] === '$' && rep[i + 1] === '$') {
      i++; // Escaped literal `$`
      continue;
    }
    if (rep[i] === '$') {
      const rest = rep.slice(i + 1);
      const numMatch = rest.match(/^(\d+)/);
      if (numMatch) {
        const idx = parseInt(numMatch[1], 10);
        if (idx > 0) {
          assert.ok(
            idx <= report.numberedCaptureCount,
            `Replacement backreference $${idx} in "${rep}" exceeds capture group count (${report.numberedCaptureCount}) in /${step.find}/`
          );
        }
      }
      const namedMatch = rest.match(/^<([^>]+)>/);
      if (namedMatch) {
        const name = namedMatch[1];
        assert.ok(
          report.namedGroupNames.includes(name),
          `Replacement named backreference $<${name}> in "${rep}" not found in /${step.find}/ (available: [${report.namedGroupNames.join(', ')}])`
        );
      }
    }
  }
}

/**
 * Checks whether a replacement string uses Boost-only case conversion escapes (`\U`, `\L`, `\u`, `\l`, `\E`).
 */
export function hasBoostCaseModifiers(replaceStr: string): boolean {
  return /\\[ULulE]/.test(replaceStr);
}

/**
 * Compares `applyStepToText(text, step)` against native JavaScript `String.prototype.replace`
 * for standard non-case-modifying replacements (`$&`, `$$`, `$1..$9`, `$<name>`, `\n`, `\t`, `\r`).
 */
export function checkNativeDifferentialParity(text: string, step: RegexStep): {
  boostOutput: string;
  nativeOutput: string;
} {
  const boostOutput = applyStepToText(text, step).newText;

  const flags = step.flags.includes('g') ? step.flags : step.flags + 'g';
  const regex = new RegExp(step.find, flags);
  const rawRep = step.replace ?? '';

  // Translate `\n`, `\r`, `\t`, `\\` in replacement string the same way VS Code native Find/Replace does
  let nativeRep = '';
  for (let i = 0; i < rawRep.length; i++) {
    if (rawRep[i] === '\\' && i + 1 < rawRep.length) {
      const next = rawRep[i + 1];
      if (next === 'n') {
        nativeRep += '\n';
        i++;
        continue;
      }
      if (next === 'r') {
        nativeRep += '\r';
        i++;
        continue;
      }
      if (next === 't') {
        nativeRep += '\t';
        i++;
        continue;
      }
      if (next === '\\') {
        nativeRep += '\\';
        i++;
        continue;
      }
    }
    nativeRep += rawRep[i];
  }

  const nativeOutput = text.replace(regex, nativeRep);
  return { boostOutput, nativeOutput };
}
