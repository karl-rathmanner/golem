import { SchemFunction, SchemNumber, SchemSymbol, SchemType, SchemBoolean, SchemNil, SchemList, SchemString, SchemVector, SchemMap, SchemMapKey, SchemKeyword } from './types';
import { Schem } from './schem';
import { readStr } from './reader';
import { Env } from './env';
import { pr_str } from './printer';
import * as $ from 'jquery';
import { browser } from 'webextension-polyfill-ts';

function throwErrorIfArityIsInalid(argsLength: number, min: number = 1, max: number = Infinity, even: boolean = false) {
  if (argsLength < min) {
    throw `Unexpected number of argunents (${argsLength}), minimum number of arguments is ${min}.`;
  } else if (argsLength > max) {
    throw `Unexpected number of argunents (${argsLength}), maximum number of arguments is ${max}.`;
  } else if (even && argsLength % 2 > 0) {
    throw `Unexpected number of argunents (${argsLength}), should be even.`;
  }
}

function hasSameConstructorAndValue(a: SchemType, b: SchemType): boolean {
  return (a.constructor === b.constructor && a.valueOf() === b.valueOf());
}

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
  '=': (...args: SchemType[]) => {
    throwErrorIfArityIsInalid(args.length, 1);
    // If passed a single value (= x) the result is always true.
    if (args.length === 1) return SchemBoolean.true;

    // Compare every consecutive pair of arguments
    for (let i = 0; i < args.length - 1; i++) {
      let a = args[i], b = args[i + 1];

      // Collections are considered to be equal if their contents are the same - regardless of their type.
      if ((a instanceof SchemList || a instanceof SchemVector) &&
          (b instanceof SchemList || b instanceof SchemVector) &&
          (a.length === b.length)) {

        // Compare contents
        for (let j = 0; j < a.length; j++) {
          if (! hasSameConstructorAndValue(a[j], b[j])) {
            return SchemBoolean.false;
          }
        }

      } else { // a & b are non-collection types
        if (!hasSameConstructorAndValue(a, b)) return SchemBoolean.false;
      }
    }
    return SchemBoolean.true; // none of the checks above resulted in inequality, so all arguments must be equal
  },
  '>': (...args: SchemNumber[]) => {
    args.map((e) => {
      if (!(e instanceof SchemNumber)) throw `trying to do numeric comparison on non numeric types`;
    });
    return SchemBoolean.fromBoolean(args[0].valueOf() > args[1].valueOf());
  },
  '<': (...args: SchemNumber[]) => {
    return SchemBoolean.fromBoolean(args[0] < args[1]);
  },
  'empty?': (arg: SchemType) => {
    return SchemBoolean.fromBoolean(arg instanceof SchemList && arg.length === 0);
  },
  // returns arguments as a list
  'list': (...args: SchemType[]) => {
    return new SchemList().concat(args);
  },
  'list?': (arg: SchemType) => {
    return SchemBoolean.fromBoolean(arg instanceof SchemList);
  },
  'vector': (...args: SchemType[]) => {
    return new SchemVector().concat(args);
  },
  'vector?': (arg: SchemType) => {
    return SchemBoolean.fromBoolean(arg instanceof SchemVector);
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
  'read-string': (str: SchemString) => {
    return readStr(str.valueOf());
  },
  'slurp': async (url: SchemString) => {
    // get full URL for files packaged with the browser extension, when url begins with a slash
    const actualUrl = (url[0] === '/') ? browser.extension.getURL('/schemScripts' + url.valueOf()) : url.valueOf();
    const response = await $.get(actualUrl);
    console.log(response);
    return new SchemString(response);
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
  'parse-xml': (xmlString: SchemString) => {
    return SchemNil.instance;
  }
};