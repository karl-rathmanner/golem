import { isSchemString, isSchemMap, isSchemKeyword, isSequable, isSchemCollection, isSchemType, isSchemNil, isSchemNumber, isSchemSymbol, isSchemFunction } from './schem/typeGuards';
import { AnySchemType, SchemJSReference, SchemMap, SchemString, SchemSymbol, toSchemMapKey, SchemNil, SchemKeyword, SchemList, SchemVector, SchemNumber, SchemBoolean } from './schem/types';

export const interopFunctions: {[symbol: string]: any} = {
  'js->schem': async (value: AnySchemType, options?: SchemMap) => {
    return jsObjectToSchemType(value, schemToJs(options, {keySerialization: 'toPropertyIdentifier'}));
  },
  'schem->js': (value: AnySchemType, options?: SchemMap) => {
    return schemToJs(value, schemToJs(options, {keySerialization: 'toPropertyIdentifier'}));
  },
  'js-ref': (...args: any[]): SchemJSReference => {
    if (args.length === 1) {
      if (isSchemString(args[0])) {
        return new SchemJSReference(window, args[0].valueOf());
      } else {
        throw new Error('js-ref expects a SchemString, when called with a single argument.');
      }
    } else if (args.length === 2) {
      const [parentObject, propertyName] = args;
      return new SchemJSReference(parentObject, propertyName.valueOf());
    } else {
      throw new Error('js-ref expects one or two arguments');
    }
  },
  '.': (o: any, propertyChain: SchemString | SchemSymbol) => {
    return resolveJSPropertyChain(o, propertyChain.valueOf());
  },
  'js-deref': (jsref: SchemJSReference) => {
    return jsref.get();
  },
  'new': async (jsObjectType: SchemSymbol, ...args: any[]) => {
    if (isSchemSymbol(jsObjectType) && SchemSymbol.refersToJavascriptObject(jsObjectType)) {
      let o = await getJsProperty(jsObjectType.valueOf());
      let jsArgs = args.map(atomicSchemObjectToJS);
      // credit: https://stackoverflow.com/a/8843181
      return new (Function.prototype.bind.call(o, null, ...jsArgs));
    }
  }
};


/** Returns a stringifiable javascript object based on the schem value/collection.
 * By default the "noPrefix" option is active, because that's very convenient for js interop.
 * Be aware that this will result in loosing values when the "values" of keys with different schem types collide in the js object! e.g.:
 ```
 // using includeTypePrefix:
 {1 1, "1" 2, :1 3} -> {n1: 1, s1: 2, k1: 3}
 // using noPrefix:
 {1 1, "1" 2, :1 3} -> {1: 3}
 ```
 * There's also 'toPropertyIdentifier' that tries to turn keys into valid, camel cased javascript identifiers that can be used in dot notation. (By removing illegal characters, turning a lowercase character following a dash into an uppercase character. It's not checking for reserved words!)
 * e.g.: ':some-random!-identifier' -> 'someRandomIdentifier'
 * or: '1-bad-identifier' -> 'badIdentifier'
 *
 * @param {object} options Indicates how map keys should be handled. Choose wisely.
*/
// TODO: as isSerializable check and throw error when trying to convert a schemObject that isn't
export function schemToJs(schemObject?: AnySchemType | null, options: {keySerialization: 'includeTypePrefix' | 'noPrefix' | 'toPropertyIdentifier'} = {keySerialization: 'noPrefix'}): any | null {
  let jsObject: any;

  // maps turn into objects
  if (isSchemMap(schemObject)) {
    jsObject = {};
    schemObject.forEach((key, value) => {
      let jsKey, jsValue;

      if (options.keySerialization === 'includeTypePrefix') {
        jsKey = toSchemMapKey(key);
      } else { // noPrefix or toPropertyIdentifier
        if (isSchemKeyword(key)) {
          jsKey = key.name;
        } else {
          jsKey = key.getStringRepresentation();
        }

        if (options.keySerialization === 'toPropertyIdentifier') {
          jsKey = jsKey.replace(/^\d*/, ''); // remove numerical characters at the beginning of the key
          jsKey = jsKey.replace(/[^a-zA-Z0-9$_-]/g, ''); // remove any non alphanumeric character except '$', '_' or '-'
          jsKey = jsKey.replace(/^-*/, ''); // remove dashes at beginning
          jsKey = jsKey.replace(/-+/g, '-'); // turn repeated dashes into a single one
          let camelCasedKey = '';
          for (let i = 0; i < jsKey.length; i++) {
            if (jsKey[i] === '-') {
              // turn characters following a dash into uppercase version, skip the dash itself
              camelCasedKey += jsKey[i + 1].toUpperCase();
              i++;
            } else {
              camelCasedKey += jsKey[i];
            }
          }
          jsKey = camelCasedKey;


        }
      }


      jsObject[jsKey] = schemToJs(value, options);
    });

  // list and vectors turn into arrays
  } else if (isSequable(schemObject)) {
    jsObject = [];

    // iterate over collection
    while (schemObject != null && isSequable(schemObject)) {
      const firstElement = schemObject.first();
      if (firstElement != null) {
        if (isSchemCollection(firstElement)) {
          // add nested collection
          jsObject.push(schemToJs(firstElement, options));
        } else {
          // ad atomic value
          jsObject.push(firstElement.valueOf());
        }

      }
      schemObject = schemObject.next();
    }

  } else if (isSchemType(schemObject)) {
    if (isSchemNil(schemObject)) {
      return null;
    }
    return atomicSchemObjectToJS(schemObject);
  }

  return jsObject;
}

/** Converts a Schem value (that isn't a collection) to a js primitive */
export function atomicSchemObjectToJS(schemObject?: AnySchemType): any {
  if (typeof schemObject === 'undefined') return undefined;
  if (schemObject instanceof SchemNil) return null;
  if (isSchemNumber(schemObject)) return schemObject.valueOf();
  if (isSchemFunction(schemObject)) {
    return (...args: any[]) => {
      const newForm = new SchemList(schemObject, ...args.map(value => primitiveValueToSchemType(value)));
      return window.golem.interpreter!.evalSchem(newForm);
    };
  }
  // getStringRepresentation is preferable to valueOf because it returns values that look like their Schem representation (e.g. ":keyword" instead of "keyword")
  return ('getStringRepresentation' in schemObject) ? schemObject.getStringRepresentation() : schemObject.valueOf();
}

/** Tries to recursively (if deph > 0) convert js objects to schem representations.
 ``` markdown
 - Objects -> Maps
 - Arrays -> Lists or Vectors, depending on options
 - Primitive js values turn into their respective Schem values
 - Anything that can't be converted turns into 'nil'
 ```
 * */
export function jsObjectToSchemType(o: any, options: {arraysToVectors?: boolean, depth?: number} = {}, currentDepth = 0): AnySchemType {
  if (options.arraysToVectors == null) options.arraysToVectors = false;
  if (typeof options.depth === 'undefined') options.depth = 0;

  if (typeof o === 'object') {
    if (currentDepth > options.depth) {
      return SchemKeyword.from('js-> schem conversion exceeding desired depth');
    }
    if (o instanceof Array) {
      if (options.arraysToVectors) {
        return new SchemVector(...o.map(element => jsObjectToSchemType(element, options, currentDepth++)));
      } else {
        return new SchemList(...o.map(element => jsObjectToSchemType(element, options, currentDepth++)));
      }
    } else {

      const schemMap = new SchemMap();
      for (const property in o) {
        schemMap.set(SchemKeyword.from(property), jsObjectToSchemType(o[property], options, currentDepth++ ));
      }
      /* not going up the prototype chain. :/
      const properterties = Object.getOwnPropertyNames(o);
      properterties.forEach(property => {
        schemMap.set(SchemKeyword.from(property), jsObjectToSchemType(o[property]));
      });*/
      return schemMap;
    }
  } else {
    return primitiveValueToSchemType(o, SchemNil.instance);
  }
}

/** Converts a primitive js value to a Schem object */
export function primitiveValueToSchemType(value: any, defaultValue?: AnySchemType): AnySchemType {
  switch (typeof value) {
    case 'string': return new SchemString(value);
    case 'number': return new SchemNumber(value);
    case 'boolean': return SchemBoolean.fromBoolean(value);
    case 'undefined': return SchemNil.instance;
    default:
      if (defaultValue != null) {
        return defaultValue;
      } else {
        throw new Error(`can't convert ${typeof value} to SchemType, no default value provided.`);
      }
  }
}

/** Invokes a js function */
export async function invokeJsProcedure(qualifiedProcedureName: string, procedureArgs: any[]) {
  const blackList = ['eval', 'innerHTML'];
  let propertyNames = qualifiedProcedureName.split('.');
  const procedureName: string = propertyNames.pop()!;
  let obj: any = window;

  if (propertyNames[0] === '') {
    // qualifiedName began with a dot, so the first propertyName is an empty string. For the time being, the initial dot is optional. In any case, we drop the first item...
    propertyNames.shift();
  }

  if (propertyNames.length > 0) {
    obj = resolveJSPropertyChain(window, ...propertyNames);
  }

  if (blackList.some(element => procedureName.lastIndexOf(element) > -1)) {
    return Promise.reject('Tried to invoke a blacklisted JS function.');
  } else {
    try {
      return Promise.resolve(obj[procedureName](...procedureArgs));
    } catch (e) {
      console.error(e);
      return Promise.reject('Js procedure invocation failed with message: ' + e.message);
    }
  }
}

/** Asynchronously returns a js property */
export async function getJsProperty(qualifiedPropertyName: string) {
  try {
    return Promise.resolve(getOrSetJSProperty(qualifiedPropertyName));
  } catch (e) {
    console.error(e);
    return Promise.reject(`Couldn't get JS property. ${e.message}`);
  }
}

/** Asynchronously sets a js property and returns its value
 * (unless: race condition...)
 */
export async function setJsProperty(qualifiedPropertyName: string, value: any) {
  try {
    return Promise.resolve(getOrSetJSProperty(qualifiedPropertyName, value));
  } catch (e) {
    console.error(e);
    return Promise.reject(`Couldn't set JS property. ${e.message}`);
  }
}

async function getOrSetJSProperty(qualifiedName: string, value?: any): Promise<any> {
  const blackList = ['eval', 'innerHTML'];
  const propertyNames: string[] = qualifiedName.split('.');
  const lastPropertyName = propertyNames.pop()!;
  let obj: any = window;

  if (propertyNames[0] === '') {
    // qualifiedName began with a dot, so the first propertyName is an empty string. For the time being, the initial dot is optional. In any case, we drop the first item...
    propertyNames.shift();
  }

  if (propertyNames.length > 0) {
    obj = resolveJSPropertyChain(window, ...propertyNames);
  }

  if (blackList.some(element => propertyNames.lastIndexOf(element) > -1)) {
    return Promise.reject('Tried to access a blacklisted JS object.');
  } else {
    if (typeof  value !== 'undefined') {
      obj[lastPropertyName] = value;
    }
    return Promise.resolve(obj[lastPropertyName]);
  }
}

/** Returns a (possibly nested) property of parentObject */
export function resolveJSPropertyChain(parentObject: any, ...propertyNames: string[]): any {

  // if a single propertyName argument is supplied, but it contains dots -> explode it, so the property chain can be properly resolved
  if (propertyNames[0].indexOf('.') !== -1) {
    propertyNames = propertyNames[0].split('.');
  }

  let obj = parentObject;

  // "descend" into properties
  for (let i = 0; i < propertyNames.length; i++) {
    obj = obj[propertyNames[i]];
  }

  return obj;
}


/** Returns all properties of an object, including those of its prototypes and not enumerable ones. */
export function getAllProperties(obj: any): string[] | void {
  if (obj == null) return;

  // const prototype = Object.getPrototypeOf(obj);
  const prototypeProperties = getAllProperties(Object.getPrototypeOf(obj));
  if (prototypeProperties != null) {
    return Object.getOwnPropertyNames(obj).concat(prototypeProperties);
  } else {
    return Object.getOwnPropertyNames(obj);
  }
}