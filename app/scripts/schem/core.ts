import { SchemFunction, SchemNumber, SchemSymbol, SchemType, SchemBoolean, SchemNil, SchemList, SchemString, SchemVector, SchemMap, SchemMapKey, SchemKeyword } from './types';
import { evalSchem } from './schem';
import { readStr } from './reader';
import { Env } from './env';
import { pr_str } from './printer';

export const coreFunctions: {[symbol: string]: SchemType} = {
  '+': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue: SchemNumber, currentIndex: number) => {
    if (currentIndex === 0) return currentValue.valueOf();
    else return accumulator + currentValue.valueOf();
  }, 0)),
  '-': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue: SchemNumber, currentIndex: number) => {
    if (args.length === 1) return -currentValue.valueOf();
    if (currentIndex === 0) return currentValue.valueOf();
    else return accumulator - currentValue.valueOf();
  }, 0)),
  '*': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue: SchemNumber, currentIndex: number) => {
    return accumulator * currentValue.valueOf();
  }, 1)),
  '/': (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue: SchemNumber, currentIndex: number) => {
    if (args.length === 1) return 1 / currentValue.valueOf();
    if (currentIndex === 0) return currentValue.valueOf();
    else return accumulator / currentValue.valueOf();
  }, 0)),
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
  'empty?': (arg: SchemType) => {
    return new SchemBoolean(arg instanceof SchemList && arg.length === 0);
  },
  // returns arguments as a list
  'list': (...args: SchemType[]) => {
    return new SchemList().concat(args);
  },
  'list?': (arg: SchemType) => {
    return new SchemBoolean(arg instanceof SchemList);
  },
  'vector': (...args: SchemType[]) => {
    return new SchemVector().concat(args);
  },
  'vector?': (arg: SchemType) => {
    return new SchemBoolean(arg instanceof SchemVector);
  },
  'count': (arg: SchemType) => {
    if (arg instanceof SchemList || arg instanceof SchemVector) {
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
  'get': (map: SchemMap, key: SchemMapKey) => {

    if (map instanceof SchemMap) {
      if (key.isValidKeyType) {
        return map.get(key);
      } else {
        throw `map lookup only works with valid key types`;
      }
    }
    return SchemNil.instance;
  },

};