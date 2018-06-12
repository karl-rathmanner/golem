import { SchemFunction, SchemNumber, SchemSymbol, SchemType, SchemBoolean, SchemNil, SchemList, SchemString, SchemVector, SchemMap, SchemMapKey, SchemKeyword, SchemAtom, isSequential } from './types';
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

function throwErrorForNonSequentialArguments(...args: SchemType[]) {
  args.forEach(arg => {
    if (!isSequential(arg)) {
      throw `Expected argument to be sequential. Got this instead: ${arg}`;
    }
  });
}

function hasSameConstructorAndValue(a: SchemType, b: SchemType): boolean {
  return (a.constructor === b.constructor && a.valueOf() === b.valueOf());
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
  'first': (sequential: SchemList | SchemVector) => {
    throwErrorForNonSequentialArguments(sequential);
    if (sequential.length === 0) return SchemNil.instance;
    return sequential[0];
  },
  'rest': (sequential: SchemList | SchemVector) => {
    throwErrorForNonSequentialArguments(sequential);
    if (sequential.length === 0) return SchemNil.instance;
    return new SchemList(sequential.slice(1));
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
    if (i >= sequential.length) throw `index out of bounds: ${i} >= ${sequential.length}`;
    return sequential[index.valueOf()];
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
  'slurp': async (url: SchemString, opts?: SchemMap) => {
    // get full URL for files packaged with the browser extension, when url begins with a slash
    const actualUrl = (url[0] === '/') ? browser.extension.getURL('/schemScripts' + url.valueOf()) : url.valueOf();

    let ajaxSettings: JQueryAjaxSettings = {
      type: 'GET',
      url: actualUrl,
      success: (response) => {
        console.log(response);
        return response;
      }
    };

    let format: any = opts ? opts.getValueForKeyword('dataType') : null;
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
  }
};