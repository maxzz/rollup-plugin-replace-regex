import chalk from 'chalk';

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
    console.log(chalk.red(`isAllowed "${conditionName}" = '${rv}'`));
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

function splitToLines(cnt: string | undefined): string[] {
    return (cnt || '').split(/\r??\n/g); // w/ empty lines: /\r??\n/g; wo/ empty lines: /[\r\n]+/g or /\r?\n/g
}

export function printReport(report: string[]) {
    report.forEach((line) => console.log(line));
}

export function defineConditions(allowedConditions: string[] | undefined) {
    allowedConditions?.forEach((condition) => definedNames.add(condition));
}

export function commentFile(cnt: string): string | null {
    const lines: string[] = splitToLines(cnt);
    const nestingReport: string[] = [];

    let hasChanges = false;
    let beginBlockIdx: number = -1;
    let blockNesting = 0;

    lines.forEach((line: string, idx: number) => {
        let match = line.match(reComment);
        if (!match) {
            return;
        }

        const [what, condition, comment] = match;
        console.log(chalk.green.dim(`\n${what}`), 'found line match\n');

        if (comment === '<>') {
            definedNames.add(condition);
            return;
        }

        if (comment === '{}') {
            let all = matchAll(reComment.source, line);

            console.log(chalk.yellow(`--> all="${all}"`), all);

            let enableBlock = all.every((match: string[]) => isAllowed(condition));
            if (!enableBlock) {
                hasChanges = true;
                const newLine = lines[idx].replace(/^(\s*)(.*)/, (s, p1, p2) => `${p1}// ${p2}`);
                console.log(`---------{} line \n"${lines[idx]}"\n"${newLine}"\n\n`);

                lines[idx] = newLine; // block is not allowed. replace with whitespace, '//', and the rest.
            }
            return;
        }

        if (comment === '{') {
            nestingReport.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}>>> ${idx}: ${lines[idx]}`);

            blockNesting++;

            if (beginBlockIdx < 0) { // If we are not inside block
                if (!isAllowed(condition)) {
                    beginBlockIdx = idx;
                }
            }
            return;
        }

        if (comment === '}') {
            blockNesting--;
            if (blockNesting < 0) {
                printReport(nestingReport);
                throw new Error(`Mismatched comment blocks: missing opening comment (i.e. '}' before '{')`);
            }

            nestingReport.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}<<< ${idx}: ${lines[idx]}`);

            if (blockNesting === 0) {
                if (beginBlockIdx >= 0) { // If we are inside block
                    hasChanges = true;

                    console.log(chalk.cyan(`---------} lines "${lines[idx]}"\n${beginBlockIdx}, ${idx}\n\n`));

                    commentLines(lines, beginBlockIdx, idx);
                    beginBlockIdx = -1;
                }
            }
        }
    });

    if (blockNesting !== 0) {
        printReport(nestingReport);
        throw new Error(`Mismatched comment blocks: missing closing comment (total +- != 0)`);
    }

    // if (hasChanges) {
    //     console.log('lines', lines);
    // }
    // console.log('////////////////////////////////////////// hasChanges', hasChanges);

    return hasChanges ? lines.join('\r\n') : null;
}
