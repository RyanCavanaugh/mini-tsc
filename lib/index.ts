import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';


class VirtualFileSystem implements ts.CompilerHost {
    private static readonly root: string = '/mini-tsc/';
    private static readonly libRoot: string = '/libs/';

    public outputs: Map<string, string> = new Map();
    private files: Map<string, string> = new Map();
    private sourceFiles: Map<string, ts.SourceFile> = new Map();

    public addFile(fileName: string, content: string): void {
        this.files.set(fileName, content);
    }

    /** Start CompilerHost implementation **/
    getSourceFile(fileName: string, languageVersion: ts.ScriptTarget): ts.SourceFile {
        if (!this.sourceFiles.has(fileName)) {
            const src = this.readFile(fileName);
            this.sourceFiles.set(fileName, ts.createSourceFile(fileName, src, languageVersion));
        }
        return this.sourceFiles.get(fileName)!;
    }

    getDefaultLibFileName(options: ts.CompilerOptions): string {
        return path.join(VirtualFileSystem.libRoot, ts.getDefaultLibFileName(options));
    }

    readFile(fileName: string) {
        if (fileName.startsWith(VirtualFileSystem.libRoot)) {
            return fs.readFileSync(path.join('C:/github/mini-tsc/node_modules/typescript/lib/', path.basename(fileName)), 'utf-8');
        } else {
            if (!this.files.has(fileName)) {
                throw new Error(`File "${fileName} was requested but does not exist`);
            }
            return this.files.get(fileName)!;
        }
    }

    writeFile(fileName: string, data: string) {
        this.outputs.set(fileName, data);
    }

    fileExists(fileName: string) {
        return this.files.has(fileName);
    }

    getCurrentDirectory(): string {
        return VirtualFileSystem.root;
    }

    getDirectories(_path: string): string[] {
        return [];
    }

    getCanonicalFileName(fileName: string): string {
        return path.resolve(VirtualFileSystem.root, fileName).replace(/\\/g, '/');
    }

    useCaseSensitiveFileNames(): boolean {
        return true;
    }
    getNewLine(): string {
        return '\r\n';
    }
    /** End CompilerHost implementation **/
}

interface CompileResult {
    emittedFiles: Map<string, string>;
    diagnostics: ts.Diagnostic[];
}

export default class Compiler {
    private vfs = new VirtualFileSystem();
    private rootFiles: string[] = [];

    options: ts.CompilerOptions = ts.getDefaultCompilerOptions();

    constructor() {

    }

    addRootFile(fileName: string, content: string) {
        this.vfs.addFile(fileName, content);
        this.rootFiles.push(fileName);
    }

    addExtraFile(fileName: string, content: string) {
        this.vfs.addFile(fileName, content);
    }

    compile(): CompileResult {
        let result: CompileResult = {
            emittedFiles: this.vfs.outputs,
            diagnostics: []
        };

        const program = ts.createProgram(this.rootFiles, this.options, this.vfs);
        result.diagnostics.push(...program.getSemanticDiagnostics());
        const emit = program.emit();
        result.diagnostics.push(...emit.diagnostics);
        return result;
    }
}

const c = new Compiler();
c.addRootFile("a.ts", "let x: string = 42;");
let r = c.compile();
console.log(r.diagnostics.map(d => d.messageText).join(','));
console.log([...r.emittedFiles.keys()].map(k => r.emittedFiles.get(k)).join('\r\n'));




