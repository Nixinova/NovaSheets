# Changelog for NovaSheets

## 0.3.4
- Added `deg` and `grad` keywords which change the preceeding number to radians and gradians, respectively.
- Added support for length conversions between `cm`, `mm`, `ft`, and `in` to metres using math operators.
- Added in-built function `percent` for converting a value to a percentage.
- Changed the `source` data attribute of the output style element to use a relative link.
- Removed support for using math operators on the right side of values with units.
- Fixed variables not being substituted when they contain trailing whitespace.
- Fixed `@const` declarations that appear after `@var` declarations being part of that variables content.

## 0.3.3
- Added support for using math operators on the right side of values with units.
- Fixed multiple calls of the same variable outputting the same result.
- Fixed nested variables with arguments still sometimes not being parsed correctly.
- Fixed the parentheses in math operations not being removed when it contains leading or trailing whitespace.

## 0.3.2
- Changed output style element to use the file path of the external stylesheet as the `source` data attribute.
- Fixed nested variables with arguments sometimes not being parsed correctly.

## 0.3.1
- Added tentative support for older browsers, such as pre-Chromium Edge.
- Changed output element to include the source of the stylesheet in the element's dataset.
- Fixed NovaSheets declaration not working in older browsers.
- Fixed bracketed numbers having their brackets removed.
- Fixed parsing of numbers with many prefixed plus or minus signs.

## 0.3.0
- Added a plethora of built-in variables, all prefixed with `@`.
  - Math functions and variables: `mod`, `min`, `max`, `clamp`, `sin`, `asin`, `cos`, `acos`, `tan`, `atan`, `abs`, `floor`, `ceil`, `round`, `log`, `root`, and `pi`.
  - Logical functions: `if`.
  - Text functions: `encode`, `replace`, and `length`.
  - Color functions: `color` and `colorpart`.
- Added support for math conversions using exponents (`^` or `**`), multiplication (`*`), division (`/`), addition (`+`), and subtraction (`-`); order of operations applies in that order.
  - Supports base 10 (no prefix), base 2 (prefix `0b`), base 8 (prefix `0o`), and base 16 (prefix `0x`).
- Added `@const` declarator to modify parser constants `MAX_RECURSION` and `MAX_ARGUMENTS`.
- Changed NovaSheets `type` and `rel` declarations to be case insensitive and to allow the word "NovaSheet" being pluralised.
- Changed NovaSheets `type` declarations to apply to any element instead of applying only to `template` elements.

## 0.2.1
- Duplicate stylesheets are no longer outputted when running the parsing command again.
- Fixed parameters sometimes not being fully parsed.

## 0.2.0
- Added support for variable parameters.

## 0.1.2
- Fixed treating tabs not being treated as spaces when parsing input.
- Fixed CRLF character breaking variable substitution.
- Fixed infinite recursion on variable substitution.

## 0.1.1
- Added support for nesting variables inside other variables.
- Fixed inaccessible stylesheets crashing the parser.

## 0.1.0
- Supports variable declaration in the front matter and substitution in the CSS content.
- Supports both internal and external stylesheets.
- Supports single-line comments.