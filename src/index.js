import MagicString from 'magic-string';
import { createFilter } from '@rollup/pluginutils';

function escape(str) {
    return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

function ensureFunction(functionOrValue) {
    if (typeof functionOrValue === 'function') return functionOrValue;
    return () => functionOrValue;
}

function longest(a, b) {
    return b.length - a.length;
}

function getReplacements(options) {
    if (options.values) {
        return Object.assign({}, options.values);
    }
    const values = Object.assign({}, options);
    delete values.delimiters;
    delete values.include;
    delete values.exclude;
    delete values.sourcemap;
    delete values.sourceMap;
    delete values.objectGuards;

    delete values.regexValues;
    delete values.preventAssignment;
    return values;
}

function getRegexReplacements(options) {
    return options.regexValues ? Object.assign({}, options.regexValues) : {};
}

function mapToFunctions(object, initial) {
    console.log('----mapToFunctions---------', object);
    return Object.keys(object).reduce((fns, key) => {
        const functions = Object.assign({}, fns);
        functions[key] = ensureFunction(object[key]);
        return functions;
    }, initial);
}

const objKeyRegEx =
    /^([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)(\.([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*))+$/;
function expandTypeofReplacements(replacements) {
    Object.keys(replacements).forEach((key) => {
        const objMatch = key.match(objKeyRegEx);
        if (!objMatch) return;
        let dotIndex = objMatch[1].length;
        let lastIndex = 0;
        do {
            // eslint-disable-next-line no-param-reassign
            replacements[`typeof ${key.slice(lastIndex, dotIndex)} ===`] = '"object" ===';
            // eslint-disable-next-line no-param-reassign
            replacements[`typeof ${key.slice(lastIndex, dotIndex)} !==`] = '"object" !==';
            // eslint-disable-next-line no-param-reassign
            replacements[`typeof ${key.slice(lastIndex, dotIndex)}===`] = '"object"===';
            // eslint-disable-next-line no-param-reassign
            replacements[`typeof ${key.slice(lastIndex, dotIndex)}!==`] = '"object"!==';
            // eslint-disable-next-line no-param-reassign
            replacements[`typeof ${key.slice(lastIndex, dotIndex)} ==`] = '"object" ===';
            // eslint-disable-next-line no-param-reassign
            replacements[`typeof ${key.slice(lastIndex, dotIndex)} !=`] = '"object" !==';
            // eslint-disable-next-line no-param-reassign
            replacements[`typeof ${key.slice(lastIndex, dotIndex)}==`] = '"object"===';
            // eslint-disable-next-line no-param-reassign
            replacements[`typeof ${key.slice(lastIndex, dotIndex)}!=`] = '"object"!==';
            lastIndex = dotIndex + 1;
            dotIndex = key.indexOf('.', lastIndex);
        } while (dotIndex !== -1);
    });
}

export default function replace(options = {}) {
    const filter = createFilter(options.include, options.exclude);
    const { delimiters = ['\\b', '\\b(?!\\.)'], preventAssignment, objectGuards } = options;
    const replacements = getReplacements(options);
    const regexReplacements = getRegexReplacements(options);
    console.log('regexReplacements', regexReplacements);

    if (objectGuards) {
        expandTypeofReplacements(replacements);
    }
    const functionRegexValues = mapToFunctions(regexReplacements, {});

    let functionValues = mapToFunctions(replacements, {});

    const escappedKeys = Object.keys(functionValues).map(escape);
    const unescappedKeys = Object.keys(functionRegexValues).map(escape);

    functionValues = Object.assign({}, functionValues, functionRegexValues);

    const combinedKeys = {};

    // const regexKeys = Object.keys(functionRegexValues).sort(longest);
    const regexKeys = Object.keys(functionRegexValues);
    // const keys = Object.keys(functionValues).sort(longest).map(escape);
    // const keys = Object.keys(functionValues).sort(longest).map(escape).concat(regexKeys).sort(longest);
    // const keys = [].concat(escappedKeys, regexKeys).sort(longest);
    // const keys = Object.keys(functionValues).sort(longest);
    const keys = Object.keys(functionValues).map((key) => `(${key})`).sort(longest);

    //const keys = Object.keys(functionValues).sort(longest).map(escape);
    console.log('......regexKeys....', regexKeys);
    console.log('......keys....', keys);

    const lookahead = preventAssignment ? '(?!\\s*=[^=])' : '';

    const patternStr = `${delimiters[0]}(${keys.join('|')})${delimiters[1]}${lookahead}`;
    console.log('patternStr', patternStr);

    const pattern = new RegExp(patternStr, 'g');

    return {
        name: 'replace',

        buildStart() {
            if (![true, false].includes(preventAssignment)) {
                this.warn({ message: "@rollup/plugin-replace: 'preventAssignment' currently defaults to false. It is recommended to set this option to `true`, as the next major version will default this option to `true`." });
            }
        },

        renderChunk(code, chunk) {
            const id = chunk.fileName;
            if (!keys.length) return null;
            if (!filter(id)) return null;
            return executeReplacement(code, id);
        },

        transform(code, id) {
            if (!keys.length) return null;
            if (!filter(id)) return null;
            return executeReplacement(code, id);
        }
    };

    function executeReplacement(code, id) {
        const magicString = new MagicString(code);
        if (!codeHasReplacements(code, id, magicString)) {
            return null;
        }

        const result = { code: magicString.toString() };
        if (isSourceMapEnabled()) {
            result.map = magicString.generateMap({ hires: true });
        }
        return result;
    }

    function codeHasReplacements(code, id, magicString) {
        let result = false;
        let match;

        // eslint-disable-next-line no-cond-assign
        while ((match = pattern.exec(code))) {
            result = true;

            const start = match.index;
            const end = start + match[0].length;

            // console.log('codeHasReplacements', `<<${code.substr(start, end)}>>`, 'magicString=', magicString, "!!!");
            // console.log('codeHasReplacements', `<<${magicString.toString().substr(start, end)}>>`, 'magicString=', magicString, "!!!");
            console.log('codeHasReplacements', `match[0]=,,${match[0]},, match[1]=,,${match[1]},, match[2]=,,${match[2]},, match[3]=,,${match[3]},,`, functionValues);
            //console.log('codeHasReplacements', `match=,,`, match, ',,');

            const [, , ...functionToRun] = match;
            const idx = functionToRun.findIndex((item) => !!item);
            console.log('functionToRun', functionToRun, idx);

            continue;
            const replacement = String(functionValues[match[1]](id));
            magicString.overwrite(start, end, replacement);

            console.log('codeHasReplacements', 'replacement=', replacement, "!!!!!", match[1], '...');
            console.log('codeHasReplacements', 'magicString=', magicString, "!!!!!");
        }
        return result;
    }

    function isSourceMapEnabled() {
        return options.sourceMap !== false && options.sourcemap !== false;
    }
}
