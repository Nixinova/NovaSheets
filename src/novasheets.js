// NovaSheets 0.4.7 //
String.prototype.hashCode = function (length) {
    let hash = 0;
    for (let i = 0; i < this.length; i++) hash = ((hash << 5) - hash) + this.charCodeAt(i);
    return Math.abs(hash).toString(16).substring(0, length || 8).padStart(length, '0');
};
String.prototype.trim = function (force) {
    return this.replace(/^\s*(.+?)\s*$/, '$1').replace(/\s+/g, force ? '' : ' ');
};
String.prototype.escapeRegex = function () {
    return this.replace(/[.*+?^/${}()|[\]\\]/g, '\\$&');
};

function nssLog(str, args) {
    if (str == 'func') return nssLog(`Unknown argument "${args[1]}" in function "${args[0]}" ${args[2]}`.trim() + '.');
    return console.warn("<NovaSheets>", str);
}

function parseNovaSheets() {

    // Generate list of NovaSheet files and get the contents of each stylesheet
    let externalSheets, inlineSheets;
    try { // For browsers that do not support attribute flags
        externalSheets = document.querySelectorAll('link[rel="novasheet" i], link[rel="novasheets" i]');
        inlineSheets = document.querySelectorAll('[type="novasheet" i], [type="novasheets" i]');
    } catch (err) {
        externalSheets = document.querySelectorAll('link[rel="novasheet"], link[rel="novasheets"]');
        inlineSheets = document.querySelectorAll('[type="novasheet"], [type="novasheets"]');
    }
    let fileNames = { full: [], rel: [] };
    let sources = [];
    for (let i of externalSheets) {
        fileNames.full.push(i.href);
        fileNames.rel.push(i.getAttribute('href'));
    }
    let stylesheetContents = [];
    for (let i in fileNames.full) {
        try {
            let req = new XMLHttpRequest();
            req.open("GET", fileNames.full[i], false);
            req.send();
            let response = req.responseText;
            stylesheetContents.push(response.toString());
            sources.push(fileNames.rel[i]);
        } catch (error) { }
    }
    for (let contents of inlineSheets) {
        stylesheetContents.push(contents.innerHTML);
        sources.push('inline');
    }

    // Loop through each sheet, parsing the NovaSheet styles
    window.randomHash = window.randomHash || Math.random().toString().hashCode(6);
    for (let s in stylesheetContents) {

        // Prepare stylesheet for parsing
        stylesheetContents[s] = stylesheetContents[s]
            .replace(/^(.*?)\/\/.*$/gm, '$1') // remove single-line comments
            .replace(/^@var.+?=.*$/gm, '$& @endvar') // single-line @var declarations
            .replace(/@(var|const|endvar)/g, '\n$&') // put each declarator on its own line for parsing
            .replace(/@const\s*[A-Z_]+\s*(true|false|[0-9]+)|@endvar/g, '$&\n') // put each const on its own line
        let lines = stylesheetContents[s].split('\n');
        let cssOutput = '';
        let commentedContent = [], staticContent = [];
        for (let i in lines) {
            lines[i] = lines[i].trim().replace(/[\r\n]/g, ' '); // remove whitespace
            cssOutput += ' ' + lines[i];
        }
        cssOutput = cssOutput
            .replace(/\s*@var[\s\S]*?((?=\s*@var)|@endvar)|@const\s*[A-Z_]+\s*(true|false|[0-9]+)/gm, ' ') // remove NSS declarations
            .replace(/\/\*([^\/].+?[^\/])\*\//g, (_, a) => {
                if (commentedContent.indexOf(a) < 0) commentedContent.push(a);
                return '/*COMMENT#' + commentedContent.indexOf(a) + '*/';
            }) // store commented content for later use
            .replace(/\/\*\/(.+?)\/\*\//g, (_, a) => {
                if (staticContent.indexOf(a) < 0) staticContent.push(a);
                return '/*STATIC#' + staticContent.indexOf(a) + '*/';
            }) // store static content for later use
        let customVars = [];
        let localVars = [], defaultArgs = [];
        let _MAX_RECURSION = 50, _MAX_MATH_RECURSION = 5, _MAX_ARGUMENTS = 10, _KEEP_NAN = false; // parser constants

        // Generate a list of lines that start variable declarations
        for (let i in lines) {
            if (lines[i].match(/^\s*@var\s/)) {
                let varDeclParts = lines[i].replace(/^\s*@var\s/, '').split('=');
                let linesAfter = lines.slice(i);
                let varEnding;
                for (let j in linesAfter) {
                    if (linesAfter[j].match(/^\s*@endvar\s*$|^\s*@var\s/) && j != 0) {
                        varEnding = j; break;
                    }
                }
                let varDeclaration = varDeclParts[0].trim();
                let varContent = (varDeclParts[1] || '') + linesAfter.slice(1, varEnding).join(' ');
                customVars.push({
                    line: Number(i),
                    ending: Number(varEnding),
                    content: varContent.trim(),
                    name: varDeclaration.split('|')[0].trim(),
                    params: varDeclaration.split('|').slice(1)
                });
            }
            else if (lines[i].match(/^\s*@const\s*MAX_RECURSION\s/)) {
                _MAX_RECURSION = Number(lines[i].split('MAX_RECURSION')[1]);
            }
            else if (lines[i].match(/^\s*@const\s*MAX_MATH_RECURSION\s/)) {
                _MAX_MATH_RECURSION = Number(lines[i].split('MAX_MATH_RECURSION')[1]);
            }
            else if (lines[i].match(/^\s*@const\s*MAX_ARGUMENTS\s/)) {
                _MAX_ARGUMENTS = Number(lines[i].split('MAX_ARGUMENTS')[1]);
            }
            else if (lines[i].match(/^\s*@const\s*KEEP_NAN\s/)) {
                _KEEP_NAN = !["0", "false"].includes(lines[i].split('KEEP_NAN')[1].trim());
            }
        }

        // Begin variable parsing; phrases below come from using format '$(name|param=arg)'

        /// For each variable declaration, generate local variables from its parameters
        for (let i in customVars) {
            for (let j in customVars[i].params) {
                let param = customVars[i].params[j].trim();
                let newName = [j, customVars[i].name, window.randomHash, param].join('~'); //= 'j-name-hash-param'
                let splitText = `(\\$\\[${param}(?:\\s*\\|([^\\]]*))?\\])`;
                let splitContent = customVars[i].content.split(RegExp(splitText));
                let joinText = `$(${newName})`;
                customVars[i].content = splitContent[0] + joinText + splitContent[3];
                defaultArgs.push(splitContent[2] || '');
                localVars.push(newName);
            }
        }

        /// Convert NovaSheets styles to CSS
        let loop = 0;
        while ((cssOutput.indexOf('$(') > -1 || loop < 2) && loop++ < _MAX_RECURSION) {
            for (let i in customVars) {
                let varName = customVars[i].name.escapeRegex(); //= 'name'
                let varPartsRegex = a => '\\s*(?:\\|\\s*([^' + (a || '') + '|$()]+)\\s*)?'; //= '|param=arg'
                let allVarArgsRegex = varPartsRegex().repeat(_MAX_ARGUMENTS); //= '|param1=arg1|...'
                let varContentRegex = `\\$\\(\\s*(${varName})\\s*${allVarArgsRegex}\\s*\\)`; //= '$(name|param1=arg1|...)'
                let anonVarRegex = `\\$\\(\\s*${varName}${varPartsRegex('=').repeat(_MAX_ARGUMENTS)}\\s*\\)`;
                let anonVarOutput = '$(' + varName;
                for (let i = 1; i <= _MAX_ARGUMENTS; i++) anonVarOutput += '|' + i + '=$' + i;
                cssOutput = cssOutput.replace(RegExp(anonVarRegex), anonVarOutput + ')'); // change anonymous variables to explicit
                let varParts = cssOutput.match(RegExp(varContentRegex)); // generate list of params and args
                if (!varParts) continue;
                let replaceRegex = '\\$\\(\\s*' + varName + '[^$()]*?\\)'; //= '$(name...)'
                cssOutput = cssOutput.replace(RegExp(replaceRegex), customVars[i].content); // substitute '$(name...)'

                // Parse local variables
                for (let j = 0; j < varParts.length; j++) {
                    if (j < 2 || !varParts[j]) continue;
                    let [param, arg] = varParts[j].split('=');
                    for (let k in localVars) {
                        arg = arg || defaultArgs[k]; // if 'arg' is not set, use default
                        let localVar = localVars[k];
                        let localVarFormatted = '\\$\\(\\s*' + localVar.escapeRegex() + '\\)'; //= '$(i-name-hash-param)'
                        let varParam = localVar.split('~').splice(3).join('~'); // 'i-name-hash-param' -> 'param'
                        if (varParam !== param.trim()) continue; // skip if the current param does not match the substituting var's param
                        cssOutput = cssOutput.replace(RegExp(localVarFormatted, 'g'), arg.trim()); // subst 'param' with its 'arg'
                    }
                }

            }

            // Parse built-in functions
            const nssFunction = (name, paramArgs) => {
                if (!Array.isArray(paramArgs)) paramArgs = [paramArgs];
                let params = Array(_MAX_ARGUMENTS);
                for (let i = 0; i < params.length; i++) {
                    params[i] = paramArgs[i] || '[^|())]*?';
                }
                let output = `\\$\\(\\s*${name}\\s*(?:\\|\\s*(${params.join('))?\\s*(?:\\|\\s*(')}))?\\s*\\)`;
                return RegExp(output, 'g');
            };

            /// Raw math operators
            const number = '-?[0-9]*\\.?[0-9]+';
            const basedNumber = '-?(?:0x[0-9a-f]*\.?[0-9a-f]+|0b[01]*\.?[01]+|0o[0-7]*\.?[0-7]+|' + number + ')';
            const bracketedNumberRegex = `\\((?:${basedNumber})\\)|${basedNumber}`;
            const numberUnitRegex = `(${bracketedNumberRegex})(?:\\s*(cm|mm|m|ft|in|em|rem|en|ex|px|pt|pc))`;
            const toNumber = val => _KEEP_NAN ? Number(val) : (isNaN(Number(val)) ? '' : Number(val));
            const mathRegex = op => `(?<!@replace[^)]*)(${bracketedNumberRegex})\\s*${op.escapeRegex()}\\s*(${bracketedNumberRegex})`;
            const mathRegexBracketed = op => '\\(\\s*' + mathRegex(op) + '\\s*\\)';
            const unitMathRegex = op => `${numberUnitRegex}?\\s*${op.escapeRegex()}\\s*${numberUnitRegex}?`;
            const parseMath = (ops, b) => {
                for (let op of ops) {
                    for (let i = 0; i < _MAX_MATH_RECURSION; i++) {
                        if (!Array.isArray(op)) op = [op, op];
                        cssOutput = cssOutput
                            .replace(RegExp('(?<!(?:#|0x)[0-9a-f.]*)' + basedNumber, 'g'), a => toNumber(a)) // convert base 2,8,16 to 10
                            .replace(RegExp(`\\b(${number})[Ee]([+-]?${number})\\b`), (_, n1, n2) => { // convert scientific notation
                                let val = toNumber(n1) * Math.pow(10, toNumber(n2));
                                return val.toFixed(20).replace(/\.?0+$/, '');
                            })
                            .replace(/(?:\+\s*|-\s*-\s*)+([.0-9]+)/, '+$1') // convert double negatives
                            .replace(/(?:\+\s*-|-\s*\+)+(?:\+\s*)*\s*([.0-9]+)/, '-$1') // convert values which evaluate to negative
                            .replace(RegExp(unitMathRegex(op[0])), (_, n1, u1, n2, u2) => {
                                if (!u2 && !u2) return _;
                                n1 = toNumber(n1.replace(/[()]/g, '')), n2 = toNumber(n2.replace(/[()]/g, ''));
                                let output = (n1, n2) => eval(n1 + op[0] + n2);
                                if (!u1 && !u2) return _; // skip if no units are present
                                switch (u1 + ',' + u2) {
                                    case 'm,cm': return output(n1 * 100, n2) + u2;
                                    case 'cm,m': return output(n1 / 100, n2) + u2;
                                    case 'm,mm': return output(n1 * 1000, n2) + u2;
                                    case 'mm,m': return output(n1 / 1000, n2) + u2;
                                    case 'cm,mm': return output(n1 * 10, n2) + u2;
                                    case 'mm,cm': return output(n1 / 10, n2) + u2;
                                    case 'm,in': return output(n1 * 39.3701, n2) + u2;
                                    case 'in,m': return output(n1 / 39.3701, n2) + u2;
                                    case 'cm,in': return output(n1 * 0.393701, n2) + u2;
                                    case 'in,cm': return output(n1 / 0.393701, n2) + u2;
                                    case 'mm,in': return output(n1 * 0.0393701, n2) + u2;
                                    case 'in,mm': return output(n1 / 0.393701, n2) + u2;
                                    case 'm,ft': return output(n1 * 3.28084, n2) + u2;
                                    case 'ft,m': return output(n1 / 3.28084, n2) + u2;
                                    case 'cm,ft': return output(n1 * 0.0328084, n2) + u2;
                                    case 'ft,cm': return output(n1 / 0.0328084, n2) + u2;
                                    case 'mm,ft': return output(n1 * 0.00328084, n2) + u2;
                                    case 'ft,mm': return output(n1 / 0.00328084, n2) + u2;
                                    default: return output(n1, n2) + (u2 || u1);
                                }
                            }) // parse units
                            .replace(RegExp(numberUnitRegex), a => a.replace(/[()]\s*/g, '')) // remove brackets from single unit values
                        let regex = b ? mathRegexBracketed(op[0]) : mathRegex(op[0]);
                        let nums = cssOutput.match(RegExp(regex));
                        if (!nums) continue;
                        let n1 = toNumber(nums[1].replace(/[()]/g, '')), n2 = Number(nums[2].replace(/[()]/g, ''));
                        let result = eval(n1 + op[1] + n2);
                        cssOutput = cssOutput.replace(RegExp(regex), result);
                    }
                }
            }
            const operators = ['**', ['^', '**'], '/', '*', '+', '-', ['--', '- -']];
            parseMath(operators, true); // bracketed operators
            parseMath(operators, false); // unbracketed operators


            /// Math functions
            cssOutput = cssOutput
                .replace(/\$\(\s*@pi\s*\)/g, Math.PI)
                .replace(/\$\(\s*@e\s*\)/g, Math.E)
                .replace(nssFunction('@mod', number, 2), (_, a, b) => a % b)
                .replace(nssFunction('@sin', number, 1), (_, a) => Math.sin(a))
                .replace(nssFunction('@asin', number, 1), (_, a) => Math.asin(a))
                .replace(nssFunction('@cos', number, 1), (_, a) => Math.cos(a))
                .replace(nssFunction('@acos', number, 1), (_, a) => Math.acos(a))
                .replace(nssFunction('@tan', number, 1), (_, a) => Math.tan(a))
                .replace(nssFunction('@atan', number, 1), (_, a) => Math.atan(a))
                .replace(nssFunction('@abs', number, 1), (_, a) => Math.abs(a))
                .replace(nssFunction('@floor', number, 1), (_, a) => Math.floor(a))
                .replace(nssFunction('@ceil', number, 1), (_, a) => Math.ceil(a))
                .replace(nssFunction('@percent', number, 1), (_, a) => toNumber(a) * 100 + '%')
                .replace(nssFunction('@log', number, 2), (_, base, num) => Math.log(num) / (base ? Math.log(base) : 1))
                .replace(nssFunction('@root', number, 2), (_, a, b) => Math.pow(b, 1 / a))
                .replace(nssFunction('@round', number, 2), (_, a, b) => {
                    return Math.round((toNumber(a) + Number.EPSILON) * Math.pow(10, b || 0)) / Math.pow(10, b || 0);
                })
                .replace(nssFunction('@(?:max|min)', number), (_, ...a) => {
                    let nums = [];
                    for (let item of a.slice(0, -2)) if (item) nums.push(item);
                    return (_.includes('@min')) ? Math.min(...nums) : Math.max(...nums);
                })
                .replace(nssFunction('@clamp', number, 3), (_, a, b, c) => {
                    if (c < b) [b, c] = [c.trim(), b.trim()];
                    return a <= b ? b : (a >= c ? c : a);
                })
                .replace(nssFunction('@degrees', '(' + number + ')\\s*(deg|rad|grad)?', 1), (_, a, num, type) => {
                    if (type === 'grad') return num * 10 / 9;
                    return num / Math.PI * 180; // default to radians
                })
                .replace(nssFunction('@radians', '(' + number + ')\\s*(deg|rad|grad)?', 1), (_, a, num, type) => {
                    if (type === 'grad') return num * Math.PI / 200;
                    return num * Math.PI / 180; // default to degrees
                })
                .replace(nssFunction('@gradians', '(' + number + ')\\s*(deg|rad|grad)?', 1), (_, a, num, type) => {
                    if (type === 'rad') return num / Math.PI * 200;
                    return num * 0.9; // default to degrees
                })

            /// Text functions
            cssOutput = cssOutput
                .replace(nssFunction('@extract'), (_, a, b, c) => a.split(b)[toNumber(c) - 1] || '')
                .replace(nssFunction('@encode'), (_, a) => encodeURIComponent(a))
                .replace(nssFunction('@length'), (_, a) => a.trim().length)
                .replace(nssFunction('@replace'), (_, a, b, c) => {
                    let isRegex = b.startsWith('/');
                    if (isRegex) {
                        let parts = b.trim().match(/\/(.+?)\/([gimusy]*)/).slice(1);
                        let regex = parts[0].replace(/!!/g, '|').replace(/{{/g, '(').replace(/(}?)}}/g, '$1)'); // escaping
                        let flags = parts[1] || 's';
                        b = RegExp(regex, flags);
                    }
                    return a.trim().replace(isRegex ? b : RegExp((b || ' ').escapeRegex(), 'g'), c.trim());
                })

            /// Loop functions
            cssOutput = cssOutput
                .replace(nssFunction('@each', [0, 0, '.*?']), (_, a, b, ...c) => {
                    c = c.slice(0, -2).join('|').replace(/\|+$/, '');
                    let output = [], arr = a.split(b);
                    for (let i in arr) {
                        let parsed = c
                            .replace(/\$i/gi, Number(i) + 1)
                            .replace(/\$v\[([0-9]+)([-+*/][0-9]+)?\]/g, (_, a, b) => arr[eval(Number(a - 1) + b)])
                            .replace(/.?\s*undefined/g, '')
                            .replace(/\$v/gi, arr[i])
                        output.push(parsed);
                    }
                    return output.join(' ');
                })
                .replace(nssFunction('@repeat'), (_, a, b) => {
                    let output = '';
                    for (let i = 0; i < Number(a); i++) output += b;
                    return output;
                })

            // Colour functions
            const colorArgRegex = `(?:rgba?|hsla?)\\(\\s*${number}%?\\s*,\\s*${number}%?\\s*,\\s*${number}%?\\s*(?:,\\s*${number}\\s*%?)?\\s*\\)|#[0-9a-f]{3,8}`;
            cssOutput = cssOutput
                .replace(nssFunction('@color', ['\\w+', ...(number + '%?|').repeat(4).split('|')], 4), (_, type, a = '', b = '', c = '', d = '') => {
                    if (['hash', '#'].includes(type) || type.startsWith('hex')) {
                        if (!a) return '#000';
                        if (a.startsWith('rgb')) [a, b, c, d] = a.replace(/rgba?\(|\)/g, '').split(',');
                        const val = num => {
                            let output = toNumber(num);
                            if (num.includes('%')) output = Math.ceil(toNumber(num.replace(/%/, '')) / 100 * 255);
                            return output.toString(16).padStart(2, '0');
                        };
                        return '#' + val(a) + val(b) + val(c) + (val(d) < 1 ? '' : val(d));
                    }
                    else if (type.includes('rgb') || type.includes('hsl')) {
                        const percent = x => {
                            let val = toNumber(x.replace(/%/, ''));
                            let char = x.includes('%') ? '%' : '';
                            if (type.includes('rgb') && ((a + b + c).includes('%') || a <= 1 || b <= 1 || c <= 1) && !char) {
                                val = Math.ceil(val / 255 * 100);
                                char = '%';
                            }
                            if (type.includes('hsl') && x == a && char) {
                                val = Math.ceil(val / 100 * 360);
                                char = '';
                            }

                            let output = val + char;
                            return output;
                        }
                        return `${type}(${percent(a)}, ${percent(b)}, ${percent(c)}${type.length === 3 ? '' : ', ' + percent(d || '1')})`;
                    }
                    else return `${type.toLowerCase()}(${a} ${b} ${c}${d ? ' / ' + d : ''})`;
                })
                .replace(nssFunction('@(?:colou?r|luma)', ['\\w+', colorArgRegex]), (_, type, a) => {
                    if (a.startsWith('#')) {
                        let parts;
                        if (a.length - 1 === 3) parts = [a[1].repeat(2), a[2].repeat(2), a[3].repeat(2)];
                        else if (a.length - 1 === 4) parts = [a[1].repeat(2), a[2].repeat(2), a[3].repeat(2), a[4].repeat(2)];
                        else if ([5, 6].includes(a.length - 1)) parts = [a[1] + a[2], a[3] + a[4], a[5] + (a[6] || '0')];
                        else if ([7, 8].includes(a.length - 1)) parts = [a[1] + a[2], a[3] + a[4], a[5] + a[6], a[7] + (a[8] || '0')];
                        a = parseInt(parts[0], 16);
                        b = parseInt(parts[1], 16).toString() || 0;
                        c = parseInt(parts[2], 16).toString() || 0;
                        d = parseInt(parts[3], 16) || 0;
                    } else {
                        parts = a.replace(/^\s*...a?\s*/, '').replace(/[()]/g, '').split(','); // replace 'rgba' etc & '('/')'
                        [a, b, c, d] = parts;
                    }
                    if (_.includes('@luma')) {
                        const adjustGamma = a => ((a + 0.055) / 1.055) ** 2.4;
                        const parseLuma = a => a <= 0.03928 ? a / 12.92 : adjustGamma(a);
                        return 0.2126 * parseLuma(a / 255) + 0.7152 * parseLuma(b / 255) + 0.0722 * parseLuma(c / 255); // ITU-R BT.709
                    }
                    if (['hash', '#'].includes(type) || type.startsWith('hex')) {
                        const toHex = a => toNumber(a % 256).toString(16).padStart(2, '0');
                        return '#' + toHex(a) + toHex(b) + toHex(c) + (d ? toHex(d) : '')
                    }
                    return `${type}(${a}, ${b}, ${c}${d ? ', ' + d : ''})`;
                })
                .replace(nssFunction('@colou?rpart', ['\\w+', colorArgRegex]), (_, part, color) => {
                    part = part.trim().toLowerCase(), color = color.trim().toLowerCase();
                    let parts = [];
                    const toHex = (str, a) => (toNumber("0x" + str.substr(a, 2))).toString()

                    if (color.startsWith('#')) {
                        let hex = color.replace('#', '');
                        if (hex.length === 3) hex = hex[0].repeat(2) + hex[1].repeat(2) + hex[2].repeat(2) + '00';
                        if (hex.length === 4) hex = hex[0].repeat(2) + hex[1].repeat(2) + hex[2].repeat(2) + hex[3].repeat(2);
                        if (hex.length === 6) hex += '00';
                        parts = [toHex(hex, 0), toHex(hex, 2), toHex(hex, 4), toHex(hex, 6)];
                    }
                    else parts = color.replace(/^\s*...a?\s*/, '').replace(/[()]/g, '').split(','); // replace 'rgba' etc & '('/')'

                    if (color.startsWith('#') || color.startsWith('rgb')) {
                        if (part.startsWith('r')) return parts[0];
                        else if (part.startsWith('g')) return parts[1];
                        else if (part.startsWith('b')) return parts[2];
                        else if (part.startsWith('a')) return parts[3];
                        else {
                            nssLog('func', ['colorpart', part, 'of color type rgb/rgba/#']);
                            return color;
                        }
                    }
                    else if (color.startsWith('hsl')) {
                        if (part.startsWith('h')) return parts[0];
                        else if (part.startsWith('s')) return parts[1];
                        else if (part.startsWith('l')) return parts[2];
                        else if (part.startsWith('a')) return parts[3];
                        else {
                            nssLog('func', ['colorpart', part, 'of color type hsl/hsla']);
                            return color;
                        }
                    } else {
                        nssLog('func', ['colorpart', part, 'of unknown color type']);
                        return color;
                    }
                })

            /// Logical functions
            const parseLogic = arg => {
                for (let i = 0; i < _MAX_ARGUMENTS / 10; i++) {
                    arg = arg.trim()
                        .replace(/(?:'(.+?)'|"(.+?)")+/, '$1$2') // remove quotes
                        .replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<') // fix html
                        .replace(/\bor\b/gi, '||').replace(/\band\b/gi, '&&').replace(/\bnot\b/gi, '!') // default logical operators
                        .replace(/(.+?)\bnor\b(.+)?/gi, '!($1) && !($2)') // 'nor' logical operator
                        .replace(/(.+?)\bnand\b(.+)?/gi, '!($1) || !($2)') // 'nand' logical operator
                        .replace(/(.+?)\bxor\b(.+)?/gi, '($1 && !($2)) || (!($1) && $2)') // 'xor' logical operator
                        .replace(/(.+?)\bxnor\b(.+)?/gi, '$1 == $2') // 'xnor' logical operator
                        .replace(/(?!=)(!?)=(==)?(?!=)/g, '$1$2==') // normalise equality signs
                }
                if (arg.match(/(<|<=|>|>=|==|!=|&|\||!)/)) arg = eval(arg);
                if (['false', 'undefined', 'null', 'NaN', ''].includes(arg)) arg = false;
                return arg;
            };
            const logicRegex = arg => RegExp(`([+-]?${bracketedNumberRegex})\\s*(?:${arg})\\s*([+-]?${bracketedNumberRegex})`);
            cssOutput = cssOutput
                .replace(nssFunction('@bitwise'), (_, a) => {
                    a = a.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<') // fix html
                    for (let i = 0; i < _MAX_ARGUMENTS / 10; i++) {
                        a = a
                            .replace(RegExp(`(?:~|!|not)\\s*([+-]?${bracketedNumberRegex})`), (_, a) => eval('~' + toNumber(a))) // bitwise not
                            .replace(logicRegex('or|\\|'), (_, a, b) => eval(`(${toNumber(a)}) | (${toNumber(b)})`)) // bitwise or
                            .replace(logicRegex('nor'), (_, a, b) => eval(`~ (${toNumber(a)}) | (${toNumber(b)})`)) // bitwise nor
                            .replace(logicRegex('and|&'), (_, a, b) => eval(`(${toNumber(a)}) & (${toNumber(b)})`)) // bitwise and
                            .replace(logicRegex('nand'), (_, a, b) => eval(`~ (${toNumber(a)}) & (${toNumber(b)})`)) // bitwise nand
                            .replace(logicRegex('xor'), (_, a, b) => eval(`(${toNumber(a)}) ^ (${toNumber(b)})`)) // bitwise xor
                            .replace(logicRegex('xnor'), (_, a, b) => eval(`~ (${toNumber(a)}) ^ (${toNumber(b)})`)) // bitwise xnor
                    }
                    return a;
                })
                .replace(nssFunction('@boolean'), (_, a) => parseLogic(a))
                .replace(nssFunction('@if'), (_, a, b, c) => parseLogic(a) ? b : c || '')
        }

        // Remove unparsed variables
        let unparsedContent = cssOutput.match(/\$\((.+?)\)/g)
        if (unparsedContent) for (let val of unparsedContent) {
            let varName = val.replace(/\$\((.*?)(\|.*)?\)/, '$1')
            nssLog(`Instances of undeclared variable "${varName}" have been removed from the output.`);
            cssOutput = cssOutput.replace(val, '');
        }

        // Cleanup output
        cssOutput = cssOutput
            .replace(/(\s*;)+/g, ';').replace(/\s+/g, ' ').replace(/} *(?!$)/g, '}\n').replace(/@endvar/g, '') // remove redundant chars
            .replace(/\.?0{8,}\d/, '').replace(/(\d)(9{8,})\d?\b/g, (_, a) => Number(a) + 1) // fix floating point errors

        // Readd comments to the output
        for (let i in staticContent) {
            cssOutput = cssOutput.replace(RegExp(`\\/\\*STATIC#${i}\\*\\/`, 'g'), staticContent[i].trim());
        }
        for (let i in commentedContent) {
            cssOutput = cssOutput.replace(RegExp(`\\/\\*COMMENT#${i}\\*\\/`, 'g'), '/*' + commentedContent[i] + '*/');
        }

        // Load converted styles to page
        if (document.querySelectorAll(`[data-hash="${cssOutput.hashCode()}"]`).length) break; // prevent duplicate output stylesheets
        let styleElem = document.createElement('style');
        styleElem.innerHTML = '\n' + cssOutput + '\n';
        styleElem.dataset.hash = cssOutput.hashCode();
        styleElem.dataset.source = sources[s];
        (document.head || document.body).appendChild(styleElem);

    }
}

// Parse NovaSheets styles on page load
document.addEventListener("DOMContentLoaded", parseNovaSheets());