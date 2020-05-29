String.prototype.hashCode = function () {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
        hash = ((hash << 5) - hash) + this.charCodeAt(i);
    }
    return Math.abs(hash).toString(16);
};

function parseNovaSheets() {

    // Generate list of NovaSheet files
    let sheets = document.querySelectorAll('link[rel="novasheet"]');
    let fileNames = [];
    for (let i of sheets) {
        fileNames.push(i.href);
    }

    // Generate contents of each sheet
    let stylesheetContents = [];
    for (let file of fileNames) {
        try {
            let req = new XMLHttpRequest();
            req.open("GET", file, false);
            req.send();
            let response = req.responseText;
            stylesheetContents.push(response.toString());
        } catch (error) {
            console.error(`NovaSheets parsing failed: File "${file}" cannot be accessed.`);
        }
    }

    let inline = document.querySelectorAll('template[type="novasheet"]');
    for (let contents of inline) {
        stylesheetContents.push(contents.innerHTML);
    }

    // Loop through each sheet, parsing the NovaSheet styles
    for (let contents of stylesheetContents) {

        let lines = contents.split('\n');
        let customVars = [];
        let styles = {};

        // Generate a list of lines that start variable declarations
        for (let i in lines) {
            lines[i] = lines[i].replace(/^(.*?) \/\/.+$/, '$1');
            if (lines[i].match(/ *--- */)) {
                lines[i] = "---";
            }
            if (lines[i].match(/ *@var /)) {
                customVars.push({ line: Number(i), name: lines[i].replace(/ *@var (.+?)(?: \/\/.*)?$/, '$1') });
            }
        }

        const varDeclEnding = lines.indexOf('---');
        const cssContent = lines.slice(varDeclEnding + 1).join('\n');

        // For each variable declaration, add styles to object.
        for (let i in customVars) {
            let currentLine = customVars[i].line + 1;
            let currentStyle = customVars[i].name;
            let lastLine = customVars[i + 1] && customVars[i + 1].line;
            if (isNaN(lastLine)) lastLine = varDeclEnding;
            while (currentLine < lastLine) {
                if (lines[currentLine].match(/ *@var /)) break;
                if (!styles[currentStyle]) styles[currentStyle] = "";
                styles[currentStyle] += lines[currentLine];
                currentLine++;
            }
        }

        // Convert NovaSheets styles to CSS
        let cssOutput = cssContent;
        while (cssOutput.indexOf('$(') > -1) {
            for (let i in customVars) {
                cssOutput = cssOutput.split('$(' + customVars[i].name + ')').join(styles[customVars[i].name] || '');
            }
        }
        cssOutput = cssOutput.replace(/; *;/g, ';').replace(/ +/g, ' ');

        // Load converted styles to page
        let styleElem = document.createElement('style');
        styleElem.dataset.hash = cssOutput.hashCode();
        styleElem.innerHTML = '\n' + cssOutput + '\n';
        (document.head || document.body).appendChild(styleElem);

    }

}

// Parse NovaSheets styles on page load
document.addEventListener("DOMContentLoaded", function () {
    parseNovaSheets();
});