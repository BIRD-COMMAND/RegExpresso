/**
 * Core lexical token utilities: regex escaping, number word parsing,
 * quote/raw-regex token masking, and atomic regex unit checks.
 */

export function escapeRegexLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeCharClassLiteral(literal: string): string {
  return literal.replace(/[\\\]^-]/g, '\\$&');
}

/**
 * Checks whether a regex pattern is a single atomic unit that can take a postfix quantifier
 * (+, *, ?, {n,m}) directly without needing a non-capturing group `(?:...)`.
 */
export function isAtomicRegexUnit(pattern: string): boolean {
  return /^(\\[dwsDWS]|\\.|[^\\[\]()|+?*{}]|\[[^\]]+\])$/.test(pattern);
}

export const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  a: 1,
  an: 1,
  single: 1,
  two: 2,
  couple: 2,
  pair: 2,
  double: 2,
  both: 2,
  three: 3,
  triple: 3,
  four: 4,
  quadruple: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  hundred: 100
};

export const NUM_TOKEN_PATTERN =
  '(?:\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';

export function parseNumberToken(token: string): number | null {
  const clean = token.trim().toLowerCase();
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }
  return WORD_NUMBERS[clean] ?? null;
}

/**
 * Masks quoted strings and raw regex tokens:
 * - Backticks (`...`) and tildes (~...~) are masked as __R0__, __R1__, ... (raw regex / code tokens)
 * - Double quotes ("...") and single quotes ('...') are masked as __Q0__, __Q1__, ... (literal strings)
 * Avoids matching apostrophes inside contractions (don't, isn't, it's) or possessives.
 */
export function maskQuotedLiterals(input: string): { masked: string; quotes: string[] } {
  const quotes: string[] = [];
  const quoteRegex =
    /`([^`\r\n]+)`|~([^~\r\n]+)~|"([^"\r\n]+)"|(?<![a-zA-Z0-9])'([^'\r\n]+)'(?![a-zA-Z0-9])/g;

  const masked = input.replace(quoteRegex, (_full, bq, tq, dq, sq) => {
    const val = bq ?? tq ?? dq ?? sq;
    const idx = quotes.length;
    quotes.push(val);
    const isRawRegexToken = bq !== undefined || tq !== undefined;
    return isRawRegexToken ? `__R${idx}__` : `__Q${idx}__`;
  });

  return { masked, quotes };
}

export function unmaskQuotes(text: string, quotes: string[]): string {
  return text.replace(/__[QR](\d+)__/g, (_m, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return quotes[idx] ?? _m;
  });
}
