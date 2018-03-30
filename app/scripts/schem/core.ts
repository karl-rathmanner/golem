import { SchemFunction, SchemNumber, SchemSymbol, SchemType, SchemBoolean, SchemNil, SchemList, SchemString } from './types';
import { evalSchem } from './schem';
import { readStr } from './reader';
import { Env } from './env';
import { pr_str } from './printer';

export const coreFunctions: {[symbol: string]: SchemType} = {
  '+': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator + currentValue.valueOf())),
  '-': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator - currentValue.valueOf())),
  '/': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator / currentValue.valueOf())),
  '*': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue) => accumulator * currentValue.valueOf())),
  'sqr': (d: SchemNumber) => new SchemNumber(d.valueOf() * d.valueOf()),
  // TODO: implement proper equality checks for all types
  '=': (...args: SchemType[]) => {
    if (args[0].constructor === args[1].constructor &&
        args[0].valueOf() === args[1].valueOf()) {
      return new SchemBoolean(true);
    } else {
      return new SchemBoolean(false);
    }
  },
  '>': (...args: SchemNumber[]) => {
    args.map((e) => {
      if (!(e instanceof SchemNumber)) throw `trying to do numeric comparison on non numeric types`;
    });
    return new SchemBoolean(args[0].valueOf() > args[1].valueOf());
  },
  '<': (...args: SchemNumber[]) => {
    return new SchemBoolean(args[0] < args[1]);
  },
  // returns arguments as a list
  'list': (...args: SchemType[]) => {
    return new SchemList().concat(args);
  },
  'list?': (arg: SchemType) => {
    return new SchemBoolean(arg instanceof SchemList);
  },
  'empty?': (arg: SchemType) => {
    return new SchemBoolean(arg instanceof SchemList && arg.length === 0);
  },
  'count': (arg: SchemType) => {
    if (arg instanceof SchemList) {
      return new SchemNumber(arg.length);
    } else {
      return new SchemNumber(0);
    }
  },
  /** calls pr_str (escaped) on each argument, joins the results, seperated by ' ' */
  'pr-str': (...args: SchemType[]) => {
    return new SchemString(
      args.map((element) => {
        return pr_str(element, true);
      }).join(' ')
    );
  },
  /** calls pr_str (unescaped) on each argument, concatenates the results */
  'str': (...args: SchemType[]) => {
    return new SchemString(
      args.map((element) => {
        return pr_str(element, false);
      }).join('')
    );
  },
  'prn': (...args: SchemType[]) => {
    console.log(args.map((element) => {
      return pr_str(element, true);
    }).join(' '));
    return SchemNil.instance;
  },
  'println': (...args: SchemType[]) => {
    console.log(args.map((element) => {
      return pr_str(element, false);
    }).join(' '));
    return SchemNil.instance;
  },

};