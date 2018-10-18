import { AnySchemType, SchemVector, SchemList, SchemMap, SchemNumber, SchemContextSymbol, SchemNil, SchemString, SchemRegExp, SchemFunction, SchemBoolean, SchemAtom, SchemLazyVector, SchemSymbol, SchemKeyword, Callable, SchemMapKey, Sequable, SchemTypes, RegularSchemCollection } from './types';
//
export function isSequential(object: AnySchemType): object is SchemList | SchemVector {
  return (object instanceof SchemList ||  isSchemVector(object));
}

export function isSchemType(o: any): o is AnySchemType {
  return (isSchemList(o) ||
          isSchemVector(o) ||
          isSchemMap(o) ||
          isSchemNumber(o) ||
          isSchemSymbol(o) ||
          isSchemContextSymbol(o) ||
          isSchemKeyword(o) ||
          isSchemNil(o) ||
          isSchemString(o) ||
          isSchemRegExp(o) ||
          isSchemFunction(o) ||
          isSchemBoolean(o) ||
          isSchemLazyVector(o) ||
          isSchemAtom(o));
}

export function isSchemCollection(o: any): o is RegularSchemCollection {
  return (o instanceof SchemList ||
           isSchemVector(o) ||
           isSchemMap(o) ||
           isSchemLazyVector(o));
}

// custom type guards seem to be necessary since typeof fails when moving across contexts (e.g. via getBackgroundPage)
// TODO: review if there really is no way to do this in a more generic way...

export function isSchemFunction(o: any): o is SchemFunction {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemFunction);
}

export function isSchemList(o: any): o is SchemList {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemList);
}

export function isSchemSymbol(o: any): o is SchemSymbol {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemSymbol);
}

export function isSchemKeyword(o: any): o is SchemKeyword {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemKeyword);
}

export function isSchemVector(o: any): o is SchemVector {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemVector);
}

export function isSchemMap(o: any): o is SchemMap {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemMap);
}


export function isSchemContextSymbol(o: any): o is SchemContextSymbol {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemContextSymbol);
}

export function isSchemNumber(o: any): o is SchemNumber {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemNumber);
}

export function isSchemString(o: any): o is SchemString {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemString);
}

export function isSchemRegExp(o: any): o is SchemRegExp {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemRegExp);
}

export function isSchemBoolean(o: any): o is SchemBoolean {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemBoolean);
}

export function isSchemAtom(o: any): o is SchemAtom {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemAtom);
}

export function isSchemLazyVector(o: any): o is SchemLazyVector {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemLazyVector);
}


export function isSchemNil(o: any): o is SchemNil {
  return (typeof o === 'object' && 'typeTag' in o && o.typeTag === SchemTypes.SchemNil);
}

export function isCallable(o: any): o is Callable {
  return (typeof o === 'object' && typeof o.invoke === 'function');
}

export function isValidKeyType(o: any): o is SchemMapKey {
  return (isSchemKeyword(o) ||
           isSchemNumber(o) ||
           isSchemString(o));
}

export function isSequable(o: any): o is Sequable {
  return (typeof o === 'object' &&
          typeof o.first === 'function' &&
          typeof o.next === 'function' &&
          typeof o.rest === 'function' &&
          typeof o.cons === 'function');
}
