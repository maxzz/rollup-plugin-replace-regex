import { ConditionStates } from '../../types';
import { splitToLines, commentLines } from './line-utils';

let isReleaseBuild: boolean = false; // i.e. this is release build and all conditional blocks should be commented

const definedNames: Set<string> = new Set();

// m1 - definition names (separated by commas); m2 - operation: '{}', '//', '{', '}', '<>'
const reComment = /\/\*\s*(?:\[\s*(\w+\s*(?:,\s*?\w+)*)\s*\])??\s*({|}|{}|<>)\s*\*\//;

//const filler = { '{}': '//', '{': '/*', '}': '*/', '<>': '' };

function keepUncommented(conditionName: string): boolean {
    if (isReleaseBuild) {
        return false;
    }

    if (!conditionName) {
        //console.log(`keepUncommented"${conditionName}" = true`);
        return true;
    }
    let rv = conditionName.split(',').map((s) => s.trim()).every((s) => definedNames.has(s));

    //console.log(chalk.red(`keepUncommented "${conditionName}" = '${rv}'`));

    return rv;
}

function needToComment(line: string) {
    let lineConditions = getAllLineConditions(reComment.source, line);

    //console.log(chalk.yellow(`--> all="${lineConditions}"`), lineConditions);

    let keepUncommentedAll = lineConditions.every((condition) => keepUncommented(condition));
    return !keepUncommentedAll;

    function getAllLineConditions(regexToMatch: string, line: string): string[] {
        // "/*[traceDc]{}*/ /*[csRawMutations]{}*/ this.muTrace?.traceMutations?.(muts);" --> ["traceDc", "csRawMutations"]
        const localRegex = new RegExp(regexToMatch, 'g'); // make regex global
        const rv = [];
        let match: string[] | null;
        while ((match = localRegex.exec(line))) {
            rv.push(match[1]);
        }
        return rv;
    }
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
        //console.log(chalk.green.dim(`\n------------${mtchedStr}----------`));

        switch (doWhat) {
            case '<>': {
                definedNames.add(condition);
                break;
            }
            case '{}': {
                if (needToComment(line)) {
                    const newLine = lines[idx].replace(/^(\s*)(.*)/, (s, p1, p2) => `${p1}// ${p2}`);
                    //console.log(`---------{} line \n"${lines[idx]}"\n"${newLine}"\n\n`);

                    lines[idx] = newLine; // block is not allowed. replace with whitespace, '//', and the rest.
                    hasChanges = true;
                }
                break;
            }
            case '{': {
                nestingReport.push(`    : ${' '.repeat(Math.min(100, blockNesting) * 4)}>>> ${idx}: ${lines[idx]}`);

                blockNesting++;

                if (beginBlockIdx < 0) { // If we are not inside block
                    if (!keepUncommented(condition)) {
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
                        //console.log(chalk.cyan(`---------} lines "${lines[idx]}"\n${beginBlockIdx}, ${idx}\n\n`));

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

export function defineConditions(allowedConditions: ConditionStates | undefined) {
    if (!allowedConditions) {
        return;
    }

    if (Array.isArray(allowedConditions)) {
        allowedConditions
            .forEach((condition) => {
                definedNames.add(condition);
            });
    } else {
        Object.entries(allowedConditions)
            .forEach(([condition, state]) => {
                if (!!state && state !== '0') {
                    definedNames.add(condition);
                }
            });
    }
}

export function defineReleaseBuild(isRelease: boolean | undefined = false) {
    isReleaseBuild = isRelease;
}
