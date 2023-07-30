import { readFileSync } from 'fs';

//import buble from '@rollup/plugin-buble';
import resolve from '@rollup/plugin-node-resolve';
import cjs from '@rollup/plugin-commonjs';

import { createConfig } from './shared/rollup.config.mjs';

const config = createConfig({
    pkg: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
});

config.plugins.push(resolve());
config.plugins.push(cjs());

export default {
    ...config,
    input: 'src/index.ts',
    //plugins: [resolve()]
    //   plugins: [buble()]
};
