import { ImpossibleRegexResult } from '../types';

export interface ImpossibleRule {
  test: (input: string) => boolean;
  result: ImpossibleRegexResult;
}

export const IMPOSSIBLE_RULES: ImpossibleRule[] = [
  // 1. State Tracking & Sequential Numbering
  {
    test: (s) =>
      /^(?:please\s+)?(?:sequentially\s+)?(number|enumerate|index)\s+(each|every|all|the)\s+(line|row|item|match)/i.test(
        s
      ) ||
      /\bsequential(ly)?\b.*\b(number|1\.\s*2\.|counter|increment)/i.test(s) ||
      /\b(number)\s+(each|every)\s+(line|row|item)\s+(sequentially|from\s+1|1\.\s*2\.)/i.test(s),
    result: {
      isPossible: false,
      category: 'State Tracking & Dynamic Arithmetic',
      reason:
        'Regular expressions are memoryless finite automata between matches. A replacement string cannot maintain a mutable counter or know whether it is evaluating match #1 or match #4.',
      advice:
        'Use multi-cursor column insertion or run the built-in sequential line numbering workaround below.',
      workaround: {
        label: 'Workaround: Number Lines Sequentially (Native Edit)',
        description: 'Prepend 1. , 2. , 3. to every line in the active selection or document.',
        actionType: 'custom-script'
      }
    }
  },
  // 2. Dynamic Arithmetic / Percentages / Math
  {
    test: (s) =>
      /\b(increase|decrease|multiply|divide|subtract|sum|average|round|increment|decrement)\b.*\b(by\s+\d+%?|price|number|value|amount|percent)/i.test(
        s
      ) ||
      /\badd\s+\d+%?\s+to\s+(every|each|all|the)?\s*(price|number|value|amount)/i.test(s) ||
      /\b(\d+%)\b.*\b(increase|decrease|discount|markup)/i.test(s),
    result: {
      isPossible: false,
      category: 'State Tracking & Dynamic Arithmetic',
      reason:
        'Regex treats digits strictly as ASCII character sequences (\\d+), not numerical quantities. It lacks an arithmetic execution layer to compute percentages, products, or rounding.',
      advice:
        'Select the target numbers using a regex like (?<=\\$)\\d+(?:\\.\\d{2})? and pipe them through an evaluated script or math command.'
    }
  },
  // 3. Modulo / Divisibility
  {
    test: (s) =>
      /\b(divisible\s+by|multiple\s+of|prime\s+numbers?|even\s+or\s+odd\s+calculation)\b/i.test(s),
    result: {
      isPossible: false,
      category: 'State Tracking & Dynamic Arithmetic',
      reason:
        'While finite state machines can theoretically encode fixed-base divisibility, doing so for arbitrary decimal numbers explodes into thousands of unmaintainable state transitions. Regex cannot run modulo (%) arithmetic.',
      advice:
        'Match all integer tokens with \\b\\d+\\b first, then filter them programmatically.'
    }
  },
  // 4. Arbitrary Recursive Nesting (Balanced Braces / Brackets / Tags)
  {
    test: (s) =>
      /\b(properly\s+balanced|arbitrarily\s+nested|nested)\b.*\b(brace|bracket|parenthes|curly|tag|div|html|xml|block)/i.test(
        s
      ) ||
      /\b(brace|bracket|parenthes|curly|tag|div|html|xml|block)s?\b.*\b(properly\s+balanced|nested\s+inside|no\s+matter\s+how\s+deep)/i.test(
        s
      ) ||
      /\bno\s+matter\s+how\s+deep\b/i.test(s) ||
      /\beven\s+if\s+there\s+are\s+nested\b/i.test(s),
    result: {
      isPossible: false,
      category: 'Arbitrary Recursive Nesting (Context-Free Grammar)',
      reason:
        'VS Code uses JavaScript’s ECMAScript regex engine, which does not support recursive subpattern calls like PCRE’s (?R). A greedy quantifier (.*) overshoots to the last closing delimiter in the file, while a lazy quantifier (.*?) stops prematurely at the first inner closing delimiter.',
      advice:
        'Use VS Code’s native "Select to Bracket" command or an AST parser. If you only need a fixed depth of 1 level, specify "non-nested braces" or "single-line tags".',
      workaround: {
        label: 'Workaround: Jump/Select to Matching Bracket',
        description: 'Invoke VS Code native bracket matching (editor.action.selectToBracket).',
        actionType: 'vscode-command',
        commandId: 'editor.action.selectToBracket'
      }
    }
  },
  // 5. Global Sorting
  {
    test: (s) =>
      /\b(sort|alphabetize)\b.*\b(alphabetical|ascending|descending|lines|names|list|words|file|items)/i.test(
        s
      ) || /\b(order|arrange)\b.*\b(alphabetically|ascending|descending)\b/i.test(s),
    result: {
      isPossible: false,
      category: 'Global Unordered Deduplication & Sorting',
      reason:
        'Regex is a pattern matcher and local text substitution engine; it cannot build comparative sorting networks across lines.',
      advice:
        'Use VS Code’s native "Sort Lines Ascending" or "Sort Lines Descending" command.',
      workaround: {
        label: 'Workaround: Run "Sort Lines Ascending"',
        description: 'Executes VS Code native editor.action.sortLinesAscending.',
        actionType: 'vscode-command',
        commandId: 'editor.action.sortLinesAscending'
      }
    }
  },
  // 6. Global Unordered Deduplication (Scattered Lines)
  {
    test: (s) =>
      /\b(duplicate\s+lines?|remove\s+duplicates?|deduplicate)\b.*\b(scattered|unsorted|anywhere|pages\s+apart|entire\s+file|across\s+file)/i.test(
        s
      ) ||
      (/\b(remove|delete)\s+(every|all)\s+duplicate\s+lines?\b/i.test(s) &&
        !/\b(adjacent|consecutive|in\s+a\s+row)\b/i.test(s)),
    result: {
      isPossible: false,
      category: 'Global Unordered Deduplication & Sorting',
      reason:
        'Regex cannot store a dynamic Set of previously encountered lines across a file without catastrophic backtracking across unbounded multiline lookaheads.',
      advice:
        'Sort the lines first so identical lines become adjacent, then run the adjacent-line deduplication regex: ^(?:(.*)(?:\\r?\\n\\1)+)$ -> $1.',
      workaround: {
        label: 'Workaround: Sort Lines + Deduplicate Adjacent Lines (2-Step)',
        description: 'Sorts lines ascending, then collapses consecutive duplicate lines via regex.',
        actionType: 'sort-then-regex',
        commandId: 'editor.action.sortLinesAscending',
        followUpStep: {
          description: 'Collapse adjacent duplicate lines',
          find: '^(.*)(\\r?\\n\\1)+$',
          replace: '$1',
          flags: 'gm'
        }
      }
    }
  },
  // 7. Temporal / Calendar Logic
  {
    test: (s) => /\b(day\s+of\s+the\s+week|leap\s+year|weekday)\b/i.test(s),
    result: {
      isPossible: false,
      category: 'Semantic, Temporal, or String Reversal Logic',
      reason:
        'Calculating the day of the week from a date requires calendar arithmetic (such as Zeller’s congruence and leap-year tables), which regex has no mechanism to compute.',
      advice:
        'To reformat numeric date components (e.g., MM/DD/YYYY to YYYY-MM-DD), ask to "Convert MM/DD/YYYY dates to YYYY-MM-DD".'
    }
  },
  // 8. Natural Language Semantics (Passive Voice, Sentiment, Grammar)
  {
    test: (s) =>
      /\b(passive\s+voice|active\s+voice|grammatically|sentiment|synonyms?|antonyms?|translate\s+to\s+spanish|part\s+of\s+speech)\b/i.test(
        s
      ),
    result: {
      isPossible: false,
      category: 'Semantic, Temporal, or String Reversal Logic',
      reason:
        'Identifying grammatical voice or semantic meaning requires dependency parsing (subject-verb-object trees) and lexical dictionaries beyond character-level pattern matching.',
      advice:
        'Target concrete lexical markers instead (e.g., "Find words ending in \'ly\'" or "Find \'was\' or \'were\' followed by a word ending in \'ed\'").'
    }
  },
  // 9. Arbitrary String Reversal
  {
    test: (s) =>
      /\b(reverse|backwards|invert)\b.*\b(letters|characters|spelling)\s+(of|in)\s+(every|all|each)?\s*(word|line|string)/i.test(
        s
      ),
    result: {
      isPossible: false,
      category: 'Semantic, Temporal, or String Reversal Logic',
      reason:
        'Reversing a token of arbitrary length requires unbounded backreferences or a string reversal operator, neither of which exists in ECMAScript regular expressions.',
      advice:
        'If reversing a fixed pair of tokens (such as "Swap first and last names separated by a comma"), specify the delimiter separating the two parts.'
    }
  }
];

export function checkImpossibleRequest(prompt: string): ImpossibleRegexResult | null {
  const trimmed = prompt.trim();
  for (const rule of IMPOSSIBLE_RULES) {
    if (rule.test(trimmed)) {
      return rule.result;
    }
  }
  return null;
}
