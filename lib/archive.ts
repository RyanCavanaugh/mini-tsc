import Compiler from './index';
import fs = require('fs');
import path = require('path');

const archiveRoot = path.resolve(path.join(__dirname, `../archive`));
const supported = ['latest', ...fs.readdirSync(archiveRoot)].sort().reverse();

export function getAllVersions() {
    return supported.map(v => create(v));
}

export function create(version = 'latest') {
    if (version === 'latest') {
        return new Compiler(version);
    }

    const archivePath = path.join(archiveRoot, version, 'typescript');
    var tsv: any;
    try {
        tsv = require(archivePath);
    } catch (e) {
        throw new Error(`Unsupported TypeScript version "${version}". Supported values: ${supported.join(', ')}`);
    }
    return new Compiler(version, tsv, path.dirname(require.resolve(archivePath)));
}
