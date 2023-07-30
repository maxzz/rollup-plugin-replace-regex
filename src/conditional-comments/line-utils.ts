export function splitToLines(cnt: string | undefined): string[] {
    return (cnt || '').split(/\r??\n/g); // w/ empty lines: /\r??\n/g; wo/ empty lines: /[\r\n]+/g or /\r?\n/g
}

const whitespace = /^(\s+)/;
export function caclIndent(lines: string[], from_: number, to_: number): string {
    let rv = 0;
    for (let i = from_; i <= to_; i++) {
        let space = whitespace.exec(lines[i]);
        if (space && (space[1].length < rv || i === from_)) {
            rv = space[1].length;
        }
    }
    return ' '.repeat(rv);
}

export function commentLines(lines: string[], idxFrom: number, idxTo: number): void {
    let indent = caclIndent(lines, idxFrom, idxTo);

    for (let i = idxFrom; i <= idxTo; i++) {
        if (lines[i].length > indent.length) {
            lines[i] = `${indent}//${lines[i].slice(indent.length)}`;
        } else {
            lines[i] = `${indent}//${lines[i]}`;
        }
    }
}
