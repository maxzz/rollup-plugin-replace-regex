import chalk from 'chalk';
import { splitToLines, commentLines } from './line-utils';

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

export function commentFile(cnt: string): string | null {
    const lines: string[] = splitToLines(cnt);
    const nestingReport: string[] = [];

    let hasChanges = false;
    let beginBlockIdx: number = -1;
    let blockNesting = 0;

    function checkLine(line: string, idx: number) {
        let match = line.match(reComment);
        if (!match) {
            return;
        }

        const [mtchedStr, condition, doWhat] = match;
        console.log(chalk.green.dim(`\n${mtchedStr}`), 'found line match\n');

        switch (doWhat) {
            case '<>': {
                definedNames.add(condition);
                break;
            }
            case '{}': {
                let all = matchAll(reComment.source, line);

                console.log(chalk.yellow(`--> all="${all}"`), all);

                let enableBlock = all.every((matches: string[]) => isAllowed(matches[1]));
                if (!enableBlock) {
                    const newLine = lines[idx].replace(/^(\s*)(.*)/, (s, p1, p2) => `${p1}// ${p2}`);
                    console.log(`---------{} line \n"${lines[idx]}"\n"${newLine}"\n\n`);

                    lines[idx] = newLine; // block is not allowed. replace with whitespace, '//', and the rest.
                    hasChanges = true;
                }
                break;
            }
            case '{': {
                nestingReport.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}>>> ${idx}: ${lines[idx]}`);

                blockNesting++;

                if (beginBlockIdx < 0) { // If we are not inside block
                    if (!isAllowed(condition)) {
                        beginBlockIdx = idx;
                    }
                }
                break;
            }
            case '}': {
                blockNesting--;
                if (blockNesting < 0) {
                    printReport(nestingReport);
                    throw new Error(`Mismatched comment blocks: missing opening comment (i.e. '}' before '{')`);
                }

                nestingReport.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}<<< ${idx}: ${lines[idx]}`);

                if (blockNesting === 0) {
                    if (beginBlockIdx >= 0) { // If we are inside block
                        console.log(chalk.cyan(`---------} lines "${lines[idx]}"\n${beginBlockIdx}, ${idx}\n\n`));

                        commentLines(lines, beginBlockIdx, idx);
                        hasChanges = true;
                        beginBlockIdx = -1;
                    }
                }
                break;
            }
        }
    }

    lines.forEach(checkLine);

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

export function printReport(report: string[]) {
    report.forEach((line) => console.log(line));
}

export function defineConditions(allowedConditions: string[] | undefined) {
    allowedConditions?.forEach((condition) => definedNames.add(condition));
}
