//class ConditionalComments {
    const checkConditions: boolean = true;

    const definedNames: Set<string> = new Set();
    const re = /\/\*\s*(?:\[\s*(\w+\s*(?:,\s*?\w+)*)\s*\])??\s*({|}|{}|<>)\s*\*\//; // m1 - definition names (separated by commas); m2 - operation: '{}', '//', '{', '}', '<>'
    const filler = { '{}': '//', '{': '/*', '}': '*/', '<>': '' };

    function isAllowed(name: string): boolean {
        if (!checkConditions) {
            return false;
        }
        if (!name) {
            return true;
        }
        let rv = name.split(',').map((s: string) => s.trim()).every((s: string) => definedNames.has(s));
        return rv;
    }

    const whitespace = /^(\s+)/;
    function caclIndent(lines: string[], from_: number, to_: number): string {
        let rv = 0;
        for (let i = from_; i <= to_; i++) {
            let space = whitespace.exec(lines[i]);
            if (space && (space[1].length < rv || i === from_)) {
                rv = space[1].length;
            }
        }
        return (' ' as any).repeat(rv);
    }

    function commentLines(lines: string[], from_: number, to_: number): void {
        let indent = caclIndent(lines, from_, to_);

        for (let i = from_; i <= to_; i++) {
            if (lines[i].length > indent.length) {
                lines[i] = `${indent}//${lines[i].slice(indent.length)}`;
            } else {
                lines[i] = `${indent}//${lines[i]}`;
            }
        }
    }

    function matchAll(re: string, s: string): string[][] {
        // <-
        // "        /*[traceDc]{}*/ /*[csRawMutations]{}*/ this.muTrace && this.muTrace.traceMutations(muts);"
        // ->
        // Array(2) [Array(3), Array(3)]
        // 0:Array(3) ["/*[traceDc]{}*/", "traceDc", "{}"]
        // 1:Array(3) ["/*[csRawMutations]{}*/", "csRawMutations", "{}"]
        //
        let rv = [];
        let local = new RegExp(re, 'g'); // make regex global
        let m: string[] | null;
        while ((m = local.exec(s))) {
            rv.push(m);
        }
        return rv;
    }

    export function printReport(report: string[]) {
        report.forEach(_ => console.log(_));
    }

    export function commentFile(cnt: string): string {
        let lines: string[] = cnt.split(/\r??\n/g); // or let lines = content.split(/\r?\n/g); // The best without empty lines: cnt.split(/[\r\n]+/g); // Preserve line numbers: /\r??\n/g

        let beginBlockIdx: number = -1;
        let blockNesting = 0;

        let report: string[] = [];

        lines.forEach((line: string, index: number) => {
            let m = line.match(re);
            if (m) {
                if (m[2] === '<>') {
                    definedNames.add(m[1]);
                    return;
                }

                if (m[2] === '{}') {
                    let all = matchAll(re.source, line);
                    let allow = all.every((match: string[]) => {
                        return isAllowed(match[1])
                    });
                    if (!allow) {
                        lines[index] = lines[index].replace(/^(\s+)(.*)/, (s, p1, p2) => `${p1}// ${p2}`); // block is not allowed. replace with whitespace, '//', and the rest.
                    }
                    return;
                }

                if (m[2] === '{') {
                    report.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}>>> ${index}: ${lines[index]}`);

                    blockNesting++;

                    if (beginBlockIdx < 0) { // If we are not inside block
                        if (!isAllowed(m[1])) {
                            beginBlockIdx = index;
                        }
                    }
                    return;
                }

                if (m[2] === '}') {
                    blockNesting--;
                    if (blockNesting < 0) {
                        printReport(report);
                        throw new Error(`TM: mismatched pre-processor comment blocks '}'. missing prev open comment block.`)
                    }

                    report.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}<<< ${index}: ${lines[index]}`);

                    if (blockNesting === 0) {
                        if (beginBlockIdx >= 0) { // If we are inside block
                            commentLines(lines, beginBlockIdx, index);
                            beginBlockIdx = -1;
                        }
                    }
                }
            }
        });

        if (blockNesting !== 0) {
            printReport(report);
            throw new Error(`TM: mismatched pre-processor comment blocks {!==0}. missing prev closing comment block.`)
        }

        return lines.join('\r\n');
    } //commentFile()

//} //class ConditionalComments

