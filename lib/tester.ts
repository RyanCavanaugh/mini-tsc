import Compiler from './';

const repro = `//@strictNullchecks: true
// @module: umd

// @filename: a.ts
export const m: number = 23;

// @filename: b.ts
import { m } from './a';
console.log(m.toFixed('nah'));
`;

let c = new Compiler();
c.loadReproFile(repro);
let results = c.compile();
// c.addRootFile('foo.tsx', 'var x = <div></div>');
let errs = c.renderErrors(results.diagnostics);
for(const e of errs) {
    console.log('--- error ---');
    console.log(e);
}
for(const fn of Array.from(results.emittedFiles.keys())) {
    console.log(`--- output ${fn} ---`);
    console.log(results.emittedFiles.get(fn));
}
