#!/usr/bin/env node

const commander = require('commander');
import { create, getAllVersions } from './archive';
import fs = require('fs');
import path = require('path');
import clipboard = require('copy-paste');
import Compiler from './index';

commander
    .usage('[options] [<file>]')
    .option('-v, --version [version]', 'Load a specific TypeScript version', 'latest')
    .option('-m, --markdown', 'Generate markdown report')
    .option('-e, --errors', 'Print errors')
    .option('-s, --stdin', 'Read from stdin')
    .option('-r, --regress', 'Regress for errors and emit differences')
    .parse(process.argv);

main();

function main() {
    if (commander.stdin) {
        var data = '';
        process.stdin.on('readable', function (this: any) {
            var chunk = this.read();
            if (chunk !== null) {
                data += chunk;
            }
        });
        process.stdin.on('end', function () {
            run(data, 'stdin.ts');
        });
    } else {
        const file = commander.args[0];
        if (file) {
            const fileContent = fs.readFileSync(file, 'utf8');
            run(fileContent, path.basename(file));
            return;
        }
        clipboard.paste((_err, data) => {
            if (data) {
                run(data, 'clipboard.ts');
            } else {
                console.log('No input specified');
                return;
            }
        });
    }
}

function run(content: string, filename: string) {
    if (commander.regress) {
        const compilers = getAllVersions();
        for (const comp of compilers) {
            console.log(`=== ${comp.version} ===`);
            go(comp);
        }
    } else {
        const comp = create(commander.version);
        go(comp);
    }

    function go(comp: Compiler) {
        comp.loadReproFile(content, filename);

        const result = comp.compile();
        let errs = comp.renderErrors(result.diagnostics);
        for (const e of errs.slice(0, 10)) {
            console.log(e);
        }
        if (errs.length > 10) {
            console.log(`... ${errs.length - 10} more errors not shown`);
        }
    }
}
