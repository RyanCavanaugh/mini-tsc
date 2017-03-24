declare global {
    interface String {
        repeat(count: number): string;
    }
}

export interface Renderer {
    sectionHeader(headline: string): string;
    title(title: string): string;
    codeblock(code: string): string;
    literal(codelike: string): string;
}

export const Markdown: Renderer = {
    sectionHeader: s => `**${s}**`,
    title: t => `### ${t}`,
    codeblock: code => '```js\r\n' + code + '\r\n```',
    literal: codelike => '```\r\n' + codelike + '\r\n```',
}

export const Console: Renderer = {
    sectionHeader: s => {
        const padLen = Math.max(0, 58 - s.length) >> 1 << 1;
        const pad = '='.repeat(padLen);
        return pad + ' ' + s + ' ' + pad;
    },
    title: t => `>> ${t} <<`,
    codeblock: code => code.split(/\r?\n/).map(s => '    ' + s).join('\r\n'),
    literal: codelike => codelike,
}
