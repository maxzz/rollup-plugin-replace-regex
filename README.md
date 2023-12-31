# rollup-plugin-replace-regex

This is a modified copy of @rollup/plugin-replace with the ability to match regular expression strings and process conditional comment blocks.

## Changes and additions to RollupReplaceOptions

The RollupReplaceOptions type is defined [here](./types/index.d.ts).

### Regex values

New regexValues key to specify replacement pairs where the key can be a regular expression.

  * *key* may contain regex expression (except regex group definitions)
    * regex keys ignore the boundaries option, 
      but boundaries can be added as part of the regex manually
  * *value* is a string or function that gets
    * file id
    * matched expression by regex key
    * original matched regex key from regexValues

### Conditional comments

* comments

   Special source code comment marks are converted to:
    | source | result |
    | ---    |---     |
    | /*{}*/            | // |
    | /*[condition]{}*/ | //[condition]{}*/|
    | /*[condition]{*/  | /*[condition]{*/ and line comments 
    | |until the next closing mark|
    | /*[condition]}*/  | /*[condition]}*/|
    | /*[condition]}*/  | /*[condition]}*/|

    It is possible to specify multiple conditions in a single line and the line won't be commneted only if all 
    of them are defined:
    ```js 
    /* [aa]<> */ // This line adds 'aa' to allowed definitions
    /* [bb]<> */ // This line adds 'bb' to allowed definitions
    /*[aa]{}*/ /*[bb]{}*/ 'aa and bb are defined' 
    ```

  If commentsForRelease option is true then all conditional blocks will be commented 
  regardless defined conditions

* conditions
  * additional conditions for comments

* commentsForRelease

* verbose
  * print matching and comments process results.

### Execution order

  rollup-plugin-replace-regex supports three diffent modes: 
   * values replace
   * values with regular expressions
   * comments

  comments operation is executed before values replace. If you need opposite then 
  call rollup-plugin-replace-regex plugin twice:

  ```js
    plugins: [
        rollup-plugin-replace-regex({values: ...}),
        rollup-plugin-replace-regex({cooments: true}),
    ]
  ```

## TODO 
    Add an option to specify when to run actions. Now we run all jobs on transform hook vs. orignal plugin does both transform and renderChunk hooks.

# @rollup/plugin-replace

🍣 A Rollup plugin which replaces targeted strings in files while bundling.

[npm]: https://img.shields.io/npm/v/@rollup/plugin-replace
[npm-url]: https://www.npmjs.com/package/@rollup/plugin-replace
[size]: https://packagephobia.now.sh/badge?p=@rollup/plugin-replace
[size-url]: https://packagephobia.now.sh/result?p=@rollup/plugin-replace

[![npm][npm]][npm-url]
[![size][size]][size-url]
[![libera manifesto](https://img.shields.io/badge/libera-manifesto-lightgrey.svg)](https://liberamanifesto.com)

## Requirements

This plugin requires an [LTS](https://github.com/nodejs/Release) Node version (v14.0.0+) and Rollup v1.20.0+.

## Install

Using npm:

```console
npm install @rollup/plugin-replace --save-dev
```

## Usage

Create a `rollup.config.js` [configuration file](https://www.rollupjs.org/guide/en/#configuration-files) and import the plugin:

```js
import replace from '@rollup/plugin-replace';

export default {
  input: 'src/index.js',
  output: {
    dir: 'output',
    format: 'cjs'
  },
  plugins: [
    replace({
      'process.env.NODE_ENV': JSON.stringify('production'),
      __buildDate__: () => JSON.stringify(new Date()),
      __buildVersion: 15
    })
  ]
};
```

Then call `rollup` either via the [CLI](https://www.rollupjs.org/guide/en/#command-line-reference) or the [API](https://www.rollupjs.org/guide/en/#javascript-api).

The configuration above will replace every instance of `process.env.NODE_ENV` with `"production"` and `__buildDate__` with the result of the given function in any file included in the build.

_Note: Values must be either primitives (e.g. string, number) or `function` that returns a string. For complex values, use `JSON.stringify`. To replace a target with a value that will be evaluated as a string, set the value to a quoted string (e.g. `"test"`) or use `JSON.stringify` to preprocess the target string safely._

Typically, `@rollup/plugin-replace` should be placed in `plugins` _before_ other plugins so that they may apply optimizations, such as dead code removal.

## Options

In addition to the properties and values specified for replacement, users may also specify the options below.

### `delimiters`

Type: `Array[String, String]`<br>
Default: `['\\b', '\\b(?!\\.)']`

Specifies the boundaries around which strings will be replaced. By default, delimiters are [word boundaries](https://www.regular-expressions.info/wordboundaries.html) and also prevent replacements of instances with nested access. See [Word Boundaries](#word-boundaries) below for more information.
For example, if you pass `typeof window` in `values` to-be-replaced, then you could expect the following scenarios:

- `typeof window` **will** be replaced
- `typeof window.document` **will not** be replaced due to `(?!\.)` boundary
- `typeof windowSmth` **will not** be replaced due to a `\b` boundary

Delimiters will be used to build a `Regexp`. To match special characters (any of `.*+?^${}()|[]\`), be sure to [escape](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping) them.

### `objectGuards`

Type: `Boolean`<br>
Default: `false`

When replacing dot-separated object properties like `process.env.NODE_ENV`, will also replace `typeof process` object guard
checks against the objects with the string `"object"`.

For example:

```js
replace({
  values: {
    'process.env.NODE_ENV': '"production"'
  }
});
```

```js
// Input
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
  console.log('production');
}
// Without `objectGuards`
if (typeof process !== 'undefined' && 'production' === 'production') {
  console.log('production');
}
// With `objectGuards`
if ('object' !== 'undefined' && 'production' === 'production') {
  console.log('production');
}
```

### `preventAssignment`

Type: `Boolean`<br>
Default: `false`

Prevents replacing strings where they are followed by a single equals sign. For example, where the plugin is called as follows:

```js
replace({
  values: {
    'process.env.DEBUG': 'false'
  }
});
```

Observe the following code:

```js
// Input
process.env.DEBUG = false;
if (process.env.DEBUG == true) {
  //
}
// Without `preventAssignment`
false = false; // this throws an error because false cannot be assigned to
if (false == true) {
  //
}
// With `preventAssignment`
process.env.DEBUG = false;
if (false == true) {
  //
}
```

### `exclude`

Type: `String` | `Array[...String]`<br>
Default: `null`

A [picomatch pattern](https://github.com/micromatch/picomatch), or array of patterns, which specifies the files in the build the plugin should _ignore_. By default no files are ignored.

### `include`

Type: `String` | `Array[...String]`<br>
Default: `null`

A [picomatch pattern](https://github.com/micromatch/picomatch), or array of patterns, which specifies the files in the build the plugin should operate on. By default all files are targeted.

### `values`

Type: `{ [key: String]: Replacement }`, where `Replacement` is either a string or a `function` that returns a string.
Default: `{}`

To avoid mixing replacement strings with the other options, you can specify replacements in the `values` option. For example, the following signature:

```js
replace({
  include: ['src/**/*.js'],
  changed: 'replaced'
});
```

Can be replaced with:

```js
replace({
  include: ['src/**/*.js'],
  values: {
    changed: 'replaced'
  }
});
```

## Word Boundaries

By default, values will only match if they are surrounded by _word boundaries_.

Consider the following options and build file:

```js
module.exports = {
  ...
  plugins: [replace({ changed: 'replaced' })]
};
```

```js
// file.js
console.log('changed');
console.log('unchanged');
```

The result would be:

```js
// file.js
console.log('replaced');
console.log('unchanged');
```

To ignore word boundaries and replace every instance of the string, wherever it may be, specify empty strings as delimiters:

```js
export default {
  ...
  plugins: [
    replace({
      changed: 'replaced',
      delimiters: ['', '']
    })
  ]
};
```

## Meta

[CONTRIBUTING](/.github/CONTRIBUTING.md)

[LICENSE (MIT)](/LICENSE)
