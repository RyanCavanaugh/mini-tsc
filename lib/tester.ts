import Compiler from './';
import ts = require('typescript');
import path = require('path');

let repro = `// @strictNullChecks: true
// @module: umd
// @declaration: true

// @filename: b.ts
interface ROObject {
    readonly [index: string]: number;
}
const o: ROObject = { x: 1 };
// unexpected: here reassign is allowed
o.x = 2;
`;

const compilers = [undefined, 'ts2.2', 'ts2.1', 'ts2.0', 'ts1.8'];

console.log(`# mini-tsc@${require(path.join(__dirname, '../package.json')).version} Report`);

console.log('## Input File');
console.log('```ts');
console.log(repro);
console.log('```');

console.log('## Results');

let lastResult = '';
for (let i = 0; i < compilers.length; i++) {
    let name: string;
    const comp = compilers[i];
    let c: Compiler;
    if (comp === undefined) {
        c = new Compiler('latest');
        name = ts.version;
    } else {
        const archivePath = `../archive/${comp}/typescript`
        var tsv = require(archivePath);
        name = tsv.version;
        c = new Compiler(name, tsv, path.dirname(require.resolve(archivePath)));
    }

    c.loadReproFile(repro);
    let results = c.compile();

    const lines: string[] = [];
    let errs = c.renderErrors(results.diagnostics);
    if (errs.length > 0) {
        lines.push(`**Diagnostics (${results.diagnostics.length})**`);
        lines.push('```');
        lines.push(...errs);
        lines.push('```');
    }

    const emits = Array.from(results.emittedFiles.keys());
    if (emits.length > 0) {
        lines.push(`**Emitted Files (${emits.length})**`);
        for (const fn of emits) {
            lines.push(`\`${fn}\``);
            lines.push('```js');
            lines.push(results.emittedFiles.get(fn)!);
            lines.push('```');
        }
    }

    const result = lines.join('\r\n');
    if (result !== lastResult) {
        console.log(`### Results from version ${name}`);
        console.log(result);
    } else {
        console.log(`### ${name}: Same as above`);
    }
    lastResult = result;

    if (!c.internalOptions.regress) {
        break;
    }
}
