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

function mapToFunctions(object) {
    //console.log('----mapToFunctions---------', object);
    return Object.keys(object).reduce((fns, key) => {
        const functions = Object.assign({}, fns);
        functions[key] = ensureFunction(object[key]);
        return functions;
    }, {});
}

const objKeyRegEx = /^([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)(\.([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*))+$/;

function expandTypeofReplacements(replacements) {
    Object.keys(replacements).forEach(
        (key) => {
            const objMatch = key.match(objKeyRegEx);
            if (!objMatch) {
                return;
            }

            let dotIndex = objMatch[1].length;
            let lastIndex = 0;
            do {
                replacements[`typeof ${key.slice(lastIndex, dotIndex)} ===`] = '"object" ===';
                replacements[`typeof ${key.slice(lastIndex, dotIndex)} !==`] = '"object" !==';
                replacements[`typeof ${key.slice(lastIndex, dotIndex)}===`] = '"object"===';
                replacements[`typeof ${key.slice(lastIndex, dotIndex)}!==`] = '"object"!==';
                replacements[`typeof ${key.slice(lastIndex, dotIndex)} ==`] = '"object" ===';
                replacements[`typeof ${key.slice(lastIndex, dotIndex)} !=`] = '"object" !==';
                replacements[`typeof ${key.slice(lastIndex, dotIndex)}==`] = '"object"===';
                replacements[`typeof ${key.slice(lastIndex, dotIndex)}!=`] = '"object"!==';

                lastIndex = dotIndex + 1;
                dotIndex = key.indexOf('.', lastIndex);
            } while (dotIndex !== -1);
        }
    );
}

export default function replace(options = {}) {
    const filter = createFilter(options.include, options.exclude);
    const { delimiters = ['\\b', '\\b(?!\\.)'], preventAssignment, objectGuards } = options;

    const replacements = getReplacements(options);
    const regexReplacements = getRegexReplacements(options);

    if (objectGuards) {
        expandTypeofReplacements(replacements);
    }

    const normalValues = mapToFunctions(replacements);
    const regexValues = mapToFunctions(regexReplacements);
    const functionValues = Object.assign({}, normalValues, regexValues);

    const matchEntries = Object.entries(functionValues).sort((a, b) => b[0].length - a[0].length);;
    // const matchEntriesNamed = matchEntries.map(([k, v], idx) => ({ [`n${idx}`]: [k, v] }));
    const matchEntriesNamedTuples = matchEntries.map(([k, v], idx) => [`n${idx}`, k, v]);
    const matchEntriesPatterns = matchEntriesNamedTuples.map(([group, pattern, func]) => `(?<${group}>${pattern})`);
    const matchEntriesNamed = Object.fromEntries(matchEntriesNamedTuples.map(([group, pattern, func]) => [group, [pattern, func]]));
    // const matchEntriesPatterns = matchEntriesNamed.map(([k, [p, v]]) => `(?<${k}>${p})`);

    const mathcKeys = Object.keys(functionValues).sort(longest).map((key, idx) => `(?<n${idx}>${key})`);

    // console.log({values: Object.keys(functionValues).join(' ▨▨▨ ')});
    console.log('matchEntries', matchEntries.map(([k, v]) => [k, v()]));
    console.log('matchEntriesNamedTuples', matchEntriesNamedTuples);
    console.log('matchEntriesPatterns', matchEntriesPatterns);
    console.log('matchEntriesNamed', matchEntriesNamed);

    const lookahead = preventAssignment ? '(?!\\s*=[^=])' : '';

    const patternStr = `${delimiters[0]}(${matchEntriesPatterns.join('|')})${delimiters[1]}${lookahead}`;
    console.log('patternStr', patternStr);

    /*
    const normalValues = mapToFunctions(replacements);
    const regexValues = mapToFunctions(regexReplacements);
    const functionValues = Object.assign({}, normalValues, regexValues);
    const matchEntries = Object.entries(functionValues);
    const mathcKeys = Object.keys(functionValues).sort(longest).map((key, idx) => `(?<n${idx}>${key})`);

    // console.log({values: Object.keys(functionValues).join(' ▨▨▨ ')});
    console.log(matchEntries.map(([k, v]) => [k, v()]));

    const lookahead = preventAssignment ? '(?!\\s*=[^=])' : '';

    const patternStr = `${delimiters[0]}(${mathcKeys.join('|')})${delimiters[1]}${lookahead}`;
    console.log('patternStr', patternStr);
    */

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
            if (!mathcKeys.length) return null;
            if (!filter(id)) return null;
            return executeReplacement(code, id);
        },

        transform(code, id) {
            if (!mathcKeys.length) return null;
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

            // const [, , ...groups] = match;
            // const idx = groups.findIndex((item) => !!item);

            const foundMatch = Object.entries(match.groups || {}).find(([k, v]) => !!v);
            const namedTuple = matchEntriesNamed[foundMatch[0]];
            //console.log('found', foundName, namedTuple);

            if (namedTuple) {
                const replacement = String(namedTuple[1](id, namedTuple[0], match[0]));

                console.log(`◌◌◌ ${match[0]} ⇄ ${replacement}`, 'found', foundMatch, namedTuple);

                // console.log(idx, `match.groups ◌◌◌ ${JSON.stringify(Object.entries(match.groups || {}))}`);
                // const matchedGroup = Object.entries(match.groups || {}).filter(([[k, v]]) => !!v);
                // console.log(idx, `matchedGroup ◌◌◌ ${matchedGroup.join('◌◌◌◌◌')}`);

                magicString.overwrite(start, end, replacement);
            } else {
                console.error('functionToRun()', match[0]);
            }

            /*
            continue;
            const replacement = String(functionValues[match[1]](id));
            magicString.overwrite(start, end, replacement);

            console.log('codeHasReplacements', 'replacement=', replacement, "!!!!!", match[1], '...');
            console.log('codeHasReplacements', 'magicString=', magicString, "!!!!!");
            */
        }
        return result;
    }

    function isSourceMapEnabled() {
        return options.sourceMap !== false && options.sourcemap !== false;
    }
}
