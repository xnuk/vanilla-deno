import { Contract, walkObject } from '../private/index.ts';
import { diff } from 'https://esm.sh/v106/deep-object-diff@1.1.9';
import chalk from '../deps/chalk.ts';

const normaliseObject = (obj: Contract) => walkObject(obj, () => '');

export function validateContract(contract: any, tokens: any) {
  const theDiff = diff(normaliseObject(contract), normaliseObject(tokens));
  const valid = Object.keys(theDiff).length === 0;

  return {
    valid,
    diffString: valid ? '' : renderDiff(contract, theDiff),
  };
}

function diffLine(value: string, nesting: number, type?: '+' | '-') {
  const whitespace = [...Array(nesting).keys()].map(() => '  ').join('');
  const line = `${type ? type : ' '}${whitespace}${value}`;

  if ('production' !== 'test') {
    if (type === '-') {
      return chalk.red(line);
    }

    if (type === '+') {
      return chalk.green(line);
    }
  }

  return line;
}

function renderDiff(orig: any, diff: any, nesting: number = 0): string {
  const lines = [];

  if (nesting === 0) {
    lines.push(diffLine('{', 0));
  }

  const innerNesting = nesting + 1;

  const keys = Object.keys(diff).sort();

  for (const key of keys) {
    const value = diff[key];

    if (!(key in orig)) {
      lines.push(diffLine(`${key}: ...,`, innerNesting, '+'));
    } else if (typeof value === 'object') {
      lines.push(diffLine(`${key}: {`, innerNesting));

      lines.push(renderDiff(orig[key], diff[key], innerNesting));

      lines.push(diffLine('}', innerNesting));
    } else {
      lines.push(diffLine(`${key}: ...,`, innerNesting, '-'));
    }
  }

  if (nesting === 0) {
    lines.push(diffLine('}', 0));
  }
  return lines.join('\n');
}
