import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

// Hack in some internal stuff
declare module "typescript" {
    type Option = {
        name: string;
        type: "list" | "boolean" | "number" | "string" | ts.Map<number>;
        element?: Option;
    }

    const optionDeclarations: Array<Option>;
}

const defaultTsLibsPath = path.dirname(require.resolve('typescript'));

function parsePrimitive(value: string, type: string): any {
    switch (type) {
        case "number": return +value;
        case "string": return value;
        case "boolean": return (value.toLowerCase() === "true") || (value.length === 0);
    }
    throw new Error(`Unknown primitive type ${type}`);
}

class VirtualFileSystem implements ts.CompilerHost {
    private static readonly root: string = '/mini-tsc/';
    private static readonly libRoot: string = '/libs/';

    public outputs: Map<string, string> = new Map();
    private files: Map<string, string> = new Map();
    private sourceFiles: Map<string, ts.SourceFile> = new Map();

    constructor(private tsModule: typeof ts, private libRoot: string) {
    }

    public addFile(fileName: string, content: string): void {
        fileName = this.getCanonicalFileName(fileName);
        this.files.set(fileName, content);
    }

    /** Start CompilerHost implementation **/
    getSourceFile(fileName: string, languageVersion: ts.ScriptTarget): ts.SourceFile {
        if (!this.sourceFiles.has(fileName)) {
            const src = this.readFile(fileName);
            this.sourceFiles.set(fileName, this.tsModule.createSourceFile(fileName, src, languageVersion));
        }
        return this.sourceFiles.get(fileName)!;
    }

    getDefaultLibFileName(options: ts.CompilerOptions): string {
        return path.join(VirtualFileSystem.libRoot, this.tsModule.getDefaultLibFileName(options));
    }

    readFile(fileName: string) {
        if (fileName.startsWith(VirtualFileSystem.libRoot)) {
            return fs.readFileSync(path.join(this.libRoot, path.basename(fileName)), 'utf-8');
        } else {
            fileName = this.getCanonicalFileName(fileName);
            if (!this.files.has(fileName)) {
                throw new Error(`File "${fileName}"" was requested but does not exist`);
            }
            return this.files.get(fileName)!;
        }
    }

    writeFile(fileName: string, data: string) {
        this.outputs.set(fileName, data);
    }

    fileExists(fileName: string) {
        const result = this.files.has(fileName);
        return result;
    }

    getCurrentDirectory(): string {
        return VirtualFileSystem.root;
    }

    getDirectories(_path: string): string[] {
        return [];
    }

    getCanonicalFileName(fileName: string): string {
        const result = path.posix.resolve(VirtualFileSystem.root, fileName).replace(/\\/g, '/');
        return result;
    }

    useCaseSensitiveFileNames(): boolean {
        return true;
    }

    getNewLine(): string {
        return '\r\n';
    }
    /** End CompilerHost implementation **/
}

export interface CompileResult {
    emittedFiles: Map<string, string>;
    diagnostics: ts.Diagnostic[];
}

export default class Compiler {
    private vfs: VirtualFileSystem;
    private rootFiles: string[] = [];

    public options: ts.CompilerOptions;
    public internalOptions = {
        regress: false
    }

    constructor(version: string);
    constructor(version: string, tsModule: typeof ts, libRoot: string);
    constructor(public readonly version: string, public tsModule = ts, public libRoot = defaultTsLibsPath) {
        this.vfs = new VirtualFileSystem(this.tsModule, libRoot)
        this.options = this.tsModule.getDefaultCompilerOptions();
        // Helpers generate diff noise, suppress them
        this.options.noEmitHelpers = true;
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

        const program = this.tsModule.createProgram(this.rootFiles, this.options, this.vfs);
        result.diagnostics.push(...program.getSyntacticDiagnostics());
        result.diagnostics.push(...program.getSemanticDiagnostics());
        result.diagnostics.push(...program.getGlobalDiagnostics());
        result.diagnostics.push(...program.getDeclarationDiagnostics());
        result.diagnostics.push(...program.getOptionsDiagnostics());
        const emit = program.emit();
        result.diagnostics.push(...emit.diagnostics);
        return result;
    }

    parseOption(name: string, value: string) {
        switch (name.toLowerCase()) {
            case 'regress':
                this.internalOptions.regress = parsePrimitive(value, 'boolean');
                return;
        }

        for (const opt of ts.optionDeclarations) {
            if (opt.name.toLowerCase() === name.toLowerCase()) {
                switch (opt.type) {
                    case "number":
                    case "string":
                    case "boolean":
                        this.options[opt.name] = parsePrimitive(value, opt.type);
                        break;

                    case "list":
                        this.options[opt.name] = value.split(',').map(v => parsePrimitive(v, opt.element!.type as string));
                        break;

                    default:
                        this.options[opt.name] = opt.type.get(value.toLowerCase());
                        if (this.options[opt.name] === undefined) {
                            const keys = Array.from(opt.type.keys() as any);
                            throw new Error(`Invalid value ${value} for ${opt.name}. Allowed values: ${keys.join(",")}`);
                        }
                        break;
                }
                return;
            }
        }

        throw new Error(`Compiler option ${name} does not exist`);
    }


    renderErrors(diagnostics: ts.Diagnostic[]): string[] {
        const result: string[] = [];
        for (const d of diagnostics) {
            const output: string[] = [];

            if (d.file === undefined) {
                result.push(ts.flattenDiagnosticMessageText(d.messageText, '\r\n'));
                continue;
            }

            const src = d.file.getFullText();
            // Walk back to the start of the line
            let lineStart = src.lastIndexOf('\n', d.start);
            // Handle case where the error is on the first line
            if (lineStart === -1) lineStart = 0;
            let lineEnd = src.indexOf('\n', d.start! + d.length!);
            if (lineEnd === -1) lineEnd = src.length - 1;
            let srcLine = '', errLine = '';
            for (let i = lineStart; i < lineEnd; i++) {
                if (src[i] === '\n') {
                    output.push(srcLine);
                    if (errLine.length) output.push(errLine);
                    srcLine = errLine = '';
                } else if (src[i] === '\r') {
                    // Ignore
                } else {
                    srcLine += src[i];
                    if (i >= d.start! && i < d.start! + d.length!) {
                        if (src[i] === '\t') {
                            errLine += '~~~~';
                        } else {
                            errLine += '~';
                        }
                    } else {
                        if (/\s/.test(src[i])) {
                            errLine += src[i];
                        } else {
                            errLine += ' ';
                        }
                    }
                }
            }
            // Normalize tabs to spaces so the ~s line up correctly
            const pos = d.file.getLineAndCharacterOfPosition(d.start!);
            const prefix = `${d.file.fileName}:${pos.line + 1} `;
            output.push(prefix + srcLine.replace(/\t/g, '    '));
            // Write out the ~s
            if (errLine.length) output.push(prefix.replace(/./g, ' ') + errLine);
            const messageText = ts.flattenDiagnosticMessageText(d.messageText, '\r\n  ');
            output.push(`  TS${d.code}: ${messageText}`);
            result.push(output.join('\r\n'));
        }
        return result;
    }

    loadReproFile(content: string, defaultFilename = 'repro.ts') {
        const booleanOptionRegex = /^\/\/\s?@(\S+)$/;
        const valueOptionRegex = /^\/\/\s?@([^:]+):\s?(.+)$/;

        const lines = content.split(/\r?\n/g);
        const currentFileContent: string[] = [];
        let workingFilename = defaultFilename;
        for (const line of lines) {
            if (line.trim().length === 0 && currentFileContent.length === 0) {
                continue;
            }

            let m: RegExpExecArray | null;
            if (m = booleanOptionRegex.exec(line)) {
                this.parseOption(m[1], "true");
                this.options[m[1]] = true;
            } else if (m = valueOptionRegex.exec(line)) {
                let optName: string = m[1];
                switch (optName.toLowerCase()) {
                    case 'filename':
                        if (currentFileContent.length > 0) {
                            this.addRootFile(workingFilename, currentFileContent.join('\r\n'));
                            currentFileContent.length = 0;
                        }
                        workingFilename = m[2];
                        break;
                    default:
                        this.parseOption(m[1], m[2]);
                        break;
                }
            } else {
                currentFileContent.push(line);
            }
        }
        this.addRootFile(workingFilename, currentFileContent.join('\r\n'));
    }
}
