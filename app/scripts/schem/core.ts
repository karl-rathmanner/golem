import { SchemFunction, SchemNumber, SchemSymbol, SchemType, SchemBoolean, SchemNil, SchemList, SchemString, SchemVector, SchemMap, SchemMapKey, SchemKeyword, SchemAtom, isSequential, isSchemType, SchemRegExp, LazyVector } from './types';
import { Schem } from './schem';
import { readStr } from './reader';
import { Env } from './env';
import { pr_str, prettyPrint } from './printer';
import * as $ from 'jquery';
import { browser } from 'webextension-polyfill-ts';

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
  'rem': (dividend: SchemNumber, divisor: SchemNumber) => {
    return new SchemNumber(dividend.valueOf() % divisor.valueOf());
  },
  'quot': (dividend: SchemNumber, divisor: SchemNumber) => {
    const quotient = dividend.valueOf() / divisor.valueOf();
    // round towards zero
    return new SchemNumber((quotient > 0) ? Math.floor(quotient) : Math.ceil(quotient));
  },
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
    return doNumericComparisonForEachConsecutivePairInArray((a, b) => { return a > b; }, args);
  },
  '<': (...args: SchemNumber[]) => {
    return doNumericComparisonForEachConsecutivePairInArray((a, b) => { return a < b; }, args);
  },
  '>=': (...args: SchemNumber[]) => {
    return doNumericComparisonForEachConsecutivePairInArray((a, b) => { return a >= b; }, args);
  },
  '<=': (...args: SchemNumber[]) => {
    return doNumericComparisonForEachConsecutivePairInArray((a, b) => { return a <= b; }, args);
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
    if ('count' in arg) {
      return new SchemNumber(arg.count);
    } else if (arg instanceof SchemString) {
      return new SchemNumber(arg.length);
    } else if (arg === SchemNil.instance) {
      return new SchemNumber(0);
    } else {
      throw `tried to count soemthing other than a collection, string or nil`;
    }
  },
  'first': (sequential: SchemList | SchemVector) => {
    throwErrorForNonSequentialArguments(sequential);
    if (sequential.length === 0) return SchemNil.instance;
    return sequential[0];
  },
  'rest': (sequential: SchemList | SchemVector) => {
    throwErrorForNonSequentialArguments(sequential);
    if (sequential.length === 0) return SchemNil.instance;
    return new SchemList(...sequential.slice(1));
  },
  'last': (sequential: SchemList | SchemVector) => {
    throwErrorForNonSequentialArguments(sequential);
    if (sequential.length === 0) return SchemNil.instance;
    return sequential[sequential.length - 1];
  },
  'butlast': (sequential: SchemList | SchemVector) => {
    throwErrorForNonSequentialArguments(sequential);
    if (sequential.length === 0) return SchemNil.instance;
    return new SchemList(...sequential.slice(0, sequential.length - 1));
  },
  'nth': (sequential: SchemList | SchemVector, index: SchemNumber) => {
    throwErrorForNonSequentialArguments(sequential);
    const i = index.valueOf();
    if (i < 0) throw `index value must be positive`;
    if (!(sequential instanceof LazyVector) && i >= sequential.length) {
      throw `index out of bounds: ${i} >= ${sequential.length}`;
    }
    return sequential.nth(index.valueOf());
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
  'str': async (...args: SchemType[]) => {
    return new SchemString(
      (await asyncStringifyAll(args, false)).join('')
    );
  },
  'prn': async (...args: SchemType[]) => {
    const stringified = await asyncStringifyAll(args);
    console.log(stringified.join(' '));
    return SchemNil.instance;
  },
  'println': async (...args: SchemType[]) => {
    console.log(await asyncStringifyAll(args, false));
    return SchemNil.instance;
  },
  'read-string': (str: SchemString) => {
    return readStr(str.valueOf());
  },
  'slurp': async (url: SchemString, opts?: SchemMap) => {
    // get full URL for files packaged with the browser extension, when url begins with a slash
    const actualUrl = (url[0] === '/') ? browser.extension.getURL('/schemScripts' + url.valueOf()) : url.valueOf();

    let ajaxSettings: JQueryAjaxSettings = {
      type: 'GET',
      url: actualUrl,
      success: (response) => {
        return response;
      }
    };

    let format: any = opts ? opts.getValueForKeyword('data-type') : null;
    if (format instanceof SchemString) {
      ajaxSettings.dataType = format.valueOf();
    }

    const response = await $.ajax(ajaxSettings);
    if (response instanceof XMLDocument) {
      return createSchemMapFromXMLDocument(response);
    } else {
      return new SchemString(response);
    }
  },
  'get': (map: SchemMap, key: SchemMapKey, defaultValue?: SchemType) => {
    if (map instanceof SchemMap) {
      if (key.isValidKeyType) {
        return (map.has(key)) ? map.get(key) : defaultValue ? defaultValue : SchemNil.instance;
      } else {
        throw `map lookup only works with valid key types`;
      }
    }
    return SchemNil.instance;
  },
  'parse-xml': (xmlString: SchemString) => {
    return SchemNil.instance;
  },
  'atom': (value: SchemType) => {
    return new SchemAtom(value);
  },
  'atom?': (value: SchemType) => {
    return value.constructor === SchemAtom;
  },
  'deref': (atom: SchemAtom) => {
    return atom.value;
  },
  'reset!': (atom: SchemAtom, value: SchemType) => {
    return atom.value = value;
  },
  'cons': (item: SchemType, list: SchemList) => {
    return new SchemList(item, ...list);
  },
  'concat': (...lists: SchemList[]) => {
    const emptyList: SchemList[] = [];
    return new SchemList(...emptyList.concat(...lists));
  },
  'map': async (fn: SchemFunction, ...sequentials: (SchemList | SchemVector)[]) => {
    throwErrorForNonSequentialArguments(...sequentials);

    if (sequentials.length === 1) {
      const newValues = await Promise.all(sequentials[0].map((value) => {
        return fn.f(value);
      }));
      return new SchemList(...newValues);
    } else {
      const shortestLength = sequentials.reduce((shortestLength: number, currentValue) => {
        return (currentValue.length < shortestLength) ? currentValue.length : shortestLength;
      }, sequentials[0].length);

      let newValues: SchemType[] = [];
      for (let i = 0; i < shortestLength; i++) {
        let args: SchemType[] = [];
        for (let j = 0; j < sequentials.length; j++) {
          args.push(sequentials[j][i]);
        }
        newValues.push(await fn.f(...args));
      }
      return new SchemList(...newValues);
    }
  },
  'score-string-similarity': (needle: SchemString, haystack: SchemString) => {
    return new SchemNumber(computeSimpleStringSimilarityScore(needle.stringValueOf(), haystack.stringValueOf()));
  },
  'sort-and-filter-by-string-similarity' : (needle: SchemString, haystack: SchemList | SchemVector, scoreThreshold: SchemNumber = new SchemNumber(1)) => {

    const rankedHaystack: Array<[number, SchemString | SchemSymbol | SchemKeyword ]> = haystack.map((hay) => {
      // create an aray of tuples [score, haystackElement]
      if (hay instanceof SchemString) {
        return <[number, SchemString]> [computeSimpleStringSimilarityScore(needle.valueOf(), hay.valueOf()), hay];
      } else if (hay instanceof SchemSymbol || hay instanceof SchemKeyword) {
        return <[number, SchemSymbol | SchemKeyword]> [computeSimpleStringSimilarityScore(needle.valueOf(), hay.name), hay];
      } else {
        throw `${needle} and ${hay} can't be compared`;
      }
    }).filter((element, i) => {
      // remove all elements below the with a score threshold
      return (element[0] >= scoreThreshold.valueOf());
    }).sort((a, b) => {
      // sort the remaining entries by score, then alphabetically
      if (a[0] === b[0]) {
        return a[1].stringValueOf().localeCompare(b[1].stringValueOf());
      } else {
        return b[0] - a[0];
      }
    });

    // remove score
    const schemTypes = rankedHaystack.map((element) => {
      return element[1];
    });

    return new SchemList(...schemTypes);
  },
  'pretty-print': async (m: SchemMap, indent: SchemNumber = new SchemNumber(2)) => {
    return new SchemString(await prettyPrint(m, true, {indentSize: indent.valueOf()}));
  },
  'prompt': (message: SchemString = new SchemString(''), defaultValue: SchemString = new SchemString('')) => {
    let input = window.prompt(message.stringValueOf(), defaultValue.stringValueOf());
    return new SchemString(input);

  },
  'apply': async (fn: SchemFunction, argList: SchemList | SchemVector) => {
    throwErrorForNonSequentialArguments(argList);
    return await fn.invoke(...argList);
  },
  're-pattern': async (pattern: SchemString) => {
    const matches = /(?:\(\?(.*)?\))?(.+)/.exec(pattern.stringValueOf());
    if (matches === null) {
      throw `invalid regular expression: ${pattern.stringValueOf()}`;
    }
    const [, flags, rest] = matches;
    if (typeof flags !== 'undefined') {
      return new SchemRegExp(rest, flags);
    }
    return new SchemRegExp(rest);
  },
  're-find': async (rex: SchemRegExp, str: SchemString) => {
    const matches = rex.exec(str.stringValueOf());
    if (matches !== null) {
      return new SchemVector(...matches.map(m => new SchemString(m)));
    } else {
      return SchemNil.instance;
    }
  },
  'lazy-vector': (producer: SchemFunction, count?: SchemNumber) => {
    return new LazyVector(producer, (count) ? count.valueOf() : Infinity);
  },
  'subvec': async (source: SchemVector | LazyVector, start?: SchemNumber, end?: SchemNumber) => {
    if (source instanceof SchemVector) {
      return source.slice(
        (start) ? start.valueOf() : 0,
        (end) ? end.valueOf() : undefined
      );
    } else {
      if (typeof end === 'undefined' && source.count === Infinity) {
        throw `You must provide an end index for lazy vectors of infinite size.`;
      }
      return source.realizeSubvec(
        (start) ? start.valueOf() : 0,
        (end) ? end.valueOf() : undefined);
    }
  },
  'console-log': (value: any) => {
    console.log(value);
    return SchemNil.instance;
  }
};


/// supporting functions

function doNumericComparisonForEachConsecutivePairInArray(predicate: (a: number, b: number) => boolean,  args: SchemNumber[]) {
  for (let i = 0; i < args.length - 1; i++) {
    if (!(args[i] instanceof SchemNumber) || !(args[i + 1] instanceof SchemNumber)) {
      throw `trying to do numeric comparison on non numeric types (or less than two arguments)`;
    }
    if (!predicate(args[i].valueOf(), args[i + 1].valueOf())) {
      // return on the first failed test
      return SchemBoolean.false;
    }
  }
  return SchemBoolean.true;
}

function throwErrorIfArityIsInalid(argsLength: number, min: number = 1, max: number = Infinity, even: boolean = false) {
  if (argsLength < min) {
    throw `Unexpected number of argunents (${argsLength}), minimum number of arguments is ${min}.`;
  } else if (argsLength > max) {
    throw `Unexpected number of argunents (${argsLength}), maximum number of arguments is ${max}.`;
  } else if (even && argsLength % 2 > 0) {
    throw `Unexpected number of argunents (${argsLength}), should be even.`;
  }
}

function throwErrorForNonSequentialArguments(...args: SchemType[]) {
  args.forEach(arg => {
    if (!(isSequential(arg) || ('nth' in arg))) {
      throw `Expected argument to be sequential. Got this instead: ${arg}`;
    }
  });
}

function hasSameConstructorAndValue(a: SchemType, b: SchemType): boolean {
  return (a.constructor === b.constructor && a.valueOf() === b.valueOf());
}

async function asyncStringifyAll(schemObjects: SchemType[], escapeStrings: boolean = true): Promise<string[]> {
  return Promise.all(schemObjects.map((element) => {
    return pr_str(element, escapeStrings);
  }));
}

function createSchemMapFromXMLDocument(xmlDoc: XMLDocument): SchemMap {

  const traverseDocument = (node: Element) => {
    const map = new SchemMap();
    map.set(SchemKeyword.from('tag'), SchemKeyword.from(node.tagName));

    if (node.attributes.length > 0) {
      let attrs = new SchemMap();
      for (let i = 0; i < node.attributes.length; i++) {
        attrs.set(SchemKeyword.from(node.attributes.item(i)!.name), new SchemString(node.attributes.item(i)!.value));
      }
      map.set(SchemKeyword.from('attrs'), attrs);
    }

    if (node.childElementCount === 0) {
      if (node.textContent && node.textContent.length > 0) {
        map.set(SchemKeyword.from('content'), new SchemString(node.textContent));
      }
    } else {
      if (node.childElementCount === 1) {
        map.set(SchemKeyword.from('content'), traverseDocument(node.children.item(0)));
      } else {
        let content = new SchemVector();
        for (let i = 0; i < node.childElementCount; i++) {
          content.push(traverseDocument(node.children.item(i)));
        }
        map.set(SchemKeyword.from('content'), content);
      }
    }

    return map;
  };


  return traverseDocument(xmlDoc.documentElement);
}


function computeSimpleStringSimilarityScore(needle: string, haystack: string): number {
  // no need to start matching if the needle is bigger than the haystack
  if (needle.length > haystack.length) return 0;

  let startPos = 0, score = 0, consecutiveCharacterBonus = 0;
  needle = needle.toLowerCase();
  haystack = haystack.toLowerCase();

  outer:
  // for every character in needle
  for (let si = 0; si < needle.length; si++) {
    // for every remaining character in haystack
    for (let li = startPos; li < haystack.length; li++) {
      if (needle[si] === haystack[li]) {
        if ((needle.length - si) > (haystack.length - li)) {
          // there aren't enough characters left in haystack for the remainder of needle to fit
          return 0;
        }
        score += 1 + consecutiveCharacterBonus;
        if (li === 0) {
          // bonus points for matching the first letter in a haystack word
          score += 2;
        }
        startPos = li + 1;
        consecutiveCharacterBonus++;
        continue outer;
      } else {
        consecutiveCharacterBonus = 0;
        if (li === haystack.length - 1) {
          // arrived at the end, found no match for current character
          return 0;
        }
      }
    }
  }
  return score;
}