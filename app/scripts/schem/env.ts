import { SchemFunction, SchemNumber } from './types';

export interface SchemEnvironment {
  [key: string]: SchemFunction;
}

export const replEnv: SchemEnvironment = {
  '+': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator + currentValue.valueOf())),
  '-': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator - currentValue.valueOf())),
  '*': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator * currentValue.valueOf())),
  '/': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator / currentValue.valueOf())),
};