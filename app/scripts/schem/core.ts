import { browser } from 'webextension-polyfill-ts';
import { setJsProperty, getJsProperty, resolveJSPropertyChain } from '../javascriptInterop';
import { VirtualFileSystem } from '../virtualFilesystem';
import { prettyPrint, pr_str } from './printer';
import { readStr } from './reader';
import { jsObjectToSchemType, schemToJs } from './schem';
import { isSchemKeyword, isSchemString, isSchemSymbol, isSequential, isValidKeyType, isSchemLazyVector, isSchemMap, isSchemNumber, isSchemList, isSchemVector, isSchemFunction, isSchemJSReference } from './typeGuards';
import { SchemAtom, SchemBoolean, SchemFunction, SchemKeyword, SchemLazyVector, SchemList, SchemMap, SchemMapKey, SchemNil, SchemNumber, SchemRegExp, SchemString, SchemSymbol, AnySchemType, SchemVector, RegularSchemCollection, SchemJSReference } from './types';

export const coreFunctions: {[symbol: string]: any} = {
  'identity': (x: AnySchemType) => x,
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
  '=': (...args: AnySchemType[]) => {
    throwErrorIfArityIsInvalid(args.length, 1);
    // If passed a single value (= x) the result is always true.
    if (args.length === 1) return SchemBoolean.true;

    // Compare every consecutive pair of arguments
    for (let i = 0; i < args.length - 1; i++) {
      let a = args[i], b = args[i + 1];

      // Collections are considered to be equal if their contents are the same - regardless of their type.
      if ((isSchemList(a) || isSchemVector(a)) &&
          (isSchemList(b) || isSchemVector(b)) &&
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
  'empty?': (arg: AnySchemType) => {
    return SchemBoolean.fromBoolean('length' in arg && arg.length === 0);
  },
  // returns arguments as a list
  'list': (...args: AnySchemType[]) => {
    return new SchemList().concat(args);
  },
  'list?': (arg: AnySchemType): SchemBoolean => {
    return SchemBoolean.fromBoolean(arg instanceof SchemList);
  },
  'vector': (...args: AnySchemType[]) => {
    return new SchemVector().concat(args);
  },
  'vec': (coll: RegularSchemCollection) => {
    if (isSchemList(coll)) {
      return new SchemVector(...coll);
    } else if (isSchemMap(coll)) {
      return new SchemVector(...coll.flatten());
    } else if (isSchemVector(coll)) {
      return coll;
    } else {
      return new SchemVector();
    }
  },
  'vector?': (arg: AnySchemType) => {
    return SchemBoolean.fromBoolean(arg instanceof SchemVector);
  },
  'count': (arg: AnySchemType) => {
    if ('count' in arg) {
      return new SchemNumber(arg.count());
    } else if ( isSchemString(arg)) {
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
    if (!( isSchemLazyVector(sequential)) && i >= sequential.length) {
      throw `index out of bounds: ${i} >= ${sequential.length}`;
    }
    return sequential.nth(index.valueOf());
  },
  /** calls pr_str (escaped) on each argument, joins the results, seperated by ' ' */
  'pr-str': async (...args: AnySchemType[]) => {
    return new SchemString(
      (await asyncStringifyAll(args, true)).join(' ')
    );
  },
  /** calls pr_str (unescaped) on each argument, concatenates the results */
  'str': async (...args: AnySchemType[]) => {
    return new SchemString(
      (await asyncStringifyAll(args, false)).join('')
    );
  },
  'prn': async (...args: AnySchemType[]) => {
    const stringified = await asyncStringifyAll(args);
    console.log(stringified.join(' '));
    return SchemNil.instance;
  },
  'println': async (...args: AnySchemType[]) => {
    console.log(await asyncStringifyAll(args, false));
    return SchemNil.instance;
  },
  'read-string': (str: SchemString) => {
    return readStr(str.valueOf());
  },
  'xhr-get': async (url: SchemString) => {
    return xhrPromise('GET', url.valueOf());
  },
  'xhr-post': async (url: SchemString, body: AnySchemType) => {
    return xhrPromise('POST', url.valueOf(), schemToJs(body));
  },
  'xhr-put': async (url: SchemString, body: AnySchemType) => {
    return xhrPromise('PUT', url.valueOf(), schemToJs(body));
  },
  'xhr-delete': async (url: SchemString) => {
    return xhrPromise('DELETE', url.valueOf());
  },

  'slurp': async (url: SchemString, opts?: SchemMap) => {
    // get full URL for files packaged with the browser extension, when url begins with a slash
    const actualUrl = (url[0] === '/') ? browser.extension.getURL('/schemScripts' + url.valueOf()) : url.valueOf();
    return new SchemString(await xhrPromise('GET', actualUrl));
  },
  'xml->map': (xml: XMLDocument | string | SchemString, options?: SchemMap) => {
    let xmlDoc: XMLDocument;
    if (typeof xml === 'string') {
      xmlDoc = new DOMParser().parseFromString(xml, 'text/xml');
    } else if (isSchemString(xml)) {
      xmlDoc = new DOMParser().parseFromString(xml.valueOf(), 'text/xml');
    } else {
      xmlDoc = xml;
    }
    return createSchemMapFromXMLDocument(xmlDoc, schemToJs(options));
  },
  'get': (map: SchemMap, key: SchemMapKey, defaultValue?: AnySchemType) => {
    if ( isSchemMap(map)) {
      if (isValidKeyType(key)) {
        return (map.has(key)) ? map.get(key) : defaultValue ? defaultValue : SchemNil.instance;
      } else {
        throw `map lookup only works with valid key types`;
      }
    }
    return SchemNil.instance;
  },
  'atom': (value: AnySchemType) => {
    return new SchemAtom(value);
  },
  'atom?': (value: AnySchemType) => {
    return value.constructor === SchemAtom;
  },
  'deref': (atom: SchemAtom) => {
    return atom.value;
  },
  'reset!': (atom: SchemAtom, value: AnySchemType) => {
    return atom.value = value;
  },
  'cons': (item: AnySchemType, list: SchemList) => {
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

      let newValues: AnySchemType[] = [];
      for (let i = 0; i < shortestLength; i++) {
        let args: AnySchemType[] = [];
        for (let j = 0; j < sequentials.length; j++) {
          args.push(sequentials[j][i]);
        }
        newValues.push(await fn.f(...args));
      }
      return new SchemList(...newValues);
    }
  },
  'score-string-similarity': (needle: SchemString, haystack: SchemString) => {
    return new SchemNumber(computeSimpleStringSimilarityScore(needle.toString(), haystack.toString()));
  },
  'sort-and-filter-by-string-similarity' : (needle: SchemString, haystack: SchemList | SchemVector, scoreThreshold: SchemNumber = new SchemNumber(1)) => {

    const rankedHaystack: Array<[number, SchemString | SchemSymbol | SchemKeyword ]> = haystack.map((hay) => {
      // create an aray of tuples [score, haystackElement]
      if ( isSchemString(hay)) {
        return <[number, SchemString]> [computeSimpleStringSimilarityScore(needle.valueOf(), hay.valueOf()), hay];
      } else if (isSchemSymbol(hay) || isSchemKeyword(hay)) {
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
        return a[1].getStringRepresentation().localeCompare(b[1].getStringRepresentation());
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
    let input = window.prompt(message.toString(), defaultValue.getStringRepresentation());
    return new SchemString(input);

  },
  'apply': async (fn: SchemFunction | Function, argList: SchemList | SchemVector) => {
    throwErrorForNonSequentialArguments(argList);
    if (isSchemFunction(fn)) {
      return await fn.invoke(...argList);
    } else if (isSchemJSReference(fn) && fn.typeof() === 'function') {
      fn.invoke(...argList);
    }
  },
  're-pattern': async (pattern: SchemString) => {
    const matches = /(?:\(\?(.*)?\))?(.+)/.exec(pattern.getStringRepresentation());
    if (matches === null) {
      throw `invalid regular expression: ${pattern.getStringRepresentation()}`;
    }
    const [, flags, rest] = matches;
    if (typeof flags !== 'undefined') {
      return new SchemRegExp(rest, flags);
    }
    return new SchemRegExp(rest);
  },
  're-find': async (rex: SchemRegExp, str: SchemString) => {
    const matches = rex.exec(str.getStringRepresentation());
    if (matches !== null) {
      return new SchemVector(...matches.map(m => new SchemString(m)));
    } else {
      return SchemNil.instance;
    }
  },
  'lazy-vector': (producer: SchemFunction, count?: SchemNumber) => {
    return new SchemLazyVector(producer, (count) ? count.valueOf() : Infinity);
  },
  'subvec': async (source: SchemVector | SchemLazyVector, start?: SchemNumber, end?: SchemNumber) => {
    if (source instanceof SchemVector) {
      return source.slice(
        (start) ? start.valueOf() : 0,
        (end) ? end.valueOf() : undefined
      );
    } else {
      if (typeof end === 'undefined' && source.count() === Infinity) {
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
  },
  'set!': (sym: SchemSymbol | SchemJSReference, value: AnySchemType) => {
    if (isSchemSymbol(sym)) {
      if (!SchemSymbol.refersToJavascriptObject(sym)) {
        throw new Error(`You're not allowed to set Schem bindings to new values. Use atoms for mutable state.`);
      }
      setJsProperty(sym.name, schemToJs(value));
    } else if (isSchemJSReference(sym)) {
      sym.set(schemToJs(value));
    }
  },
  'js->schem': async (value: AnySchemType, options?: SchemMap) => {
    return jsObjectToSchemType(value, schemToJs(options, {keySerialization: 'toPropertyIdentifier'}));
  },
  'schem->js': (value: AnySchemType, options?: SchemMap) => {
    return schemToJs(value, schemToJs(options, {keySerialization: 'toPropertyIdentifier'}));
  },
  'js-ref': (parent: any = window, propertyName: SchemString): SchemJSReference => {
    return new SchemJSReference(parent, propertyName.valueOf());
  },
  'js-deref': (jsref: SchemJSReference) => {
    return jsref.get();
  },
  'storage-create': async (qualifiedObjectName: SchemString, value: AnySchemType) => {
    return await VirtualFileSystem.createObject(qualifiedObjectName.valueOf(), schemToJs(value));
  },
  'storage-create-or-update': async (qualifiedObjectName: SchemString, value: AnySchemType) => {
    return await VirtualFileSystem.createObject(qualifiedObjectName.valueOf(), schemToJs(value), true);
  },
  'storage-read': async (qualifiedObjectName: SchemString) => {
    return await VirtualFileSystem.readObject(qualifiedObjectName.valueOf());
  },
  'storage-update': async (qualifiedObjectName: SchemString, value: AnySchemType) => {
    await VirtualFileSystem.updateObject(qualifiedObjectName.valueOf(), schemToJs(value));
    return value;
  },
  'storage-delete': async (qualifiedObjectName: SchemString) => {
    await VirtualFileSystem.removeObject(qualifiedObjectName.valueOf());
    return SchemNil.instance;
  },
  'storage-clear-all': async() => {
    if (window.confirm('Do you really want to clear the local storage? This would deletes all objects.')) {
      VirtualFileSystem.clearStorage();
      return new SchemString('Local storage was cleared.');
    }
    return new SchemString('Clearing the storage was canceled.');
  },
  'storage-get-vfstree': async() => {
    const vfst = await VirtualFileSystem.getVFSTree();
    return jsObjectToSchemType(vfst, {depth: 900});
  },
  'resolve-js-property-chain': (jsObject: any, ...propertyNames: Array<SchemString | SchemKeyword>) => {
    const pNames: string[] = propertyNames.map(e => isSchemKeyword(e) ? e.name : e.valueOf());
    return resolveJSPropertyChain(jsObject, ...pNames);
  }
};


/// supporting functions

function doNumericComparisonForEachConsecutivePairInArray(predicate: (a: number, b: number) => boolean,  args: SchemNumber[]) {
  for (let i = 0; i < args.length - 1; i++) {
    if (!( isSchemNumber(args[i])) || !(args[i + 1] instanceof SchemNumber)) {
      throw `trying to do numeric comparison on non numeric types (or less than two arguments)`;
    }
    if (!predicate(args[i].valueOf(), args[i + 1].valueOf())) {
      // return on the first failed test
      return SchemBoolean.false;
    }
  }
  return SchemBoolean.true;
}

function throwErrorIfArityIsInvalid(argsLength: number, min: number = 1, max: number = Infinity, even: boolean = false) {
  if (argsLength < min) {
    throw `Unexpected number of argunents (${argsLength}), minimum number of arguments is ${min}.`;
  } else if (argsLength > max) {
    throw `Unexpected number of argunents (${argsLength}), maximum number of arguments is ${max}.`;
  } else if (even && argsLength % 2 > 0) {
    throw `Unexpected number of argunents (${argsLength}), should be even.`;
  }
}

function throwErrorForNonSequentialArguments(...args: AnySchemType[]) {
  args.forEach(arg => {
    if (!(isSequential(arg) || ('nth' in arg))) {
      throw `Expected argument to be sequential. Got this instead: ${arg}`;
    }
  });
}

function hasSameConstructorAndValue(a: AnySchemType, b: AnySchemType): boolean {
  return (a.constructor === b.constructor && a.valueOf() === b.valueOf());
}

async function asyncStringifyAll(schemObjects: AnySchemType[], escapeStrings: boolean = true): Promise<string[]> {
  return Promise.all(schemObjects.map((element) => {
    return pr_str(element, escapeStrings);
  }));
}

function createSchemMapFromXMLDocument(xmlDoc: XMLDocument, options: {keyType?: 'string' | 'keyword'} = {keyType: 'string'}): SchemMap {
  function createKey(v: string) {
    if (options.keyType === 'keyword') {
      return SchemKeyword.from(v);
    } else {
      return new SchemString(v);
    }
  }

  const recursivelyTraverseDocument = (node: Element) => {
    const map = new SchemMap();
    map.set(createKey('tag'), new SchemString(node.tagName));

    if (node.attributes.length > 0) {
      let attrs = new SchemMap();
      for (let i = 0; i < node.attributes.length; i++) {
        attrs.set(createKey(node.attributes.item(i)!.name), new SchemString(node.attributes.item(i)!.value));
      }
      map.set(createKey('attrs'), attrs);
    }

    if (node.childElementCount === 0) {
      if (node.textContent && node.textContent.length > 0) {
        map.set(createKey('content'), new SchemString(node.textContent));
      }
    } else {
      if (node.childElementCount === 1) {
        const onlyChild = node.children.item(0);
        if (onlyChild != null) {
          map.set(createKey('content'), recursivelyTraverseDocument(onlyChild));
        }
      } else {
        let content = new SchemVector();
        for (let i = 0; i < node.childElementCount; i++) {
          let oneSiblingOfMany = node.children.item(i);
          if (oneSiblingOfMany != null) {
            content.push(recursivelyTraverseDocument(oneSiblingOfMany));
          }
        }
        map.set(createKey('content'), content);
      }
    }

    return map;
  };

  if (xmlDoc.documentElement != null) {
    return recursivelyTraverseDocument(xmlDoc.documentElement);
  } else {
    throw Error('xml object contained no document node');
  }
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

function xhrPromise (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body: Document | BodyInit | null = null, async: boolean = true, user: string | null = null, password: string | null = null) {
      // based on https://stackoverflow.com/a/30008115
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, async, user, password);
        xhr.onload = function () {
          if (this.status >= 200 && this.status < 300) {
            resolve(xhr.response);
          } else {
            reject({
              status: this.status,
              statusText: xhr.statusText
            });
          }
        };
        xhr.onerror = function () {
          reject({
            status: this.status,
            statusText: xhr.statusText
          });
        };
        xhr.send(body);
      });
}