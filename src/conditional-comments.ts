const checkConditions: boolean = true;

const definedNames: Set<string> = new Set();

// m1 - definition names (separated by commas); m2 - operation: '{}', '//', '{', '}', '<>'
const reComment = /\/\*\s*(?:\[\s*(\w+\s*(?:,\s*?\w+)*)\s*\])??\s*({|}|{}|<>)\s*\*\//;

//const filler = { '{}': '//', '{': '/*', '}': '*/', '<>': '' };

function isAllowed(conditionName: string): boolean {
    if (!checkConditions) {
        return false;
    }
    if (!conditionName) {
        console.log(`isAllowed "${conditionName}" = true`);
        return true;
    }
    let rv = conditionName.split(',').map((s) => s.trim()).every((s) => definedNames.has(s));
    console.log(`isAllowed "${conditionName}" = '${rv}'`);
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
    return ' '.repeat(rv);
}

function commentLines(lines: string[], idxFrom: number, idxTo: number): void {
    let indent = caclIndent(lines, idxFrom, idxTo);

    for (let i = idxFrom; i <= idxTo; i++) {
        if (lines[i].length > indent.length) {
            lines[i] = `${indent}//${lines[i].slice(indent.length)}`;
        } else {
            lines[i] = `${indent}//${lines[i]}`;
        }
    }
}

function matchAll(regexToMatch: string, s: string): string[][] {
    // <-
    // "        /*[traceDc]{}*/ /*[csRawMutations]{}*/ this.muTrace && this.muTrace.traceMutations(muts);"
    // ->
    // Array(2) [Array(3), Array(3)]
    // 0:Array(3) ["/*[traceDc]{}*/", "traceDc", "{}"]
    // 1:Array(3) ["/*[csRawMutations]{}*/", "csRawMutations", "{}"]
    //

    const rv = [];
    const localRegex = new RegExp(regexToMatch, 'g'); // make regex global
    let m: string[] | null;
    while ((m = localRegex.exec(s))) {
        rv.push(m);
    }
    return rv;
}

export function printReport(report: string[]) {
    report.forEach((line) => console.log(line));
}

export function defineConditions(allowedConditions: string[] | undefined) {
    allowedConditions?.forEach((condition) => definedNames.add(condition));
}

export function commentFile(cnt: string): string | null {
    const lines: string[] = cnt.split(/\r??\n/g); // or let lines = content.split(/\r?\n/g); // The best without empty lines: cnt.split(/[\r\n]+/g); // Preserve line numbers: /\r??\n/g
    const nestingReport: string[] = [];

    let hasChanges = false;
    let beginBlockIdx: number = -1;
    let blockNesting = 0;

    console.log('\n\n');

    lines.forEach((line: string, index: number) => {
        let m = line.match(reComment);
        if (!m) {
            return;
        }

        if (m[2] === '<>') {
            definedNames.add(m[1]);
            return;
        }

        if (m[2] === '{}') {
            let all = matchAll(reComment.source, line);
            let enableBlock = all.every((match: string[]) => isAllowed(match[1]));
            if (!enableBlock) {
                hasChanges = true;
                const newLine = lines[index].replace(/^(\s*)(.*)/, (s, p1, p2) => `${p1}// ${p2}`);
                console.log(`---------{} line \n"${lines[index]}"\n"${newLine}"\n\n`);

                lines[index] = newLine; // block is not allowed. replace with whitespace, '//', and the rest.
            }
            return;
        }

        if (m[2] === '{') {
            nestingReport.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}>>> ${index}: ${lines[index]}`);

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
                printReport(nestingReport);
                throw new Error(`TM: mismatched pre-processor comment blocks '}'. missing prev open comment block.`);
            }

            nestingReport.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}<<< ${index}: ${lines[index]}`);

            if (blockNesting === 0) {
                if (beginBlockIdx >= 0) { // If we are inside block
                    hasChanges = true;

                    console.log(`---------} lines "${lines[index]}"\n${beginBlockIdx}, ${index}\n\n`);

                    commentLines(lines, beginBlockIdx, index);
                    beginBlockIdx = -1;
                }
            }
        }
    });

    if (blockNesting !== 0) {
        printReport(nestingReport);
        throw new Error(`TM: mismatched pre-processor comment blocks {!==0}. missing prev closing comment block.`);
    }

    if (hasChanges) {
        console.log('lines', lines);
    }
    console.log('////////////////////////////////////////// hasChanges', hasChanges);

    return hasChanges ? lines.join('\r\n') : null;
}
