const balanced = require('balanced-match');
const { MathParser } = require('math-and-unit-parser');

import NovaSheets from './index';
import { CustomFunction, CustomFunctionOptions, Constants } from './common';
import builtInFunctions from './functions';
import { regexes } from './regex';

function parse(content: string, novasheets: NovaSheets = new NovaSheets()): string {
    const r = String.raw;
    const strim = (str: string): string => str.trim().replace(/\s+/g, ' ');
    const escapeRegex = (str: string): string => str.replace(/[.*+?^/${}()|[\]\\]/g, '\\$&');
    const number: string = regexes.number().source;
    const basedNumber: string = regexes.basedNumber().source;
    const numberUnit: string = regexes.numberUnit().source;
    const mathChecker: string = (() => {
        const o = r`\(\s*`, c = r`\s*\)`; // open and close brackets
        const numberValue: string = r`(?:-?${basedNumber}(?:${numberUnit})?)`;
        const optBracketedNumber: string = `(?:${o}${numberValue}${c}|${numberValue})`;
        const operators: string = r`(?:(?:[-^*/+]+\s*)+(?=\d|\.))`;
        const unbracketed: string = r`(?:(?:${optBracketedNumber}\s*${operators}\s*)+${numberValue})`;
        return r`\(\s*${unbracketed}\s*\)|${unbracketed}`;
    })();
    const parseFunction = (name: string, func: (...args: string[]) => string, opts: CustomFunctionOptions = {}): void => {
        if (RegExp(mathChecker).test(cssOutput)) return; // only run after math is parsed
        const match = cssOutput.match(RegExp(r`\$\(\s*(?:${name})\b`, 'i'));
        if (!match) return;
        const searchString: string = cssOutput.substr(cssOutput.indexOf(match[0]));
        const segment = balanced('(', ')', searchString).body;
        const fullSegment = '$(' + segment + ')';
        let parts: string[] = segment.split('|'); // [name, arg1, arg2, ...]
        if (opts.trim !== false) parts = parts.map(part => part.trim());
        parts[0] = fullSegment;
        cssOutput = cssOutput.replace(fullSegment, func(...parts));
    };
    const ESC: Record<string, string> = {
        OPEN_BRACE: Math.random().toString(36).substr(2),
        CLOSE_BRACE: Math.random().toString(36).substr(2),
        SLASH: Math.random().toString(36).substr(2),
    }

    // Prepare stylesheet for parsing //

    let styleContents: string = content
        .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&') // fix html
        .replace(regexes.singleLineComment('gm'), '') // remove single-line comments
        .replace(regexes.singleLineVarDeclaration('gm'), '$& @endvar') // single-line @var declarations
        .replace(/@(var|const|endvar)/g, '\n$&') // put each declarator on its own line for parsing
        .replace(regexes.singleLineDeclarations('g'), '$&\n') // put each const on its own line
        .replace(/}}/g, '} }') // ensure the second brace is not skipped over
        .replace(regexes.implicitParentSelector('g'), ';$1&@') // implicit parent selector for simple breakpoints
    let commentedContent: string[] = [];
    let staticContent: string[] = [];
    let lines: string[] = styleContents.split('\n');
    let cssOutput: string = styleContents
        .replace(regexes.syntacticDeclaration('gms'), ' ') // remove syntactic declarations
        .replace(regexes.blockComment('gs'), (_, content) => {
            if (_.startsWith('/*[') && _.endsWith(']*/')) return _.replace(/^\/\*\[(.+)\]\*\/$/, '/*$1*/'); // parsed comment
            if (_.startsWith('/*/') || _.endsWith('/*/')) return _; // static comment; skip
            if (commentedContent.indexOf(content) < 0) commentedContent.push(content);
            return '/*COMMENT#' + commentedContent.indexOf(content) + '*/';
        }) // store commented content for replacement at end
        .replace(regexes.staticComment('gs'), (_, a) => {
            if (staticContent.indexOf(a) < 0) staticContent.push(a);
            return '/*STATIC#' + staticContent.indexOf(a) + '*/';
        }) // store static content for replacement at end
    let customVars: Record<string, string> = {};
    let constants: Constants = {
        BUILTIN_FUNCTIONS: true,
        DECIMAL_PLACES: false,
        KEEP_UNPARSED: false,
        MAX_ARGUMENTS: 10,
    };
    // Generate a list of lines that start variable declarations //

    for (let i in lines) {
        if (lines[i].includes('@var')) {
            const varDeclParts: string[] = lines[i].replace(/@var/, '').split('=');
            const linesAfter: string[] = lines.slice(+i);

            let varEnding: number = linesAfter.length;
            for (let j in linesAfter) {
                if (/@endvar|@var/.test(linesAfter[j]) && +j !== 0) {
                    varEnding = +j;
                    break;
                }
            }

            let varName: string = varDeclParts[0].trim().split('|')[0].trim();
            const inlineContent: string = varDeclParts.slice(1).join('=') || '';
            const blockContent: string = linesAfter.slice(1, varEnding).join('\n');
            const variables: RegExp = new RegExp(r`\$\(\s*${varName}\s*\)`, 'g');
            let varContent: string = (inlineContent + blockContent).trim().replace(variables, customVars[varName] || '');
            customVars[varName] = varContent.replace('{', ESC.OPEN_BRACE).replace('}', ESC.CLOSE_BRACE);
        }
        else if (lines[i].includes('@option')) {
            let [name, val]: string[] = lines[i].replace(/^\s*@option\s+/, '').split(/\s+/);
            const isNotFalse = (val: string): boolean => val !== '0' && val !== 'false';
            switch (name.toUpperCase()) {
                case 'BUILTIN_FUNCTIONS': constants.BUILTIN_FUNCTIONS = isNotFalse(val); break;
                case 'DECIMAL_PLACES': constants.DECIMAL_PLACES = val !== 'false' && +val; break;
                case 'KEEP_UNPARSED': constants.KEEP_UNPARSED = isNotFalse(val); break;
                case 'MAX_ARGUMENTS': constants.MAX_ARGUMENTS = parseInt(val); break;
            }
        }
    }

    // Compile NovaSheets styles //

    let lastCssOutput = '';
    do {
        if (lastCssOutput === cssOutput) break;
        lastCssOutput = cssOutput;

        // Parse math //
        cssOutput = cssOutput
            // convert exponential notation
            .replace(regexes.exponential('gi'), (_, a, b) => (+a * 10 ** +b).toString())
            // fix slash edge cases
            .replace(regexes.slashEdgeCaseFunction('g'), '$1' + ESC.SLASH + '$2')
            .replace(regexes.slashEdgeCaseAttribute('g'), '$1' + ESC.SLASH + '$2')
            // compile math
            .replace(RegExp(mathChecker, 'g'), _ => {
                if (regexes.edgeCaseDelimited('g').test(_)) return _; // delimited values, not subtraction
                let unit: string = '';
                const content: string = _
                    .replace(/\*\*/g, '^')
                    .replace(regexes.numberWithUnit('g'), (_, num, u) => {
                        switch (u) {
                            case 'mm': case 'ms': return unit = u[1], (+num / 1000).toString();
                            case 'cm': return unit = 'm', (+num / 100).toString();
                            case 'in': return unit = 'm', (+num * 0.0254).toString();
                            case 'ft': return unit = 'm', (+num * 0.3048).toString();
                            default: return unit = u, num;
                        }
                    })
                try { return MathParser(content) + unit; }
                catch { return _; }
            })

        // Parse variable contents //

        for (const name in customVars) {
            parseFunction(name, (_, ...paramArgs) => {
                let content: string = customVars[name];
                for (const i in paramArgs) {
                    if (!paramArgs[i]) continue;
                    const parts: string[] = paramArgs[i].split('=');
                    const param: string = parts[1] ? strim(parts[0]) : (+i + 1).toString();
                    const arg: string = parts[1] ? strim(parts.slice(1).join('=')) : strim(parts[0]);
                    content = content.replace(RegExp(r`\$\[${param}[^\]]*\]`, 'g'), arg);
                }
                content = content.replace(/\$\[.*?(?:\|([^\]]*))?\]/g, '$1'); // default args
                return content;
            });
        }

        // Parse functions //

        let allFunctions: CustomFunction[] = [];
        if (constants.BUILTIN_FUNCTIONS) allFunctions.push(...builtInFunctions({ constants }));
        allFunctions.push(...(novasheets?.getFunctions() ?? []));
        for (const obj of allFunctions) {
            parseFunction(obj.name, obj.body, obj.options);
        }

        // Parse nesting //

        let compiledOutput = '';
        const check = (s: string) => balanced('{', '}', s);
        const unnest = (css: string, parent: string): void => {
            // early return if block has no parent (is an object literal)
            if (!parent && /^\s*{/.test(css)) {
                compiledOutput += css;
                return;
            }
            // parse data
            const data = check(css);
            // check if block has no children
            if (!data) {
                // write styles if there are any
                let styleContent: string = css.trim();
                if (styleContent) compiledOutput += parent ? `{${styleContent}}` : styleContent;
                return;
            }
            // move any trailing styles to front of block
            let endStylesMatch: string = data.body.match(/(?<=})[^{}]+?$/g)?.[0] ?? '';
            if (endStylesMatch) {
                let endStyles = endStylesMatch;
                if (endStyles.trim() && !/}\s*$/.test(data.body)) endStyles += ';';
                data.body = data.body.replace(endStylesMatch, '').replace(/[^;]+{/, endStyles + '$&');
            }
            // check if block has both styles and children
            let styles: string[] = data.pre.split(';');
            if (styles.length) {
                // remove styles from child selector content
                data.pre = styles.pop();
                // add selectors to parent selector if applicable
                if (styles.length) {
                    let styleContent: string = styles.join(';') + ';';
                    compiledOutput += parent ? `${parent} {${styleContent}}` : styleContent;
                }
            }
            // create selector
            let fullSelector: string = '';
            if (data.pre.includes('@media')) fullSelector = data.pre + parent.replace(regexes.mediaQuery('g'), '');
            else if (data.pre.includes('&')) fullSelector = data.pre.replace(/&/g, parent);
            else fullSelector = parent + ' ' + data.pre;
            fullSelector = strim(fullSelector);
            // write selector if the block has styles
            if (!/}\s*$/.test(data.body)) compiledOutput += fullSelector.replace(/\/\*.+?\*\//gs, '');
            // add empty styles if selector has no styles
            if (parent && !data.pre) compiledOutput += '{}';
            // parse children
            unnest(data.body, fullSelector);
            // continue to next block
            unnest(data.post, strim(parent));
        }
        unnest(cssOutput, '');
        cssOutput = compiledOutput
            .replace(regexes.mediaQueryBlock('gs'), '$1 { $2 }')
            .replace(regexes.emptyMediaQueryBlock('g'), '')
            .replace(regexes.nonEmptyMediaQueryBlock('g'), '$1 { $2 {$3} }')
        while (regexes.duplicateMediaQueries('gs').test(cssOutput)) {
            cssOutput = cssOutput.replace(regexes.duplicateMediaQueries('gs'), `$1 {$2 $3}`);
        }

        // Parse CSS block substitutions //

        //save CSS declarations as variables
        cssOutput = cssOutput.replace(ESC.OPEN_BRACE, '{').replace(ESC.CLOSE_BRACE, '}'); // unescape
        const cssBlocks: Record<string, string> = {};
        compiledOutput.replace(/([^{}]+)({.+?})/gms, (_: string, selector: string, css: string) => {
            if (selector.includes('$(') || selector.startsWith('@')) return '';
            selector = selector.replace(/\$(<.+?>){1,2}/g, '')
            const selectorVal: string = escapeRegex(strim(selector));
            cssBlocks[selectorVal] = css;
            return '';
        });
        //substitute blocks
        for (let name in cssBlocks) {
            cssOutput = cssOutput.replace(new RegExp(r`\$<\s*${name}\s*>`), cssBlocks[name] ?? '{}');
        }
        cssOutput = cssOutput.replace(/\$<.+?>/g, '{}');
        //parse object notation
        cssOutput = cssOutput.replace(regexes.objectNotation('gm'), (_, css, item) => {
            const statements: string[] = css.split(';');
            for (const statement of statements) {
                const [attr, val] = statement.trim().split(':');
                if (attr.trim() === item.trim()) return val ?? '';
            }
            return '';
        });
        cssOutput = cssOutput.replace(regexes.blockSubstitutions('gm'), (_, css) => css);

        // Parse simple breakpoints //

        cssOutput = cssOutput.replace(regexes.simpleBreakpoint('gms'), (_, sel, min1, max1, min2, max2, selAfter, block) => {
            let [min, max] = [min1 ?? min2, max1 ?? max2];
            let simpleBreakpoint: string = r`@\s*(\d+px)?\s*(?:\.{2,})?\s*(\d+px)?`;
            let selMatch: string[] = selAfter.match(RegExp(simpleBreakpoint, 'g')) as string[];
            if (selMatch) [, min, max] = selMatch[selMatch.length - 1].match(RegExp(simpleBreakpoint)) as string[];
            let selector: string = (sel + selAfter).replace(RegExp(simpleBreakpoint, 'g'), '');

            let query: string[] = [];
            if (min) query.push(`(min-width: ${min})`);
            if (max) query.push(`(max-width: ${max.replace(/\d+/, (d: string) => +d - 1)})`);
            return `@media ${query.join(' and ')} { ${selector} { ${block} } }`;
        }
        );

    }
    while (cssOutput.includes('$(') || RegExp(mathChecker).test(cssOutput))

    // Remove unparsed variables //

    if (!constants.KEEP_UNPARSED) {
        cssOutput = cssOutput.replace(/@endvar/g, '');
        const unparsedContent: string[] = cssOutput.match(regexes.unparsedContent('g')) ?? [];
        for (const val of unparsedContent) {
            cssOutput = cssOutput.replace(val, '');
            const varName: string = strim(val.replace(regexes.variableName(''), '$1'));
            const type: string = val.includes('$(') ? 'variable' : 'argument';
            console.log(`<NovaSheets> Instances of unparsed ${type} '${varName}' have been removed from the output.`);
        }
    }

    // Cleanup output //

    cssOutput = cssOutput
        // cleanup whitespace
        .replace(/(?<!^ *) +/gm, ' ') // remove redundant whitespace
        .replace(/\*\/\s*/g, '$&\n') // newline after block comment
        .replace(/}\s*/g, '}\n').replace(/}\s*}/g, '} }') // space after braces
        .replace(/\s*{/g, ' {') // space before braces
        .replace(/^([ \t])\1+/gm, '$1') // single indent
        .replace(/^([ \t].+)}/gm, '$1\n}') // newline before indented block ending
        .replace(/{\s*(.+\r?\n)([ \t])/g, '{\n$2$1$2') // newline after indent block start
        // remove extra punctutation
        .replace(/(\s*;)+/g, ';')
        // clean up length units
        .replace(/(?<![1-9]+)(0\.\d+)\s*(m|s)/, (_, n, u) => +n * 1000 + 'm' + u)
        .replace(/(?<=\d)0\s*mm/g, 'cm')
        .replace(/(?<=\d)(000\s*mm|00\s*cm)/g, 'm')
        // fix floating point errors
        .replace(/\.?0{10,}\d/g, '')
        .replace(/((\d)\2{9,})\d/g, '$1')
        .replace(/(\d+)([5-9])\2{10,}\d?(?=\D)/g, (_, a) => (+a + 1).toString())
        .replace(/\d*\.?\d+e-(?:7|8|9|\d{2,})/, '0')
        // cleanup decimal places
        .replace(/\d\.\d+/g, (val) => constants.DECIMAL_PLACES === false ? val : (+val).toFixed(+constants.DECIMAL_PLACES))
        // fix calc() output
        .replace(/calc(\d)/g, '$1')
        // restore characters
        .replace(RegExp(ESC.SLASH, 'g'), '/')
    // re-add comments to output
    for (const i in staticContent) {
        cssOutput = cssOutput.replace(RegExp(r`\/\*STATIC#${i}\*\/`, 'g'), strim(staticContent[i]));
    }
    for (const i in commentedContent) {
        cssOutput = cssOutput.replace(RegExp(r`\/\*COMMENT#${i}\*\/`, 'g'), '/*' + commentedContent[i] + '*/');
    }

    // Return output //
    return cssOutput.trim() + '\n';
}

export = parse;
