import { WrapperSpec } from './types';

export function resolveWrapperSpec(wrapperPhrase: string, quoted: string[]): WrapperSpec {
  const clean = wrapperPhrase.trim();

  if (/\b(?:html\s+)?(?:anchor\s+tags?|<a>(?:\s*tags?)?|<a\s+href)/i.test(clean)) {
    return {
      open: '<a href="$&">',
      close: '</a>',
      label: 'HTML <a> anchor tags',
      usesWholeMatch: true
    };
  }

  const tagMatch =
    clean.match(/^<([a-zA-Z][a-zA-Z0-9]*)>(?:\s*tags?)?$/i) ||
    clean.match(/\b<([a-zA-Z][a-zA-Z0-9]*)>\s*tags?\b/i);
  if (tagMatch) {
    const tag = tagMatch[1];
    return {
      open: `<${tag}>`,
      close: `</${tag}>`,
      label: `<${tag}> tags`
    };
  }

  if (/\bsingle\s+quotes?\b|\bapostrophes?\b/i.test(clean)) {
    return { open: "'", close: "'", label: 'single quotes' };
  }
  if (/\b(?:double\s+quotes?|quotation\s+marks?|quotes?)\b/i.test(clean)) {
    return { open: '"', close: '"', label: 'double quotes' };
  }
  if (/\bbackticks?\b/i.test(clean)) {
    return { open: '`', close: '`', label: 'backticks' };
  }
  if (/\b(?:parentheses|parenthesis|parens?|round\s+brackets?)\b/i.test(clean)) {
    return { open: '(', close: ')', label: 'parentheses' };
  }
  if (/\b(?:square\s+brackets?|brackets?)\b/i.test(clean)) {
    return { open: '[', close: ']', label: 'square brackets' };
  }
  if (/\b(?:curly\s+braces?|braces?|curly\s+brackets?)\b/i.test(clean)) {
    return { open: '{', close: '}', label: 'curly braces' };
  }
  if (/\b(?:angle\s+brackets?|chevrons?)\b/i.test(clean)) {
    return { open: '<', close: '>', label: 'angle brackets' };
  }
  if (/\b(?:asterisks?|stars?|markdown\s+bold)\b/i.test(clean)) {
    const isBold = /\bbold\b|\bdouble\b/i.test(clean);
    return { open: isBold ? '**' : '*', close: isBold ? '**' : '*', label: isBold ? '**' : '*' };
  }
  if (/\bunderscores?\b/i.test(clean)) {
    return { open: '_', close: '_', label: 'underscores' };
  }

  if (quoted.length > 0) {
    const q = quoted[quoted.length - 1];
    return { open: q, close: q, label: `'${q}'` };
  }

  const stripped = clean.replace(/^(?:a|an|the)\s+/i, '');
  return { open: stripped || '"', close: stripped || '"', label: stripped || 'quotes' };
}
