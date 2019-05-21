import { isArray } from 'util';
import { browser } from 'webextension-polyfill-ts';
import { atomicSchemObjectToJS, jsObjectToSchemType, resolveJSPropertyChain, schemToJs, setJsProperty } from '../javascriptInterop';
import { VirtualFileSystem } from '../virtualFilesystem';
import { prettyPrint, pr_str } from './printer';
import { readStr } from './reader';
import { isSchemAtom, isSchemFunction, isSchemJSReference, isSchemKeyword, isSchemLazyVector, isSchemList, isSchemMap, isSchemNumber, isSchemString, isSchemSymbol, isSchemType, isSchemVector, isSequential, isValidKeyType } from './typeGuards';
import { AnySchemType, RegularSchemCollection, SchemAtom, SchemBoolean, SchemFunction, SchemJSReference, SchemKeyword, SchemLazyVector, SchemList, SchemMap, SchemMapKey, SchemNil, SchemNumber, SchemRegExp, SchemString, SchemSymbol, SchemVector } from './types';

export const coreFunctions: { [symbol: string]: any } = {
    'indentity': {
        paramstring: 'x',
        docstring: `Returns the argument. Any argument. It just returns it. Like, it doesn't do anything to it. Doesn't have any side effects either. Very pure!`,
        f: (x: AnySchemType) => x,
    },
    '+': {
        paramstring: 'number & numbers',
        docstring: 'Adds up all arguments.',
        f: (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue: SchemNumber, currentIndex: number) => {
            if (currentIndex === 0) return currentValue.valueOf();
            else return accumulator + currentValue.valueOf();
        }, 0)),
    },
    '-': {
        paramstring: 'number & numbers',
        docstring: 'Subtracts all numbers, left to right.',
        f: (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue: SchemNumber, currentIndex: number) => {
            if (args.length === 1) return -currentValue.valueOf();
            if (currentIndex === 0) return currentValue.valueOf();
            else return accumulator - currentValue.valueOf();
        }, 0)),
    },
    '*': {
        paramstring: 'number & numbers',
        docstring: 'Multiplies all numbers.',
        f: (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue: SchemNumber, currentIndex: number) => {
            return accumulator * currentValue.valueOf();
        }, 1)),
    },
    '/': {
        paramstring: 'number & numbers',
        docstring: 'Divides all numbers, left to right. Meaning (/ 1 2 3) is ((1 / 2) / 3) in standard notation.',
        f: (...args: SchemNumber[]) => new SchemNumber(args.reduce((accumulator: number, currentValue: SchemNumber, currentIndex: number) => {
            if (args.length === 1) return 1 / currentValue.valueOf();
            if (currentIndex === 0) return currentValue.valueOf();
            else return accumulator / currentValue.valueOf();
        }, 0)),
    },
    'rem': {
        paramstring: 'dividend divisor',
        docstring: `Returns the remainder of dividend divided by divisor. (Hint: It's modulo.)`,
        f: (dividend: SchemNumber, divisor: SchemNumber) => {
            return new SchemNumber(dividend.valueOf() % divisor.valueOf());
        },
    },
    'quot': {
        paramstring: 'dividend divisor',
        docstring: `Returns quotient, rounded towards zero.`,
        f: (dividend: SchemNumber, divisor: SchemNumber) => {
            const quotient = dividend.valueOf() / divisor.valueOf();
            // round towards zero
            return new SchemNumber((quotient > 0) ? Math.floor(quotient) : Math.ceil(quotient));
        },
    },
    'sqr': {
        paramstring: 'number',
        docstring: `Squares number.`,
        f: (d: SchemNumber) => new SchemNumber(d.valueOf() * d.valueOf()),
    },
    '=': {
        paramstring: 'x & more',
        docstring: `Returns true if all arguments are equal.`,
        f: (...args: any[]) => {
            throwErrorIfArityIsInvalid(args.length, 1);
            // If passed a single value (= x) the result is always true.
            if (args.length === 1) return SchemBoolean.true;

            const lessStrictEquality = (a: any, b: any) => {
                if (!isSchemType(a) || !isSchemType(b)) {
                    // at least one of these is a js value. if one of them is a schem primitive, convert it to its js equivalent
                    const valA = (isSchemType(a) ? atomicSchemObjectToJS(a) : a);
                    const valB = (isSchemType(b) ? atomicSchemObjectToJS(b) : b);
                    return (valA === valB);
                } else {
                    return hasSameSchemTypeAndValue(a, b);
                }
            };
            // Compare every consecutive pair of arguments
            for (let i = 0; i < args.length - 1; i++) {
                let a = args[i], b = args[i + 1];

                // Collections are considered to be equal if their contents are the same - regardless of their type.
                if ((isSchemList(a) || isSchemVector(a)) &&
                (isSchemList(b) || isSchemVector(b)) &&
                (a.length === b.length)) {

                    // Compare contents
                    for (let j = 0; j < a.length; j++) {
                        if (!lessStrictEquality(a[j], b[j])) return SchemBoolean.false;
                    }

                } else { // a & b are non-collection types
                    if (!lessStrictEquality(a, b)) return SchemBoolean.false;
                }
            }
            return SchemBoolean.true; // none of the checks above failed, so all arguments must be equal
        },
    },
    '>': {
        paramstring: 'x & more',
        docstring: `Returns true if each successive argument (from left to right) is bigger than the previous one.`,
        f: (...args: SchemNumber[]) => {
            return doNumericComparisonForEachConsecutivePairInArray((a, b) => { return a > b; }, args);
        },
    },
    '<': {
        paramstring: 'x & more',
        docstring: `Returns true if each successive argument (from left to right) is smaller than the previous one.`,
        f: (...args: SchemNumber[]) => {
            return doNumericComparisonForEachConsecutivePairInArray((a, b) => { return a < b; }, args);
        },
    },
    '>=': {
        paramstring: 'x & more',
        docstring: `Returns true if each successive argument (from left to right) is bigger than or equal to the previous one.`,
        f: (...args: SchemNumber[]) => {
            return doNumericComparisonForEachConsecutivePairInArray((a, b) => { return a >= b; }, args);
        },
    },
    '<=': {
        paramstring: 'x & more',
        docstring: `Returns true if each successive argument (from left to right) is smaller than or equal to the previous one.`,
        f: (...args: SchemNumber[]) => {
            return doNumericComparisonForEachConsecutivePairInArray((a, b) => { return a <= b; }, args);
        },
    },
    // returns arguments as a list
    'list': {
        paramstring: '& items?',
        docstring: `Returns a list containing the arguments.`,
        f: (...args: AnySchemType[]) => {
            return new SchemList().concat(args);
        },
    },
    'vector': {
        paramstring: '& items?',
        docstring: `Returns a vector containing the arguments.`,
        f: (...args: AnySchemType[]) => {
            return new SchemVector().concat(args);
        },
    },
    'hash-map': {
        paramstring: '& items',
        docstring: `Returns a map. Successive arguments are treated as key value pairs. Expects an even number of arguments.`,
        f: async (...args: any) => {
            throwErrorIfArityIsInvalid(args.length, 0, Infinity, true);
            const newMap = new SchemMap();
            for (let i = 0; i < args.length; i += 2) {
                newMap.set(await args[i], await args[i + 1]);
            }
            return newMap;
        },
    },
    'vec': {
        paramstring: 'collection',
        docstring: `Returns a vector. If you supply a map, it gets flattened. e.g. {a 1 b 2} => (a 1 b 2)`,
        f: (coll: RegularSchemCollection) => {
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
    },
    // type checks
    'empty?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is empty. (When its count or length is zero.)`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean('length' in arg && arg.length === 0);
        },
    },
    'number?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a number.`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean(isSchemNumber(arg) || typeof arg === 'number');
        },
    },
    'string?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a string.`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean(isSchemString(arg) || typeof arg === 'string');
        },
    },
    'symbol?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a symbol.`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean(isSchemSymbol(arg));
        },
    },
    'keyword?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a keyword.`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean(isSchemKeyword(arg));
        },
    },
    'schem-function?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a SchemFunction. Will return fale for native js functions..`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean(isSchemFunction(arg));
        },
    },
    'js-function?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a native javascript function. Will return false for Schem`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean(typeof arg === 'function' && !isSchemFunction(arg));
        },
    },
    'atom?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is an atom.`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean(isSchemAtom(arg));
        },
    },
    'list?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a list.`,
        f: (arg: AnySchemType): SchemBoolean => {
            return SchemBoolean.fromBoolean(isSchemList(arg));
        },
    },
    'vecor?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a vector.`,
        f: (arg: AnySchemType): SchemBoolean => {
            return SchemBoolean.fromBoolean(isSchemVector(arg));
        },
    },
    'map?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a map.`,
        f: (arg: AnySchemType): SchemBoolean => {
            return SchemBoolean.fromBoolean(isSchemMap(arg));
        },
    },
    'array?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is a js Array of some kind.`,
        f: (arg: AnySchemType): SchemBoolean => {
            return SchemBoolean.fromBoolean(isArray(arg));
        },
    },
    'schem-type?': {
        paramstring: 'value',
        docstring: `Returns true if the argument is any Schem type.`,
        f: (arg: AnySchemType) => {
            return SchemBoolean.fromBoolean(isSchemType(arg));
        },
    },
    'count': {
        paramstring: 'coll-or-string',
        docstring: `Returns argument's length or count of its items. (For maps, each key value pair counts as one item.)`,
        f: (arg: any) => {
            if ('count' in arg) {
                return new SchemNumber(arg.count());
            } else if (isSchemString(arg)) {
                return new SchemNumber(arg.length);
            } else if (arg === SchemNil.instance) {
                return new SchemNumber(0);
            } else if ('length' in arg) {
                return new SchemNumber(arg.length);
            } else {
                throw new Error(`tried to count soemthing other than a collection, string or nil. It also doesn't have a length.`);
            }
        },
    },
    'first': {
        paramstring: 'value',
        docstring: `Returns the first item of a collection.`,
        f: (sequential: SchemList | SchemVector | Array<any>) => {
            throwErrorForNonSequentialArguments(sequential);
            if (sequential.length === 0) return SchemNil.instance;
            return sequential[0];
        },
    },
    'rest': {
        paramstring: 'value',
        docstring: `Returns all but the first item of a collection.`,
        f: (sequential: SchemList | SchemVector | Array<any>) => {
            throwErrorForNonSequentialArguments(sequential);
            if (sequential.length === 0) return SchemNil.instance;
            return new SchemList(...sequential.slice(1));
        },
    },
    'last': {
        paramstring: 'value',
        docstring: `Returns the last item of a collection.`,
        f: (sequential: SchemList | SchemVector | Array<any>) => {
            throwErrorForNonSequentialArguments(sequential);
            if (sequential.length === 0) return SchemNil.instance;
            return sequential[sequential.length - 1];
        },
    },
    'butlast': {
        paramstring: 'value',
        docstring: `Returns all but the last item of a collection.`,
        f: (sequential: SchemList | SchemVector | Array<any>) => {
            throwErrorForNonSequentialArguments(sequential);
            if (sequential.length === 0) return SchemNil.instance;
            return new SchemList(...sequential.slice(0, sequential.length - 1));
        },
    },
    'nth': {
        paramstring: 'value',
        docstring: `Returns the nth item of any collection that can be accesed by an index.`,
        f: (sequential: SchemList | SchemVector | Array<any>, index: SchemNumber) => {
            throwErrorForNonSequentialArguments(sequential);
            const i = index.valueOf();
            if (i < 0) throw `index value must be positive`;
            if (!(isSchemLazyVector(sequential)) && i >= sequential.length) {
                throw `index out of bounds: ${i} >= ${sequential.length}`;
            }
            if (isSchemVector(sequential) || isSchemList(sequential)) {
                return sequential.nth(index.valueOf());
            } else {
                return sequential[index.valueOf()];
            }
        },
    },
    /** */
    'pr-str': {
        paramstring: '& args',
        docstring:  `Calls pr_str (escaped) on each argument, joins the results, seperated by ' '.`,
        f: async (...args: AnySchemType[]) => {
            return new SchemString((await asyncStringifyAll(args, true)).join(' '));
        },
    },
    /** */
    'str': {
        paramstring: '& args',
        docstring:  `Calls pr_str (unescaped) on each argument, concatenates the results.`,
        f: async (...args: AnySchemType[]) => {
            return new SchemString((await asyncStringifyAll(args, false)).join(''));
        },
    },
    'prn': {
        paramstring: '& args',
        docstring:  `Stringifies args, joins them and prints them to the browser console. Returns nil.`,
        f: async (...args: AnySchemType[]) => {
            const stringified = await asyncStringifyAll(args);
            console.log(stringified.join(' '));
            return SchemNil.instance;
        },
    },
    'println': {
        paramstring: '& args',
        docstring:  `Stringifies args (unescaped) and prints them to the browser console. Returns nil.`,
        f: async (...args: AnySchemType[]) => {
            console.log(await asyncStringifyAll(args, false));
            return SchemNil.instance;
        },
    },
    'read-string': {
        paramstring: 'string',
        docstring:  `Reads a string and turns it into an abstract syntax tree.`,
        f: (str: SchemString) => {
            return readStr(str.valueOf());
        },
    },
    'xhr-get': {
        paramstring: 'url',
        docstring:  `Makes an asynchronous http GET request and returns a promise. In most cases, you can treat this like a synchronous operation that just takes a lot of time. ;)`,
        f: async (url: SchemString) => {
            return xhrPromise('GET', url.valueOf());
        },
    },
    'xhr-post': {
        paramstring: 'url',
        docstring:  `Makes an asynchronous http PUT request and returns a promise. In most cases, you can treat this like a synchronous operation that just takes a lot of time. ;)`,
        f: async (url: SchemString, body: AnySchemType) => {
            return xhrPromise('POST', url.valueOf(), schemToJs(body));
        },
    },
    'xhr-put': {
        paramstring: 'url body',
        docstring:  `Makes an asynchronous http PUT request and returns a promise. In most cases, you can treat this like a synchronous operation that just takes a lot of time. ;)`,
        f: async (url: SchemString, body: any) => {
            return xhrPromise('PUT', url.valueOf(), schemToJs(body));
        },
    },
    'xhr-delete': {
        paramstring: 'url',
        docstring:  `Makes an asynchronous http DELETE request and returns a promise. In most cases, you can treat this like a synchronous operation that just takes a lot of time. ;)`,
        f: async (url: SchemString) => {
            return xhrPromise('DELETE', url.valueOf());
        },
    },
    'slurp': {
        paramstring: 'path-or-url options',
        docstring:  `Reads the contents of a file from the local file system when the arguments starts with '/', otherwise it returns the response of GETing the resource from the supplied url.`,
        f: async (pathOrUrl: SchemString | string, opts?: SchemMap) => {
            pathOrUrl = pathOrUrl.valueOf();
            // get full URL for files packaged with the browser extension, when url begins with a slash
            if (pathOrUrl[0].startsWith('/extension-resources/')) {
                return new SchemString(await xhrPromise('GET', browser.extension.getURL(pathOrUrl)));
            }

            let url: URL;
            try {
                url = new URL(pathOrUrl);
            } catch {
                return new SchemString(await VirtualFileSystem.readObject(pathOrUrl));
            }
            return new SchemString(await xhrPromise('GET', url.href));
        },
    },
    'xml->map': {
        paramstring: 'string-or-xml-document options',
        docstring: `Turns an xml string or XMLDocument object into a Schem map.`,
        f: (xml: XMLDocument | string | SchemString, options?: SchemMap) => {
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
    },
    'get': {
        paramstring: 'map key default-value?',
        docstring: `Looks up the value for a key in a map and returns that. Returns the default value when the lookup fails. Or nil if you didn's supply a default value.`,
        f: (map: SchemMap, key: SchemMapKey, defaultValue?: AnySchemType) => {
            if (isSchemMap(map)) {
                if (isValidKeyType(key)) {
                    return (map.has(key)) ? map.get(key) : defaultValue ? defaultValue : SchemNil.instance;
                } else {
                    throw `map lookup only works with valid key types`;
                }
            }
            return SchemNil.instance;
        },
    },
    'atom': {
        paramstring: 'value',
        docstring: `Returns an atom with 'value' as its ... value.`,
        f: (value: AnySchemType) => {
            return new SchemAtom(value);
        },
    },
    'deref': {
        paramstring: 'atom',
        docstring: `Returns the value of an atom.`,
        f: (atom: SchemAtom) => {
            return atom.getValue();
        },
    },
    'reset!': {
        paramstring: 'atom value',
        docstring: `Sets the atoms value.`,
        f: (atom: SchemAtom, value: AnySchemType) => {
            return atom.setValue(value);
        },
    },
    'cons': {
        paramstring: 'item coll',
        docstring: `Returns a new list containing item as the first item, followed by the contents of coll. (cons a (b c)) => (a b c)`,
        f: (item: AnySchemType, list: SchemList) => {
            return new SchemList(item, ...list);
        },
    },
    'conj': {
        paramstring: 'target-collection & elements',
        docstring: `Adds elements to the collection. Depending on the collection type, that means different things:\n For lists: at the beginning, for vectors: at the end.\nIf your target collection is a map, check the examples file or consult the clojure docs. It might work more or less like that. ;)`,
        f: (targetCollection: SchemList | SchemVector | SchemMap, ...elements: AnySchemType[]) => {
            if (isSchemList(targetCollection)) {
                return new SchemList(...elements, ...targetCollection);
            } else if (isSchemVector(targetCollection)) {
                return new SchemVector(...targetCollection, ...elements);
            } else if (isSchemMap(targetCollection)) {
                elements.forEach(sourceCollection => {
                    if (isSchemMap(sourceCollection)) {
                        sourceCollection.forEach((k, v) => {
                            targetCollection.set(k, v);
                        });
                    } else if (isSchemVector(sourceCollection)) {
                        for (let i = 0; i < sourceCollection.count(); i += 2) {
                            if (isValidKeyType(sourceCollection[i])) {
                                if (sourceCollection[i + 1] == null) {
                                    throw new Error(`When 'conj'ing a vector into a map, the vector must have an even number of elements.`);
                                }
                                targetCollection.set(sourceCollection[i] as SchemMapKey, sourceCollection[i + 1]);
                            }
                        }
                    } else {
                        throw new Error(`'conj' can only combine maps or vectors with maps.`);
                    }
                });
                return targetCollection;
            } else {
                throw new Error(`The target collection for 'conj' must be a List, Vector or Map`);
            }
        },
    },
    'concat': {
        paramstring: '& sequential-collection',
        docstring: `Returns a list containing the concatenated contents of sequential-collections.`,
        f: (...seqs: (SchemList | SchemVector | SchemMap)[]) => {
            throwErrorIfArityIsInvalid(seqs.length, 1);

            let newList = new SchemList();
            seqs.forEach(seq => {
                if (isSequential(seq)) {
                    newList.push(...seq);
                } else if (isSchemMap(seq)) {
                    seq.forEach((k, v) => {
                        newList.push(new SchemVector(k, v));
                    });
                } else {
                    throw new Error(`Concat only accepts Lists, Vectors and Maps.`);
                }
            });
            return newList;

        },
    },
    'map': {
        paramstring: 'fn & sequential-collections',
        docstring: `Please see the example file. My fingers hurt.`,
        f: async (fn: SchemFunction, ...sequentials: (SchemList | SchemVector | Array<any>)[]) => {
            throwErrorForNonSequentialArguments(...sequentials);

            if (sequentials.length === 1) {
                const newValues = await Promise.all(sequentials[0].map((value) => {
                    return fn.f(value);
                }));
                return new SchemList(...newValues);
            } else {

                const shortestSequential = sequentials.reduce((shortestSeq: SchemList | SchemVector, currentSeq) => {
                    return (currentSeq.length < shortestSeq.length) ? currentSeq : shortestSeq;
                }, sequentials[0]);

                const newValues = await Promise.all(shortestSequential.map((v, index) => {
                    const args = sequentials.map((seq) => {
                        return seq[index];
                    });
                    return fn.f(...args);
                }));
                return new SchemList(...newValues);

            }
        },
    },
    'filter': {
        paramstring: 'predicate list-or-vector',
        docstring: `Returns a new list, containing all elements of the original list for which the predicate function returns true. Checks run kind of cuncurrently.`,
        f: async (pred: SchemFunction, seq: SchemVector | SchemList) => {
            const elementValidity = await Promise.all(seq.map((value) => {
                return pred.f(value).then((result: any) => (result === SchemBoolean.true));
            }));

            const newList = new SchemList();
            seq.forEach((value, index) => {
                if (elementValidity[index]) {
                    newList.push(value);
                }
            });
            return newList;
        },
    },
    /** behaves like clojure's reduce, at least for lists and vectors */
    'reduce': {
        paramstring: 'fn initial-value? sequential',
        docstring: `Please see the example file. My fingers hurt.`,
        f: async (func: SchemFunction, ...restArgs: AnySchemType[]) => {
            // TODO: switch calls to nth for first/rest, also implement those for maps
            // Sooo many awaits!

            if (restArgs.length === 1 && isSequential(restArgs[0])) {
                const coll: SchemVector | SchemList = restArgs[0] as any;

                if (coll.count() === 0) {
                    return func.f();
                }

                if (coll.count() === 1) {
                    return coll.nth(0);
                }

                let result: AnySchemType = await func.f(await coll.nth(0), await coll.nth(1));
                for (let i = 2; i < coll.count(); i++) {
                    result = await func.f(result, await coll.nth(i));
                }

                return result;

            } else if (restArgs.length === 2 && isSequential(restArgs[1])) {
                // reduce called with initial value
                const initialVal = restArgs[0];
                const coll: SchemVector | SchemList = restArgs[1] as any;

                if (coll.count() === 0) {
                    return func.f(await initialVal);
                }

                if (coll.count() === 1) {
                    return func.f(await initialVal, await coll.nth(0));
                }

                let result: AnySchemType = await func.f(await initialVal, await coll.nth(0));
                for (let i = 1; i < coll.count(); i++) {
                    result = await func.f(result, await coll.nth(i));
                }

                return result;

            } else {
                throw new Error(`Reduce takes arguments of like (function, sequential) or (function, initial-value, sequential). Nothing else.`);
            }
        },
    },
    'score-string-similarity': {
        paramstring: 'string-a string-b',
        docstring: `Returns a score for the similarity between string-a and string-b. The algorithm I made up was used to sort autocompletion suggestions so this is probably unfit for most other applications.`,
        f: (needle: SchemString, haystack: SchemString) => {
            return new SchemNumber(computeSimpleStringSimilarityScore(needle.toString(), haystack.toString()));
        },
    },
    'sort-and-filter-by-string-similarity': {
        paramstring: 'needle haystack score-threshold',
        docstring: `Can be used to filter and rank suggestions for auto-completions based on some incomplete user input.`,
        f: (needle: SchemString, haystack: SchemList | SchemVector, scoreThreshold: SchemNumber = new SchemNumber(1)) => {

            const rankedHaystack: Array<[number, SchemString | SchemSymbol | SchemKeyword]> = haystack.map((hay) => {
                // create an aray of tuples [score, haystackElement]
                if (isSchemString(hay)) {
                    return <[number, SchemString]>[computeSimpleStringSimilarityScore(needle.valueOf(), hay.valueOf()), hay];
                } else if (isSchemSymbol(hay) || isSchemKeyword(hay)) {
                    return <[number, SchemSymbol | SchemKeyword]>[computeSimpleStringSimilarityScore(needle.valueOf(), hay.name), hay];
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
    },
    'pretty-print': {
        paramstring: 'map indentation-size?',
        docstring: `Tries to print the contents of a map in a more readable way.`,
        f: async (m: SchemMap, indent: SchemNumber = new SchemNumber(2)) => {
            return new SchemString(await prettyPrint(m, true, { indentSize: indent.valueOf() }));
        },
    },
    'prompt': {
        paramstring: 'message default-value',
        docstring: `Currently just an alias for window.prompt.`,
        f: (message: SchemString = new SchemString(''), defaultValue: SchemString = new SchemString('')) => {
            let input = window.prompt(message.toString(), defaultValue.getStringRepresentation());
            return new SchemString(input);

        },
    },
    'apply': {
        paramstring: 'fn arglist',
        docstring: `Calls function with the contents (!) or arglist as parameters. e.g.: (apply fn [a b c]) => (fn a b c)`,
        f: async (fn: SchemFunction | Function, argList: SchemList | SchemVector) => {
            throwErrorForNonSequentialArguments(argList);
            if (isSchemFunction(fn)) {
                return await fn.invoke(...argList);
            } else if (isSchemJSReference(fn) && fn.typeof() === 'function') {
                fn.invoke(...argList);
            }
        },
    },
    // Obsolete due to dot-accessor syntax?
    // /** invokes a js function without passing arguments */
    // 'call': {
    //     f: async (obj: SchemJSReference | Function) => {
    //         if (isSchemJSReference(obj) && obj.typeof() === 'function') {
    //             return await obj.invoke();
    //         } else if (typeof obj === 'function') {
    //             return await obj();
    //         }
    //     },
    // },
    're-pattern': {
        paramstring: 'string',
        docstring: `Creates a Schem regular expression from a string.`,
        f: async (pattern: SchemString) => {
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
    },
    're-find': {
        paramstring: 'regular-expression string',
        docstring: `Returns a list of matches for regular-expression in string.`,
        f: async (rex: SchemRegExp, str: SchemString) => {
            const matches = rex.exec(str.getStringRepresentation());
            if (matches !== null) {
                return new SchemList(...matches.map(m => new SchemString(m)));
            } else {
                return SchemNil.instance;
            }
        },
    },
    'lazy-vector': {
        paramstring: 'producer-fn count?',
        docstring: `Creates a lazy vector. Please see the example file for examples.`,
        f: (producer: SchemFunction, count?: SchemNumber) => {
            return new SchemLazyVector(producer, (count) ? count.valueOf() : Infinity);
        },
    },
    'subvec': {
        paramstring: 'vector-ish-thing atart? end?',
        docstring: `Returns a slice of a vector, array or LazyVector. (Realizing a LazyVector in the process.)`,
        f: async (source: SchemVector | Array<any> | SchemLazyVector, start?: SchemNumber, end?: SchemNumber) => {
            if (isSchemVector(source) || isArray(source)) {
                return source.slice((start) ? start.valueOf() : 0, (end) ? end.valueOf() : undefined);
            } else {
                if (typeof end === 'undefined' && source.count() === Infinity) {
                    throw `You must provide an end index for lazy vectors of infinite size.`;
                }
                return source.realizeSubvec((start) ? start.valueOf() : 0, (end) ? end.valueOf() : undefined);
            }
        },
    },
    'log': {
        paramstring: '& args',
        docstring: `Alias for console.log.`,
        f: (...args: []) => {
            console.log(...args);
            return SchemNil.instance;
        },
    },
    // Obsolete due to bang accessor?
    // 'set!': {
    //     f: (sym: SchemSymbol | SchemJSReference, value: AnySchemType) => {
    //         if (isSchemSymbol(sym)) {
    //             if (!SchemSymbol.refersToJavascriptObject(sym)) {
    //                 throw new Error(`You're not allowed to set Schem bindings to new values. Use atoms for mutable state.`);
    //             }
    //             setJsProperty(sym.name, schemToJs(value));
    //         } else if (isSchemJSReference(sym)) {
    //             sym.set(schemToJs(value));
    //         }
    //     },
    // },
    'add-watch': {
        paramstring: 'atom name fn',
        docstring: `Adds a watch function to an atom. (See Example file.)`,
        f: (atom: SchemAtom, name: SchemKeyword, f: SchemFunction): void => {
            atom.addWatch(name, f);
        },
    },
    'remove-watch': {
        paramstring: 'atom name fn',
        docstring: `Removes a watch function from an atom. (See Example file.)`,
        f: (atom: SchemAtom, name: SchemKeyword): void => {
            atom.removeWatch(name);
        },
    },
    'storage-create': {
        paramstring: 'path-and-filename value',
        docstring: `Saves a value to a new file in the virtual file system. Won't override existing files.`,
        f: async (qualifiedObjectName: SchemString, value: AnySchemType) => {
            return await VirtualFileSystem.writeObject(qualifiedObjectName.valueOf(), schemToJs(value));
        },
    },
    'storage-create-or-update': {
        paramstring: 'path-and-filename value',
        docstring: `Saves a value to a new file in the virtual file system or updates an existing file.`,
        f: async (qualifiedObjectName: SchemString, value: AnySchemType) => {
            return await VirtualFileSystem.writeObject(qualifiedObjectName.valueOf(), schemToJs(value), true);
        },
    },
    'storage-read': {
        paramstring: 'path-and-filename',
        docstring: `Reads a file from the virtual file system.`,
        f: async (qualifiedObjectName: SchemString) => {
            return await VirtualFileSystem.readObject(qualifiedObjectName.valueOf());
        },
    },
    'storage-update': {
        paramstring: 'path-and-filename value',
        docstring: `Overwrites the value of an existing file in the virtual file system. Won't create new files.`,
        f: async (qualifiedObjectName: SchemString, value: AnySchemType) => {
            await VirtualFileSystem.updateObject(qualifiedObjectName.valueOf(), schemToJs(value));
            return value;
        },
    },
    'storage-delete': {
        paramstring: 'path-and-filename',
        docstring: `Deletes a file from the virtual file system.`,
        f: async (qualifiedObjectName: SchemString) => {
            await VirtualFileSystem.removeObject(qualifiedObjectName.valueOf());
            return SchemNil.instance;
        },
    },
    'storage-exists': {
        paramstring: 'path-and-filename',
        docstring: `Returns true if a file by that name exists in the virtual file system.`,
        f: async (qualifiedObjectName: SchemString) => {
            let exists = await VirtualFileSystem.existsOject(qualifiedObjectName.valueOf());
            return SchemBoolean.fromBoolean(exists);
        },
    },
    'storage-clear-all': {
        paramstring: '',
        docstring: `THIS DELETES ALL YOUR PRECIOUS FILES! WHY WOULD YOU DO THIS?!`,
        f: async () => {
            if (window.confirm('Do you really want to clear the local storage? This would delete all objects and then they are gone forever.')) {
                VirtualFileSystem.clearStorage();
                return new SchemString('Local storage was cleared.');
            }
            return new SchemString('Clearing the storage was canceled.');
        },
    },
    // TODO: fix it!
    'storage-ls': {
        paramstring: 'path',
        docstring: `Kurrently kaputt.`,
        f: async (path: SchemString) => {
            const folderInfo = await VirtualFileSystem.listFolderContents(path.valueOf());
            return jsObjectToSchemType(folderInfo, { depth: 9001 });
        },
    },
    'resolve-js-property-chain': {
        f: (jsObject: any, ...propertyNames: Array<SchemString | SchemKeyword>) => {
            const pNames: string[] = propertyNames.map(e => isSchemKeyword(e) ? e.name : e.valueOf());
            return resolveJSPropertyChain(jsObject, ...pNames);
        },
    },
    'sleep': {
        paramstring: 'milliseconds',
        docstring: `Does nothing for n ms, then returns nothing. How very zen!`,
        f: async (ms: SchemNumber) => {
            await new Promise(resolve => setTimeout(resolve, ms.valueOf()));
            return SchemNil.instance;
        },
    },
    'throw': {
        paramstring: 'exception',
        docstring: 'Throws an exception.',
        f: (e: any) => { throw e; }
    },
    'throw-error': {
        paramstring: 'error-message',
        docstring: 'Throws an Error object containing a message.',
        f: (e: any) => { throw e; }
    }
};


/// supporting functions

function doNumericComparisonForEachConsecutivePairInArray(predicate: (a: number, b: number) => boolean, args: SchemNumber[]) {
    for (let i = 0; i < args.length - 1; i++) {
        if (!(isSchemNumber(args[i])) || !(args[i + 1] instanceof SchemNumber)) {
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

function throwErrorForNonSequentialArguments(...args: any[]) {
    args.forEach(arg => {
        if (!(isSequential(arg) || ('nth' in arg) || Array.isArray(arg))) {
            throw `Expected argument to be sequential. Got this instead: ${arg}`;
        }
    });
}

function hasSameSchemTypeAndValue(a: AnySchemType, b: AnySchemType): boolean {
    return (isSchemType(a) && isSchemType(b) && a.typeTag === b.typeTag && a.valueOf() === b.valueOf());
}

async function asyncStringifyAll(schemObjects: AnySchemType[], escapeStrings: boolean = true): Promise<string[]> {
    return Promise.all(schemObjects.map((element) => {
        return pr_str(element, escapeStrings);
    }));
}

function createSchemMapFromXMLDocument(xmlDoc: XMLDocument, options: { 'key-type'?: 'string' | 'keyword' } = { 'key-type': 'string' }): SchemMap {
    function createKey(v: string) {
        if (options['key-type'] === 'keyword') {
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

function xhrPromise(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body: Document | BodyInit | null = null, async: boolean = true, user: string | null = null, password: string | null = null) {
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
        if (body != null) {
            xhr.send(body);
        } else {
            xhr.send();
        }
    });
}