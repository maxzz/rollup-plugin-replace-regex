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

    function make(values, groupsName) {
        const tuples = Object
            .entries(mapToFunctions(values))
            .sort((a, b) => b[0].length - a[0].length) // longest
            .map(([k, v], idx) => [`${groupsName}${idx}`, k, v]);
        return {
            patterns: tuples.map(([group, pattern, func]) => `(?<${group}>${pattern})`),
            groups: Object.fromEntries(tuples.map(([group, pattern, func]) => [group, [pattern, func]])),
        }
    }

    const groupNrm = make(replacements, 'n');
    const groupReg = make(regexReplacements, 'r');

    const hasKeys = groupNrm.patterns.length || groupReg.patterns.length;
    const namedGropus = Object.assign({}, groupNrm.groups, groupReg.groups);

    // console.log('groupNrm', groupNrm);
    // console.log('groupReg', groupReg);
    // console.log('namedGropus', namedGropus);

    const lookahead = preventAssignment ? '(?!\\s*=[^=])' : '';

    const patternStr = `(${groupReg.patterns.join('|')})|(${delimiters[0]}(${groupNrm.patterns.join('|')})${delimiters[1]}${lookahead})`;
    // console.log('patternStr', patternStr);

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
            if (!hasKeys) return null;
            if (!filter(id)) return null;
            return executeReplacement(code, id);
        },

        transform(code, id) {
            if (!hasKeys) return null;
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

        while ((match = pattern.exec(code))) {
            result = true;

            const start = match.index;
            const end = start + match[0].length;

            const foundMatch = Object.entries(match.groups || {}).find(([k, v]) => !!v);
            const namedTuple = namedGropus[foundMatch[0]];

            if (namedTuple) {
                const replacement = String(namedTuple[1](id, namedTuple[0], match[0]));
                magicString.overwrite(start, end, replacement);

                console.log(`◌◌◌◌◌◌◌◌◌ ${match[0]} ⇄ ${replacement}`, 'found', foundMatch, namedTuple);
            } else {
                console.error('functionToRun()', match[0]);
            }
        }
        return result;
    }

    function isSourceMapEnabled() {
        return options.sourceMap !== false && options.sourcemap !== false;
    }
}
