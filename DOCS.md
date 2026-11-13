# RegExpresso Official Documentation

RegExpresso is a deterministic, zero-latency natural language to regular expression compiler and multi-caret execution engine for Visual Studio Code.

Unlike AI-assisted tools that send code snippets to remote servers and suffer from network latency or hallucinated syntax, RegExpresso uses a modular, clause-decomposing linguistic parser (`clauseParser` → `targetResolver` → `lexicon` → `nlParser` → `executor`) that compiles queries locally on every keystroke.

---

## Table of Contents

1. [Interface & Workflow](#1-interface--workflow)
2. [Macro Intents & Command Grammar](#2-macro-intents--command-grammar)
3. [Power-User Shorthands & Concise Syntax](#3-power-user-shorthands--concise-syntax)
4. [Character Class, Symbol & Entity Lexicon](#4-character-class-symbol--entity-lexicon)
5. [Literals: Quoted vs. Unquoted](#5-literals-quoted-vs-unquoted)
6. [Quantifiers & Ranges](#6-quantifiers--ranges)
7. [Boundaries, Line Filters & Positional Anchors](#7-boundaries-line-filters--positional-anchors)
8. [Booleans, Alternations & Negated Character Sets](#8-booleans-alternations--negated-character-sets)
9. [Lookaheads, Lookbehinds & Exclusion Clauses](#9-lookaheads-lookbehinds--exclusion-clauses)
10. [Delimited & Inner Text Extraction](#10-delimited--inner-text-extraction)
11. [Case Conversion & Naming Convention Pipelines](#11-case-conversion--naming-convention-pipelines)
12. [Multi-Step Pipelines (`and then`)](#12-multi-step-pipelines-and-then)
13. [Execution Modes & Multi-Caret Workflows](#13-execution-modes--multi-caret-workflows)
14. [Impossible Regex Guardrails & Native Workarounds](#14-impossible-regex-guardrails--native-workarounds)

---

## 1. Interface & Workflow

### Opening the Bar
- **Keyboard Shortcut**: `Alt+F` (Windows/Linux) or `Cmd+Alt+F` (macOS) when an editor has focus.
- **Command Palette**: `RegExpresso: Natural Language Find & Replace` (`regularexpresso.openBar`).

### Live Editor Feedback
As you type a query into the RegExpresso bar:
- **Match Highlighting**: Every matched span in the active editor is highlighted in real time using your theme's `editor.findMatchHighlightBackground` and `editor.findMatchBorder` colors.
- **Inline Replacement Previews**: Whenever a query includes a replacement or deletion, an inline code-lens style annotation (`→ replacement`, `→ ∅ (deleted)`, `→ ⇥` for tabs, `→ ↵` for newlines, or `→ ····` for spaces) appears immediately after each match in the editor so you can verify the exact output before committing.

### Continuous Execution, History & Per-Tab State Persistence
- Pressing **`Enter`** executes the selected action and **keeps the RegExpresso bar open**, clearing the input box so you can immediately type a follow-up operation.
- **Per-Tab Persistent State**: RegExpresso tracks whether its UI bar is active/open and stores the current query text independently for each editor tab for the lifetime of the IDE session. Switching between tabs (whether by clicking a tab with the mouse or pressing `Ctrl+Tab` / `Ctrl+Shift+Tab`) automatically restores the target tab's RegExpresso visibility and query text.
- Pressing **`Shift+Up`** and **`Shift+Down`** (or clicking the `↑` / `↓` buttons in the top-right corner of the bar) cycles through all queries submitted during the current VS Code session. Any unsubmitted draft text currently in the box is preserved when you cycle back down.
- Pressing **`Esc`** closes the RegExpresso bar for the current tab and returns keyboard focus to the editor (leaving any multi-caret selections active).

---

## 2. Macro Intents & Command Grammar

RegExpresso classifies every query into one of 8 macro-level intents based on the leading verb or sentence structure, decomposes the sentence into semantic clauses, and delegates to a specialized handler.

### 2.1 `FIND` (Match / Select / Locate)
Triggered by leading verbs `find`, `fnd`, `match`, `select`, `sel`, `get`, `locate`, `search for`, `highlight`, `grab`, `give me`, `show`, `pick`, `identify`, `capture`, **or by omitting the verb altogether** and typing a noun phrase directly.
- **Examples**:
  - `select slashes` → `/[/\\]/g`
  - `find three to five digits in a row without letters attached` → `/\b\d{3,5}\b/g`
  - `emails` → `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`

### 2.2 `DELETE` & `TRIM` (Remove / Strip / Trim)
Triggered by leading verbs `delete`, `del`, `remove`, `rm`, `strip`, `erase`, `clear`, `clr`, `drop`, `omit`, `eliminate`, `wipe`, `scrub`, `get rid of`, `collapse`, or `trim`, as well as compound queries like `find <X> and delete it/them/the second one`.

The dedicated **`trim`** handler supports removing blank lines, stripping leading/trailing whitespace, or trimming specific characters/classes from the start, end, or both ends of each line:
- **Examples**:
  - `Delete all the blank lines.` → Find: `/^\s*\n/gm`, Replace: `""`
  - `trim blanks` / `trim empties` / `trim blank lines` → Find: `/^\s*\r?\n/gm`, Replace: `""`
  - `trim` / `trim lines` / `trim whitespace` → Find: `/^[ \t]+|[ \t]+$/gm`, Replace: `""`
  - `trim leading` / `trim leading spaces` → Find: `/^[ \t]+/gm`, Replace: `""`
  - `trim trailing` / `trim trailing spaces` → Find: `/[ \t]+$/gm`, Replace: `""`
  - `trim leading x` / `trim leading zeros` → Find: `/^x+/gm` / `/^0+/gm`, Replace: `""`
  - `trim trailing y` / `trim trailing ;` → Find: `/y+$/gm` / `/;+$/gm`, Replace: `""`
  - `trim quotes` → Find: `/^["']+|["']+$/gm`, Replace: `""`
  - `delete quotes` / `rm quotes` → Find: `/["']/g`, Replace: `""`
  - `Find any word that is accidentally typed twice in a row and delete the second one.` → Find: `/\b([a-zA-Z]+)\s+\1\b/gi`, Replace: `"$1"`

### 2.3 `REPLACE` (Change / Convert / Substitute)
Triggered by compound constructions:
- `replace <X> with <Y>` / `rep <X> with <Y>`
- `change <X> to <Y>` / `chg <X> to <Y>`
- `convert <X> to/into <Y>`
- `turn <X> into <Y>`
- `substitute <X> with <Y>` or `substitute <Y> for <X>` (`sub <Y> for <X>`)
- `find <X> and replace with <Y>`
- `<X> -> <Y>` or `<X> => <Y>`

Both `<X>` (target) and `<Y>` (replacement) are resolved independently and can be any combination of character classes, named symbols, structural patterns, quoted literals, or unquoted literals.
- **Examples**:
  - `replace slashes with tabs` → Find: `/[/\\]/g`, Replace: `\t`
  - `replace tabs with slashes` → Find: `/\t/g`, Replace: `/`
  - `replace words with tabs` → Find: `/\w+/g`, Replace: `\t`
  - `replace tabs with 4 spaces` → Find: `/\t/g`, Replace: `    `
  - `replace X with Y` → Find: `/X/g`, Replace: `Y`
  - `Change all whole words that say 'cat' to 'dog', but don't touch words like 'category' or 'scat'.` → Find: `/\bcat\b/g`, Replace: `dog`
  - `Turn all Markdown links [text](url) into HTML links <a href="url">text</a>.` → Find: `/\[([^\]]+)\]\(([^)]+)\)/g`, Replace: `<a href="$2">$1</a>`
  - `Convert MM/DD/YYYY dates to YYYY-MM-DD` → Find: `/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g`, Replace: `$3-$1-$2`

### 2.4 `WRAP` (Surround / Enclose / Quote)
Triggered by:
- `wrap <target> in/with <wrapper>`
- `surround <target> with <wrapper>`
- `enclose <target> in <wrapper>`
- `put/add <wrapper> around <target>`

Supported wrappers include `quotation marks` / `double quotes` / `quotes` (`"..."`), `single quotes` (`'...'`), `backticks` (`` `...` ``), `parentheses` / `parens` (`(...)`), `square brackets` / `brackets` (`[...]`), `curly braces` / `braces` (`{...}`), `angle brackets` (`<...>`), `HTML anchor tag` (`<a href="$&">$&</a>`), any HTML tag like `<div>` or `<span>` (`<tag>$1</tag>`), `markdown bold` (`**$1**`), `asterisks` (`*$1*`), `underscores` (`_$1_`), or any custom literal.
- **Examples**:
  - `Put quotation marks around every item in this column.` → Find: `/^(.+)$/gm`, Replace: `"$1"`
  - `Wrap every URL link in an HTML anchor tag without losing the original text.` → Find: `/https?:\/\/[^\s"'<>]+/g`, Replace: `<a href="$&">$&</a>`
  - `wrap words in parentheses` → Find: `/(\w+)/g`, Replace: `($1)`
  - `put single quotes around numbers` → Find: `/(\d+)/g`, Replace: `'$1'`

### 2.5 `INSERT_ADD` & `ENSURE` (Append / Prepend / Conditional Insertion)
Triggered by:
- **`ensure` (Conditional Insertion — "apply only if not already present")**:
  - `ensure trailing <Y> [per line]` (e.g., `ensure trailing semicolons`, `ensure trailing semicolon per line`, `ensure trailing ;`)
  - `ensure leading <Y> [per line]` (e.g., `ensure leading //`, `ensure leading # per line`)
  - `ensure every line ends/starts with <Y>`
  - `ensure <Y> before/after <X>` (e.g., `ensure a space after commas`)
- **Unconditional or Conditional `add` / `insert` / `append` / `prepend` / `put`**:
  - `add/append/put/insert <Y> to/at the end of <X>` / `at each line ending` / `add trailing <Y>`
  - `add/prepend/put/insert <Y> to/at the start/beginning of <X>` / `at each line start` / `add leading <Y>`
  - `insert/add/put <Y> before/in front of <X>`
  - `insert/add/put <Y> after/following <X>`

When any `add`/`insert` query includes `that doesn't have one`, `without one`, `if missing`, or `if needed`, it automatically routes to the `ENSURE` handler with CRLF-safe negative lookbehind/lookahead assertions.
- **Examples**:
  - `Add a semicolon to the end of every line that doesn't have one.` / `add ; at the end of each line without one` / `add a semicolon at each line ending without one` / `ensure trailing ;` → Find: `/^([^\r\n]*?\S)(?<!;)([ \t]*)$/gm`, Replace: `$1;$2`
  - `ensure leading //` → Find: `/^([ \t]*)(?!\/\/)(\S[^\r\n]*)$/gm`, Replace: `$1//$2`
  - `ensure a space after commas` → Find: `/(,)(?! )/g`, Replace: `$1 `
  - `add ; to end per` / `app ; per` → Find: `/^([^\r\n]*\S[^\r\n]*)$/gm`, Replace: `$1;`
  - `ins // at start per` / `prep // per` → Find: `/^([^\r\n]*\S[^\r\n]*)$/gm`, Replace: `//$1`
  - `add a dollar sign before every number` → Find: `/(\d+)/g`, Replace: `$$$1`

### 2.6 `SWAP_REORDER` (Swap / Reverse Pair)
Triggered by `swap`, `reverse`, `switch`, `flip`, or `exchange` on delimited pairs (comma, colon, semicolon, equals sign, slash, hyphen, or space).
- **Examples**:
  - `Swap first and last names in this comma-separated list.` → Find: `/^(\w+),\s*(\w+)$/gm`, Replace: `$2, $1`
  - `swap key and value separated by colon` → Find: `/^(\w+)\s*:\s*(\w+)$/gm`, Replace: `$2: $1`

### 2.7 `CASE_TRANSFORM` (Capitalize / Uppercase / Lowercase / Identifier Styles)
Triggered by `capitalize` (`cap`), `uppercase` (`upper`), `lowercase` (`lower`), `uncapitalize` (`uncap`), `make <X> <CaseMode>`, or `convert/change/replace <X> to/with <CaseMode>`.
- **Examples**:
  - `Capitalize the very first letter of every line.` (or `cap first per`) → Find: `/^(.)/gm`, Replace: `\U$1`
  - `Make all markdown section headers (# header) Title Case.` → Find: `/^(#+\s*)([a-z])/gm`, Replace: `$1\U$2`
  - `Convert all SCREAMING_SNAKE_CASE variable names into camelCase.` → 2-Step Pipeline (`([A-Z]+)_([A-Z])([A-Z]*)` → `\L$1\U$2\E\L$3`, then `_([A-Z])([A-Z]*)` → `\U$1\E\L$2`)
  - `replace caps with lowercase` / `make caps lowercase` → Find: `/([A-Z]+)/g`, Replace: `\L$1`
  - `replace lowercase with caps` / `make lowercase uppercase` → Find: `/([a-z]+)/g`, Replace: `\U$1`

### 2.8 `EXTRACT_CAPTURE` (Named Capture Groups)
Triggered by `extract/capture/parse <part> into named variables/groups`.
- **Examples**:
  - `Extract the domain part of an email address into named variables.` → Find: `/(?<user>[a-zA-Z0-9._%+-]+)@(?<domain>[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g`, Replace: `Domain: $<domain>, User: $<user>`

---

## 3. Power-User Shorthands & Concise Syntax

### 3.1 Verb Shorthands
| Full Verb | Shorthands | Default Primary Action |
| :--- | :--- | :--- |
| `delete` / `remove` / `clear` | `del`, `rm`, `clr` | Execute Replace All (with `""`) |
| `select` / `find` | `sel`, `get`, `fnd` | Select All Matches with Multi-Caret |
| `replace` / `substitute` / `change` | `rep`, `sub`, `chg` | Execute Replace All |
| `insert` / `append` / `prepend` | `ins`, `app`, `prep` | Execute Replace All |
| `capitalize` / `uppercase` / `lowercase` | `cap`, `uncap`, `upper`, `lower` | Execute Replace All |
| `copy` | `cp` | Copy All Matches to Clipboard |

### 3.2 The `per` / `per line` / `per-line` Suffix
Instead of typing `of every line`, `on each line`, or `in all lines`, end your query with **`per`**, **`per line`**, or **`per-line`**:
- `del first 4 chars per` → `/^.{4}/gm`
- `sel last word per` → `/\w+$/gm`
- `sel last 3 digits per-line` → `/\d{3}$/gm`
- `cap first per` → `/^(.)/gm` → `\U$1`
- `add ; to end per` / `app ; per` → `/^(.+)$/gm` → `$1;`
- `ins # at start per` / `prep # per` → `/^(.+)$/gm` → `#$1`
- `find numbers at start per` → `/^\d+/gm`

### 3.3 Omitted `chars` & Unquoted `.` / `*` Wildcard Shorthand
When targeting the `first` or `last` N characters per line, or quantifying any character, you do not need to type `characters` or `chars`:
- **Omit the unit entirely** when `per` is present:
  - `remove last 4 per` or `rm last 4 per` → `/.{4}$/gm`
  - `del first 2 per` → `/^.{2}/gm`
  - `del first per` → `/^./gm`
- **Or use unquoted `.` or `*`** as a shorthand for `chars`:
  - `rm last 4 . per` or `rm last 4 * per` → `/.{4}$/gm`
  - `find 4 .` or `find 4 *` → `/.{4}/g`
- **Quoted `"."` and `"*"`** always match the literal period (`\.`) and literal asterisk (`\*`):
  - `find "."` → `/\./g`
  - `find "*"` → `/\*/g`

---

## 4. Character Class, Symbol & Entity Lexicon

Every entry below can be used in **Find/Select**, **Delete**, **Replace (Target or Replacement)**, **Wrap**, **Insert**, **Boolean Alternations (`A or B`)**, **Negated Classes (`not A, B, or C`)**, and **Lookarounds (`followed by A`, `preceded by B`)**:

### 4.1 Whitespace & Line Breaks
| Natural Language Terms | Find Pattern | Single Unit (Quantified) | Replace Literal |
| :--- | :--- | :--- | :--- |
| `blank lines`, `empty lines`, `whitespace-only lines` | `^\s*\n` (`gm`) | `^\s*\n` | `\n` |
| `leading and trailing whitespace` (or `trim lines`) | `^[ \t]+\|[ \t]+$` (`gm`) | `[ \t]` | *(empty)* |
| `leading whitespace`, `leading spaces`, `indentation` | `^[ \t]+` (`gm`) | `[ \t]` | *(empty)* |
| `trailing whitespace`, `trailing spaces` | `[ \t]+$` (`gm`) | `[ \t]` | *(empty)* |
| `multiple spaces`, `extra spaces`, `double spaces` | ` {2,}` | ` ` | ` ` |
| `tabs`, `tab`, `tab characters` | `\t` | `\t` | `\t` |
| `spaces`, `space`, `blank spaces` | ` +` | ` ` | ` ` |
| `horizontal whitespace`, `spaces or tabs` | `[ \t]+` | `[ \t]` | ` ` |
| `whitespace`, `white space` | `\s+` | `\s` | ` ` |
| `non-whitespace`, `non-spaces` | `\S+` | `\S` | — |
| `newlines`, `newline`, `line breaks`, `crlf`, `lf` | `\r?\n` | `\r?\n` | `\n` |

### 4.2 Slashes, Quotes, Brackets & Punctuation
| Natural Language Terms | Find Pattern | Replace Literal |
| :--- | :--- | :--- |
| `slashes`, `slash`, `any slash` | `[/\\]` | `/` |
| `forward slashes`, `forward slash` | `/` | `/` |
| `backslashes`, `backslash`, `back slash` | `\\` | `\\` |
| `quotes`, `quotation marks`, `quote marks` | `["']` | `"` |
| `double quotes`, `double quotation marks` | `"` | `"` |
| `single quotes`, `apostrophes` | `'` | `'` |
| `backticks`, `grave accents` | `` ` `` | `` ` `` |
| `smart quotes`, `curly quotes` | `[“”‘’]` | `"` |
| `strings`, `string`, `quotations`, `quotation`, `quoted strings` (includes surrounding quotes) | `(?:"[^"\r\n]*"\|'[^'\r\n]*')` | `""` |
| `double-quoted strings` / `single-quoted strings` | `"[^"\r\n]*"` / `'[^'\r\n]*'` | `""` / `''` |
| `periods`, `period`, `dots`, `dot`, `full stops` | `\.` | `.` |
| `commas`, `comma` | `,` | `,` |
| `semicolons`, `semicolon` | `;` | `;` |
| `colons`, `colon` | `:` | `:` |
| `underscores`, `underscore` | `_` | `_` |
| `hyphens`, `hyphen`, `dashes`, `dash`, `minus signs` | `-` | `-` |
| `parentheses`, `parenthesis`, `parens`, `round brackets` | `[()]` | `()` |
| `opening parenthesis` / `closing parenthesis` | `\(` / `\)` | `(` / `)` |
| `brackets`, `square brackets` | `[\[\]]` | `[]` |
| `opening bracket` / `closing bracket` | `\[` / `\]` | `[` / `]` |
| `braces`, `curly braces`, `curly brackets` | `[{}]` | `{}` |
| `opening brace` / `closing brace` | `\{` / `\}` | `{` / `}` |
| `angle brackets`, `chevrons` | `[<>]` | `<>` |
| `exclamation marks`, `bangs` | `!` | `!` |
| `question marks` | `\?` | `?` |
| `asterisks`, `stars` | `\*` | `*` |
| `plus signs`, `plus` | `\+` | `+` |
| `equals signs`, `equals` | `=` | `=` |
| `hashes`, `hashtags`, `pound signs`, `octothorpes` | `#` | `#` |
| `dollar signs`, `dollars` | `\$` | `$$` (literal `$`) |
| `percent signs`, `percents` | `%` | `%` |
| `ampersands`, `and signs` | `&` | `&` |
| `pipes`, `vertical bars` | `\|` | `\|` |
| `tildes` | `~` | `~` |
| `carets`, `circumflex` | `\^` | `^` |
| `at signs`, `at symbols` | `@` | `@` |
| `punctuation`, `punctuation marks` | `[.,!?;:'"()\[\]{}\-–—/\\]` | — |
| `symbols`, `special characters` | `[^\w\s]` | — |

### 4.3 Character Classes, Case Categories & Identifiers
| Natural Language Terms | Find Pattern | Single Unit (Quantified) |
| :--- | :--- | :--- |
| `caps`, `capitals`, `capital letters`, `uppercase`, `uppercase letters` | `[A-Z]+` | `[A-Z]` |
| `uppercase words`, `all-caps words`, `acronyms` | `\b[A-Z]+\b` | `[A-Z]` |
| `lowercase`, `lowercase letters`, `small letters` | `[a-z]+` | `[a-z]` |
| `lowercase words` | `\b[a-z]+\b` | `[a-z]` |
| `capitalized words`, `title case words` | `\b[A-Z][a-z]+\b` | `\b[A-Z][a-z]+\b` |
| `letters`, `alphabetical characters`, `alpha` | `[a-zA-Z]+` | `[a-zA-Z]` |
| `vowels` | `[aeiouAEIOU]` | `[aeiouAEIOU]` |
| `consonants` | `[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]` | `[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]` |
| `digits` | `\d+` | `\d` |
| `numbers`, `integers`, `whole numbers` | `\d+` | `\d` |
| `decimals`, `decimal numbers`, `floats`, `floating-point numbers` | `\b\d+\.\d+\b` | `\d+\.\d+` |
| `non-digits`, `non-numeric` | `\D+` | `\D` |
| `hex`, `hexadecimal`, `hex numbers`, `hex codes` | `\b[0-9a-fA-F]+\b` | `[0-9a-fA-F]` |
| `alphanumeric`, `letters and numbers` | `[a-zA-Z0-9]+` | `[a-zA-Z0-9]` |
| `words`, `word tokens`, `word characters` | `\w+` | `[a-zA-Z]` |
| `non-words`, `non-word characters` | `\W+` | `\W` |
| `camelCase`, `camelCase identifiers` | `\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\b` | — |
| `PascalCase` | `\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b` | — |
| `snake_case` | `\b[a-z0-9]+(?:_[a-z0-9]+)+\b` | — |
| `SCREAMING_SNAKE_CASE`, `UPPER_SNAKE_CASE` | `\b[A-Z0-9]+(?:_[A-Z0-9]+)+\b` | — |
| `kebab-case`, `dash-case` | `\b[a-z0-9]+(?:-[a-z0-9]+)+\b` | — |

### 4.4 Structured Entities
| Natural Language Terms | Find Pattern |
| :--- | :--- |
| `emails`, `email addresses` | `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` |
| `urls`, `links`, `web links`, `http links` | `https?://[^\s"'<>]+` |
| `ip addresses`, `ipv4`, `ips` | `\b(?:\d{1,3}\.){3}\d{1,3}\b` |
| `four-digit years`, `4-digit years`, `years` | `\b(19\d{2}\|20\d{2})\b` |
| `iso dates`, `YYYY-MM-DD` | `\b\d{4}-\d{2}-\d{2}\b` |
| `dates` | `\b(?:\d{4}-\d{2}-\d{2}\|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b` |
| `phone numbers`, `telephone numbers` | `\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b` |
| `uuids`, `guids` | `\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b` |
| `html tags`, `xml tags`, `tags` | `<[^>]+>` |
| `markdown links` | `\[([^\]]+)\]\(([^)]+)\)` |
| `markdown headers`, `section headers` | `^(#+\s*)(.+)$` (`gm`) |
| `comments`, `line comments` | `//.*$` (`gm`) |
| `duplicate words`, `words typed twice in a row` | `\b([a-zA-Z]+)\s+\1\b` (`gi`) |
| `consecutive duplicate lines` | `^(.*)(\r?\n\1)+$` (`gm`) |

---

## 5. Literals & Direct Inline Regular Expressions

### 5.1 Quoted vs. Unquoted Literals
You do **not** need to wrap literal search or replacement strings in quotes unless the literal collides with a reserved keyword (such as `words`, `tabs`, `slashes`, `numbers`, `.`, or `*`):
- `find foo` and `find "foo"` both compile to `/foo/g`.
- `replace X with Y` and `replace "X" with "Y"` both compile to Find `/X/g`, Replace `Y`.
- `delete TODO` compiles to Find `/TODO/g`, Replace `""`.
- To match a literal keyword word (for example, the literal English word `"tabs"` or `"numbers"` or `"."`), enclose it in double or single quotes (`"tabs"`, `'numbers'`, `"."`) or prefix it with `the word` (`find the word tabs` → `/\btabs\b/g`).
- Special regex metacharacters inside double- or single-quoted literals (such as `"."`, `"*"`, `"$100"`) are automatically escaped.

### 5.2 Direct Regular Expressions, Character Classes & Escape Sequences
Power users who know regular expressions can include character classes, escape sequences, and regex patterns directly inside RegExpresso queries:
- **Direct Unwrapped Regexes & Shorthands**: Common escapes (`\w`, `\W`, `\d`, `\D`, `\s`, `\S`, `\t`, `\n`), quantified shorthands (`\w+`, `\d{2,4}`, `\s*`), character classes (`[a-z0-9_]+`, `[^,\r\n]+`), and groups (`(\w+)`) can be typed directly without delimiters:
  - `select \w+` → `/\w+/g`
  - `match \w+ and replace it with tabs` / `replace \w+ with tabs` → Find: `/\w+/g`, Replace: `\t`
  - `replace numbers with \t\t` → Find: `/\d+/g`, Replace: `\t\t` (previews in-editor as `→ ⇥⇥`)
  - `find [a-z0-9_]+` → `/[a-z0-9_]+/g`
  - `delete \d{2,4}` → Find: `/\d{2,4}/g`, Replace: `""`
  - `select 3 \w` / `select 3 [a-f0-9]` → `/\w{3}/g` / `/[a-f0-9]{3}/g`
- **Backtick (`` `...` ``), Tilde (`~...~`), or Slash (`/.../`) Delimited Regexes**: For arbitrary or multi-part regular expressions (including spaces, alternations, or capture groups), wrap the pattern in backticks, tildes, or forward slashes:
  - ``select `\w+` `` or `select ~\w+~` or `select /\w+/` → `/\w+/g`
  - ``replace `\w+` with `\t` `` → Find: `/\w+/g`, Replace: `\t`
  - `replace ~\d{2,4}~ with "#"` → Find: `/\d{2,4}/g`, Replace: `#`
  - ``match `(\w+)=(\w+)` and replace it with `$2=$1` `` → Find: `/(\w+)=(\w+)/g`, Replace: `$2=$1`

---

## 6. Quantifiers & Ranges

Quantifiers can be written using digits (`3`, `5`) or English number words (`one` through `twenty`) and attach to the atomic `singleUnitPattern` of the target:
- **Exact Count**: `4 digits` (`\d{4}`), `exactly 3 letters` (`[a-zA-Z]{3}`), `4 .` (`.{4}`), `5-letter words` (`\b[a-zA-Z]{5}\b`), `4-digit numbers` (`\b\d{4}\b`)
- **Bounded Range**: `three to five digits` (`\d{3,5}`), `between 2 and 4 letters` (`[a-zA-Z]{2,4}`), `words with 3 to 5 letters` (`\b[a-zA-Z]{3,5}\b`)
- **Lower Bound**: `at least 3 letters` (`[a-zA-Z]{3,}`), `2 or more spaces` (` {2,}`), `minimum of 4 digits` (`\d{4,}`)
- **Upper Bound**: `at most 3 digits` (`\d{1,3}`), `up to 4 letters` (`[a-zA-Z]{1,4}`), `no more than 2 spaces` (` {1,2}`)
- **Standard Quantifiers**: `one or more <X>` (`+`), `zero or more <X>` (`*`), `optional <X>` / `zero or one <X>` (`?`)
- **Replacement Quantifiers**: In replacement clauses, `<N> <token>` expands the replacement literal `N` times (e.g., `replace tabs with 4 spaces` → `'    '`, `replace newlines with 2 newlines` → `'\n\n'`).

---

## 7. Boundaries, Line Filters & Positional Anchors

### 7.1 Word & Non-Word Boundaries (`\b`, `\B`)
- **Whole-Word Matching (`\b...\b`)**: Triggered by `whole word(s)`, `exact word(s)`, `standalone`, `without letters attached`, `every instance of <word>`, or `the word <X>`.
  - `change all whole words that say cat to dog` → `/\bcat\b/g` → `dog`
- **Inner-Word / Non-Word Boundary (`\B...\B`)**: Triggered by `in the middle of a word` or `inside a word`.
  - `Match characters that are NOT alphanumeric, spaces, or underscores, but only when they appear in the middle of a word.` → `/\B[^\w\s]\B/g`

### 7.2 Word, String & Line Affix Filters
- `words starting with <X>` → `\b<X>[a-zA-Z0-9_]*\b`
- `words ending in/with <X>` → `\b[a-zA-Z0-9_]*<X>\b`
- `words containing <X>` → `\b[a-zA-Z0-9_]*<X>[a-zA-Z0-9_]*\b`
- `strings starting with <X>` / `quotations starting with <X>` → `(?:"<X>[^"\r\n]*"|'<X>[^'\r\n]*')`
- `strings ending with <X>` / `quotations ending with <X>` → `(?:"[^"\r\n]*<X>"|'[^'\r\n]*<X>')`
- `strings containing <X>` / `quotations containing <X>` → `(?:"[^"\r\n]*<X>[^"\r\n]*"|'[^'\r\n]*<X>[^'\r\n]*')`
- `lines starting with <X>` → `^[ \t]*<X>.*$` (`gm`)
- `lines ending with <X>` → `^.*<X>[ \t]*$` (`gm`)
- `lines containing <X>` → `^.*<X>.*$` (`gm`)
- `lines not containing <X>` / `lines without <X>` → `^(?!.*<X>).+$` (`gm`)
  *(Note: When used with `delete` / `rm`, whole-line filters automatically append `\r?\n?` so deleting matching lines collapses the line break cleanly.)*

### 7.3 Positional Line Slicing & `leading` / `trailing` Modifiers
- `leading <X>` (e.g., `find leading digits`, `replace leading // with #`, `trim leading zeros`) → anchors `<X>` to the start of the line (`^<X>`)
- `trailing <Y>` (e.g., `select trailing digits`, `delete trailing ;`, `ensure trailing ;`, `trim trailing commas`) → anchors `<Y>` to the end of the line (`<Y>$`)
- `first <N> [chars|letters|digits|.|\*] per` → `^.{N}` (`gm`)
- `last <N> [chars|letters|digits|.|\*] per` → `.{N}$` (`gm`)
- `first word per` → `^\w+` (`gm`)
- `last word per` → `\w+$` (`gm`)
- `everything after <X>` → `(?<=<X>).*$` (`gm`)
- `everything before <X>` → `^.*?(?=<X>)` (`gm`)

---

## 8. Booleans, Alternations & Negated Character Sets

### 8.1 Character Class Unions & Alternations (`or` / `and`)
When two or more character-class targets are joined by `or` or `and`, RegExpresso merges them into a single bracketed character class `[...]`:
- `select commas or colons` → `/[,:]/g`
- `delete commas and semicolons` → `/[,;]/g` → `""`

When multi-character words or patterns are joined by `or`:
- **US/UK & Single-Character Spelling Variants**: Automatically synthesizes optional (`?`) or single-index character sets (`[...]`).
  - `Match the exact word 'color' whether it's spelled the American way or British way ('colour').` → `/\bcolou?r\b/g`
  - `find gray or grey` → `/gr[ae]y/g`
- **General Alternation**: Wraps alternatives in a non-capturing group `(?:A|B)`.

### 8.2 Character Ranges & Negated Character Classes
- **Explicit Ranges**: `letters from a to m` (`/[a-m]/g`), `digits between 1 and 5` (`/[1-5]/g`)
- **Negated Classes**: `characters that are not <A, B, or C>` or `anything except <A>`
  - `characters that are NOT alphanumeric, spaces, or underscores` → `/[^\w\s]/g`
  - `anything except digits` → `/[^\d]+/g`

---

## 9. Lookaheads, Lookbehinds & Exclusion Clauses

RegExpresso supports arbitrary positive and negative lookarounds attached to any target using natural prepositions (`preceded by`, `after`, `following`, `behind`, `followed by`, `before`, `preceding`, `in front of`):

| Natural Language Phrasing | Compiled Assertion | Example Query | Compiled Regex |
| :--- | :--- | :--- | :--- |
| `preceded by <X>` / `after <X>` / `following <X>` / `behind <X>` | `(?<=<X>)` | `find quote preceded by s` / `find quote after s` | `/(?<=s)["']/g` |
| `not preceded by <X>` / `not after <X>` / `not behind <X>` | `(?<!<X>)` | `find quotes not after a backslash` | `/(?<!\\)["']/g` |
| `followed by <X>` / `before <X>` / `preceding <X>` / `in front of <X>` | `(?=<X>)` | `find quote followed by s` / `find quote before s` | `/["'](?=s)/g` |
| `not followed by <X>` / `not before <X>` / `isn't immediately followed by <X>` | `(?!<X>)` | `Find every instance of 'password' that isn't immediately followed by an equals sign or colon.` | `/\bpassword\b(?!\s*[:=])/g` |
| `but ignore <X>` / `excluding <X>` | `(?<!-)...(?!-)` or `(?!<X>)` | `Find all four-digit years in this text, but ignore dates that are already formatted inside ISO strings like 2024-11-04.` | `/(?<!-)\b(19\d{2}\|20\d{2})\b(?!-)/g` |

---

## 10. Delimited & Inner Text (`quoted`, `between`) vs. Full Delimited Blocks (`block` / `blocks`, `strings`)

RegExpresso distinguishes cleanly between selecting **only the inner content** between delimiters versus selecting **full delimited groups including their surrounding delimiters**:

- **Inner Content Only (Excludes Delimiters — `quoted`, `quoted text`, `inside`, `between`, `parenthesized`, `bracketed`, `braced`)**:
  Queries using `quoted` / `quoted text` (or `double-quoted`, `single-quoted`, `backticked`, `parenthesized`, `parenthetical`, `bracketed`, `braced`, `angle-bracketed`), `inside`, `between`, `within`, or `enclosed in` use lookbehind and lookahead assertions so that `Select All Matches`, `Delete`, and `Replace` operate strictly on the text *between* the delimiters without touching the delimiters themselves:
  - `select quoted` / `select quoted text` / `select text inside quotation marks` / `select between quotes` / `select inside quotes` → `/((?<=^(?:[^"\r\n]*"[^"\r\n]*")*[^"\r\n]*")[^"\r\n]+(?=")|(?<=^(?:[^'\r\n]*'[^'\r\n]*')*[^'\r\n]*')[^'\r\n]+(?='))/gm` *(even-pair lookbehind ensures gaps between multiple strings on the same line are never matched)*
  - `select double-quoted text` / `select inside double quotes` → `/(?<=^(?:[^"\r\n]*"[^"\r\n]*")*[^"\r\n]*")[^"\r\n]+(?=")/gm`
  - `select single-quoted text` / `select inside single quotes` → `/(?<=^(?:[^'\r\n]*'[^'\r\n]*')*[^'\r\n]*')[^'\r\n]+(?=')/gm`
  - `select backticked text` / `select inside backticks` → `/(?<=^(?:[^`\r\n]*`[^`\r\n]*`)*[^`\r\n]*`)[^`\r\n]+(?=`)/gm`
  - `select parenthesized` / `select parenthesized text` / `select inside parentheses` / `select between parens` → `/(?<=\()[^)\r\n]+(?=\))/g`
  - `select bracketed` / `select bracketed text` / `select inside square brackets` / `select between brackets` → `/(?<=\[)[^\]\r\n]+(?=\])/g`
  - `select braced` / `select braced text` / `select inside curly braces` / `select between braces` → `/(?<=\{)[^}\r\n]+(?=\})/g`
  - `select angle-bracketed text` / `select inside angle brackets` → `/(?<=<)[^>\r\n]+(?=>)/g`
  - `find text between <A> and <B>` → `/(?<=<A>)[^\r\n]+?(?=<B>)/g`
- **Full Delimited Groups (Includes Surrounding Delimiters — `block` / `blocks`, `strings`, `quotations`)**:
  Use the **`block` / `blocks`** keyword with any delimiter type (or **`strings` / `quotations`** for quoted strings) to match the entire group *including* its opening and closing delimiters:
  - `select quotation mark blocks` / `select quote blocks` / `select strings` / `select quotations` → `/(?:"[^"\r\n]*"|'[^'\r\n]*')/g`
  - `select double quote blocks` / `select single quote blocks` → `/"[^"\r\n]*"/g` / `/'[^'\r\n]*'/g`
  - `select backtick blocks` → `` /`[^`\r\n]*`/g ``
  - `select bracket blocks` / `select square bracket blocks` / `select blocks in brackets` → `/\[[^\]\r\n]*\]/g`
  - `select brace blocks` / `select curly brace blocks` / `select blocks in braces` → `/\{[^}\r\n]*\}/g`
  - `select paren blocks` / `select parenthesis blocks` / `select blocks in parentheses` → `/\([^)\r\n]*\)/g`
  - `select angle bracket blocks` / `select chevron blocks` → `/<[^>\r\n]*>/g`
  - `select asterisk blocks` / `select pipe blocks` → `/\*[^*\r\n]*\*/g` / `/\|[^|\r\n]*\|/g`
  - `select blocks` (any `(...)`, `[...]`, or `{...}` block) → `/(?:\([^)\r\n]*\)|\[[^\]\r\n]*\]|\{[^}\r\n]*\})/g`
  - **Affix Filters on Blocks**: Combine `<delimiter> blocks` with `starting with`, `ending with`, `containing`, or `without`:
    - `select bracket blocks containing foo` → `/\[[^\]\r\n]*foo[^\]\r\n]*\]/g`
    - `delete brace blocks starting with a` → Find: `/\{a[^}\r\n]*\}/g`, Replace: `""`
    - `select quote blocks ending with x` / `select strings containing host` → `/(?:"[^"\r\n]*x"|'[^'\r\n]*x')/g` / `/(?:"[^"\r\n]*host[^"\r\n]*"|'[^'\r\n]*host[^'\r\n]*')/g`
- **HTML/XML Tags**:
  - `Find all text inside HTML tags, like <title>Home</title>, but only grab what's between the first opening and closing tag on the line` → Find: `/<([a-z]+)>(.*?)<\/\1>/gi`, Replace: `$2`

---

## 11. Case Conversion & Naming Convention Pipelines

RegExpresso includes a built-in Boost/Perl replacement evaluator supporting `\u` (uppercase next char), `\l` (lowercase next char), `\U` (uppercase block until `\E` or end), `\L` (lowercase block until `\E` or end), and `\E` (end case block).

| Conversion Request | Compiled Find | Compiled Replace |
| :--- | :--- | :--- |
| `Convert all SCREAMING_SNAKE_CASE variable names into camelCase.` | Step 1: `([A-Z]+)_([A-Z])([A-Z]*)`<br>Step 2: `_([A-Z])([A-Z]*)` | Step 1: `\L$1\U$2\E\L$3`<br>Step 2: `\U$1\E\L$2` |
| `convert snake_case to camelCase` | `_([a-zA-Z0-9])` | `\U$1` |
| `convert kebab-case to camelCase` | `-([a-z0-9])` | `\U$1` |
| `convert camelCase to snake_case` | `([a-z0-9])([A-Z])` | `$1_\L$2` |
| `convert camelCase to kebab-case` | `([a-z0-9])(?:_\|([A-Z]))` | `$1-\L$2` |
| `Capitalize the very first letter of every line.` / `cap first per` | `^(.)` (`gm`) | `\U$1` |
| `Make all markdown section headers (# header) Title Case.` | `^(#+\s*)([a-z])` (`gm`) | `$1\U$2` |
| `make words Title Case` / `capitalize words` | `\b([a-zA-Z])([a-zA-Z]*)\b` | `\U$1\L$2` |
| `make caps lowercase` / `replace caps with lowercase` | `([A-Z]+)` | `\L$1` |
| `make lowercase uppercase` / `replace lowercase with caps` | `([a-z]+)` | `\U$1` |

---

## 12. Multi-Step Pipelines (`and then`)

You can chain any two RegExpresso commands into a sequential multi-step pipeline by connecting them with **`and then`**:
- `rep slashes with tabs and then delete blank lines`
  - **Step 1**: `/[/\\]/g` → `\t`
  - **Step 2**: `/^\s*\n/gm` → `""`
- `trim lines and then replace multiple spaces with a single space`
  - **Step 1**: `/^[ \t]+|[ \t]+$/gm` → `""`
  - **Step 2**: `/ {2,}/g` → `" "`

---

## 13. Execution Modes & Multi-Caret Workflows

When a query compiles, you can choose how to apply the result using `Up` / `Down` and `Enter`:

1. **Execute Replace All (`replace-all`)**: Runs all steps in the compiled pipeline across the document in a single undoable edit transaction.
2. **Select All Matches with Multi-Caret (`select-matches`)**: Creates an individual `vscode.Selection` spanning each match. Type immediately to overwrite all matches in parallel, or invoke commands from extensions like *Text Power Tools*.
3. **Place Carets at Start of Matches (`carets-at-start`)**: Collapses each selection to `match.start` so you can type prefixes in parallel. Can be pre-selected by typing `"place carets before <target>"`.
4. **Place Carets at End of Matches (`carets-at-end`)**: Collapses each selection to `match.end` so you can type suffixes in parallel. Can be pre-selected by typing `"place carets after <target>"`.
5. **Select Capture Group `$1` Only (`select-group-1`)**: Places multi-caret selections strictly around the first capture group (`$1`) inside each match (e.g., selecting only the text inside parentheses or quotes while leaving the surrounding delimiters unselected).
6. **Send to Native VS Code Find/Replace Widget (`open-in-native-find`)**: Opens VS Code's built-in `Ctrl+F` / `Ctrl+H` box populated with the compiled regex, replacement string, and case-sensitivity flags.
7. **Extract All Matches to New Buffer (`extract-to-new-file`)**: Opens a new side-by-side editor containing all matched substrings joined by newlines.
8. **Copy All Matches to Clipboard (`copy-matches`)**: Copies all matched substrings directly to the system clipboard. Can be pre-selected by starting a query with `copy` or `cp`.

---

## 14. Impossible Regex Guardrails & Native Workarounds

When a request exceeds the theoretical limits of ECMAScript regular expressions, RegExpresso detects the category, explains the limitation, and provides a native workaround when available:

| Category | Example Request | Why Pure Regex Cannot Do It | Built-In Workaround |
| :--- | :--- | :--- | :--- |
| **State Tracking & Sequential Numbering** | *"Number each line sequentially: 1., 2., 3."* | Finite automata are memoryless between matches and cannot increment a counter. | **One-Click Workaround**: Native edit inserting `1. `, `2. `, `3. ` at the start of every line. |
| **Dynamic Arithmetic & Percentages** | *"Increase every price by 15%"* | Regex treats digits as ASCII characters, not numbers, and has no math evaluator. | Advice to select numbers with `(?<=\$)\d+(?:\.\d{2})?` and pipe to an evaluated script. |
| **Modulo / Divisibility** | *"Match numbers divisible by 7"* | Arbitrary decimal divisibility cannot be practically represented without modulo arithmetic. | Advice to match `\b\d+\b` and filter programmatically. |
| **Arbitrary Recursive Nesting** | *"Find code blocks where curly braces `{ ... }` are balanced no matter how deep"* | JavaScript's regex engine lacks PCRE recursive subpatterns (`(?R)`). | **One-Click Workaround**: Executes VS Code native `Select to Bracket` (`editor.action.selectToBracket`). |
| **Global Sorting** | *"Sort all names in this file alphabetically"* | Regex is a local pattern matcher and cannot build comparative sorting networks across lines. | **One-Click Workaround**: Executes VS Code native `Sort Lines Ascending` (`editor.action.sortLinesAscending`). |
| **Global Scattered Deduplication** | *"Remove every duplicate line in this file, even if scattered pages apart"* | Single-pass regex cannot store a dynamic `Set` of seen lines across unbounded distances. | **One-Click Workaround (2-Step)**: Sorts lines ascending, then runs `^(.*)(\r?\n\1)+$` → `$1` to collapse duplicates. |
| **Temporal / Calendar Logic** | *"Change MM/DD/YYYY dates to the day of the week they landed on"* | Determining weekdays requires calendar/leap-year algorithms (e.g., Zeller's congruence). | Suggests structural date reformatting (`Convert MM/DD/YYYY dates to YYYY-MM-DD`). |
| **Natural Language Semantics** | *"Find sentences in passive voice"* | Requires grammatical dependency parsing and lexical dictionaries. | Suggests concrete lexical marker queries. |
| **Arbitrary String Reversal** | *"Reverse the letters of every word"* | Reversing arbitrary-length tokens requires unbounded backreferences. | Suggests fixed-pair swapping (`Swap first and last names`). |

