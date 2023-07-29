import MagicString from 'magic-string';
import { createFilter } from '@rollup/pluginutils';
import { Replacement, RollupReplaceOptions } from '../types';
import { NullValue, PluginContext, RenderedChunk, SourceMap, SourceMapInput, TransformResult } from 'rollup';

function escape(str: string) {
    return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

function ensureFunction(functionOrValue: Function | string): Function {
    if (typeof functionOrValue === 'function') return functionOrValue;
    return () => functionOrValue;
}

function longest(a: any[], b: any[]) {
    return b.length - a.length;
}

function getReplacements(options: RollupReplaceOptions): KeyReplacement {
    if (options.values) {
        return Object.assign({}, options.values);
    }
    const values = Object.assign({}, options) as KeyReplacement;
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

type KeyReplacement = Record<string, Replacement>;
type KeyFunction = Record<string, Function>;

function getRegexReplacements(options: RollupReplaceOptions): KeyReplacement {
    return options.regexValues ? Object.assign({}, options.regexValues) : {};
}

function mapToFunctions(object: KeyReplacement): KeyFunction {
    return Object
        .keys(object)
        .reduce((fns, key) => {
            const functions = Object.assign({}, fns);
            functions[key] = ensureFunction(object[key]);
            return functions;
        }, {} as KeyFunction);
}

const objKeyRegEx = /^([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)(\.([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*))+$/;

function expandTypeofReplacements(replacements: KeyReplacement) {
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

export default function replace(options: RollupReplaceOptions = {}) {
    const filter = createFilter(options.include, options.exclude);
    const { delimiters = ['\\b', '\\b(?!\\.)'], preventAssignment, objectGuards } = options;

    const replacements = getReplacements(options);
    const regexReplacements = getRegexReplacements(options);

    if (objectGuards) {
        expandTypeofReplacements(replacements);
    }

    function make(values: KeyReplacement, groupsName: string) {
        const tuples = Object
            .entries(mapToFunctions(values))
            .sort((a, b) => b[0].length - a[0].length) // longest
            .map(([k, v], idx) => [`${groupsName}${idx}`, k, v]);
        return {
            patterns: tuples.map(([group, pattern, func]) => `(?<${group}>${pattern})`),
            groups: Object.fromEntries(tuples.map(([group, pattern, func]) => [group, [pattern, func]])),
        };
    }

    const groupNrm = make(replacements, 'n');
    const groupReg = make(regexReplacements, 'r');

    const hasKeys = groupNrm.patterns.length || groupReg.patterns.length;
    const namedGropus = Object.assign({}, groupNrm.groups, groupReg.groups);

    const lookahead = preventAssignment ? '(?!\\s*=[^=])' : '';
    const patternStr = `(${groupReg.patterns.join('|')})|(${delimiters[0]}(${groupNrm.patterns.join('|')})${delimiters[1]}${lookahead})`;
    const pattern = new RegExp(patternStr, 'g');

    return {
        name: 'replace',

        buildStart(this: PluginContext) {
            if (![true, false].includes(!!preventAssignment)) {
                this.warn({ message: "@rollup/plugin-replace: 'preventAssignment' currently defaults to false. It is recommended to set this option to `true`, as the next major version will default this option to `true`." });
            }
        },

        renderChunk(code: string, chunk: RenderedChunk): { code: string; map?: SourceMapInput } | string | NullValue {
            const id = chunk.fileName;
            if (!hasKeys) return null;
            if (!filter(id)) return null;
            return executeReplacement(code, id);
        },

        transform(code: string, id: string): TransformResult {
            if (!hasKeys) return null;
            if (!filter(id)) return null;
            return executeReplacement(code, id);
        }
    };

    function executeReplacement(code: string, id: string) {
        const magicString = new MagicString(code);
        if (!codeHasReplacements(code, id, magicString)) {
            return null;
        }

        const result = { code: magicString.toString() } as { code: string; map?: SourceMap };
        if (isSourceMapEnabled()) {
            result.map = magicString.generateMap({ hires: true });
        }
        return result;
    }

    function codeHasReplacements(code: string, id: string, magicString: MagicString) {
        let result = false;
        let match;

        while ((match = pattern.exec(code))) {
            result = true;

            const start = match.index;
            const end = start + match[0].length;

            const foundMatch = Object.entries(match.groups || {}).find(([k, v]) => !!v)?.[0]!;
            const namedTuple = namedGropus[foundMatch];

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

    function isSourceMapEnabled(): boolean {
        return options.sourceMap !== false && options.sourcemap !== false;
    }
}
