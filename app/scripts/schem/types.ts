import { Env } from './env';
import { Schem } from './schem';
import { Tabs } from 'webextension-polyfill-ts';
import { AvailableSchemContextFeatures } from '../contextManager';
import { isSchemKeyword, isSchemSymbol, isValidKeyType, isString, isNumber, isSchemMap, isSchemType, isSchemList } from './typeGuards';
import { resolveJSPropertyChain, jsObjectToSchemType, schemToJs, invokeJsProcedure, coerceToSchem, coerceToJs } from '../javascriptInterop';

// interfaces
export interface Callable {
    invoke: (...args: AnySchemType[]) => AnySchemType;
}

export interface Indexable {
    nth(index: number): Promise<AnySchemType>;
}

export interface Reducible {
    reduce(callbackfn: (previousValue: any, currentValue: AnySchemType) => any, initialValue?: any): any;
}

export interface Sequable {
    /** returns the first element of the collecton or null */
    first(): AnySchemType | null;
    /** returns a collection containing the second to last elements of the collection - or null if there are no more elements*/
    next(): Sequable | null;
    /** returns a collection containing the second to last elements of the collection - or empty an collection if there are no more elements*/
    rest(): Sequable;
    /** returns a collection beginning with the passed element followed by the rest of this collection */
    cons(element: AnySchemType): Sequable;
}

export interface Countable {
    count: () => number;
}

export interface Metadatable {
    metadata?: SchemMetadata;
    // getMetadata(): SchemMap {}
}

export enum SchemTypes {
    SchemList,
    SchemVector,
    SchemMap,
    SchemSymbol,
    SchemKeyword,
    SchemNil,
    SchemRegExp,
    SchemFunction,
    SchemBoolean,
    SchemAtom,
    SchemLazyVector,
    SchemContextSymbol,
    SchemContextDefinition,
    SchemContextInstance,
    SchemJSReference
}

export interface TaggedType {
    typeTag: SchemTypes;
}

// types

// TODO: figure out how LazyVectors schould be handled

// note: string and number are here for historical reasons - this might change in the future
export type AnySchemType = boolean | number | string | SchemList | SchemVector | SchemMap | SchemSymbol | SchemKeyword | SchemNil |
    SchemRegExp | SchemFunction | SchemAtom | SchemContextSymbol |
    SchemContextDefinition | SchemContextInstance | SchemJSReference;
export type RegularSchemCollection = SchemList | SchemVector | SchemMap;
export type SchemMapKey = number | string | SchemSymbol | SchemKeyword ;


export type SchemMetadata = {
    name?: string,
    docstring?: string,
    parameters?: string[],
    paramstring?: string,
    sourceIndexStart?: number,
    sourceIndexEnd?: number,
    [index: string]: any,
};

// class - Schem Function

export class SchemFunction implements Callable, Metadatable, TaggedType {
    public isMacro = false;
    public typeTag: SchemTypes.SchemFunction = SchemTypes.SchemFunction;


    constructor(public f: Function,
        public metadata?: SchemMetadata,
        public fnContext?: { ast: AnySchemType, params: SchemVector | SchemList, env: Env }) {
            // bind a function's name to itself within its environment
            // this allows recursion even in 'anonymous' functions
        if (fnContext && metadata && metadata.name && metadata.name.length > 0) {
            metadata.parameters = fnContext.params.map((p: SchemSymbol ) => p.name);
            this.fnContext!.env.set(SchemSymbol.from(metadata.name), this);
        }
    }

    static fromSchemWithContext(that: Schem, env: Env, bindings: SchemVector | SchemList, functionBody: AnySchemType, metadata: SchemMetadata): SchemFunction {
        return new SchemFunction(async (...args: Array<any>) => {
            const childEnv = new Env(env);
            childEnv.bind(bindings, new SchemVector(...args));
            return await that.evalSchem(functionBody, childEnv);
        }, metadata, { ast: functionBody, params: bindings, env: env });
    }

    invoke(...args: any[]) {
        return this.f(...args.map(coerceToSchem));
    }
}

// classes - Schem collection types

export class SchemList extends Array<any> implements Reducible, Countable, Indexable, Metadatable, Sequable, TaggedType {
    static isCollection = true;
    public typeTag: SchemTypes.SchemList = SchemTypes.SchemList;
    metadata: SchemMetadata;

    constructor(...args: any[]) {
        // "new Array(...args)" wounldn't work for creating a list with a single number value, so we copy args explicitly.
        // (e.g. new Array(3) would create an empty Array of length three instead of an Array containing the value three.)
        super(args.length);
        for (let i = 0; i < args.length; i++) {
            this[i] = args[i];
        }
    }

    /** Makes sure that all elements of the list are SchemSymbols and returns them in an array.*/
    public asArrayOfSymbols(): SchemSymbol[] {
        return this.map((e) => {
            if (!(isSchemSymbol(e))) throw `List contained an element of type ${e} where only symbols where expected`;
            return e;
        });
    }

    static fromPrimitiveValues(...values: any[]): SchemList {
        return new SchemList(...values.map(v => jsObjectToSchemType(v)));
    }

    async amap(callbackfn: (value: AnySchemType, index: number, array: any[]) => any, thisArg?: any): Promise<any[]> {
        return Promise.all(this.map(callbackfn, thisArg));
    }

    count(): number {
        return this.length;
    }

    nth(index: number) {
        return Promise.resolve(this[index]);
    }

    first(): AnySchemType | null {
        return (this[0] != null) ? this[0] : null;
    }

    next() {
        return (this.length > 1) ? new SchemList(...this.slice(1)) : null;
    }

    rest() {
        return (this.length > 1) ? new SchemList(...this.slice(1)) : new SchemList();
    }

    cons(element: AnySchemType) {
        return new SchemList(element, ...this);
    }


}

export class SchemVector extends Array<any> implements Callable, Indexable, Countable, Metadatable, Sequable, TaggedType {
    public typeTag: SchemTypes.SchemVector = SchemTypes.SchemVector;
    static isCollection = true;
    metadata: SchemMetadata;

    constructor(...args: any[]) {
        // As with the SchemList constructor, "new Array(...args)" wounldn't work for creating a list with a single number value, so we copy args explicitly.
        // (e.g. new Array(3) would create an empty Array of length three instead of an Array containing the value three.)
        super(args.length);
        for (let i = 0; i < args.length; i++) {
            this[i] = args[i];
        }
    }

    static fromPrimitiveValues(...values: any[]): SchemVector {
        return new SchemVector(...values.map(v => jsObjectToSchemType(v)));
    }

    count(): number {
        return this.length;
    }

    public asArrayOfSymbols(): SchemSymbol[] {
        return this.map((e) => {
            if (!(isSchemSymbol(e))) throw `Vector contained an element of type ${e} where only symbols where expected`;
            return e;
        });
    }

    async amap(callbackfn: (value: AnySchemType, index: number, array: any[]) => any, thisArg?: any): Promise<any[]> {
        return Promise.all(this.map(callbackfn, thisArg));
    }

    nth(index: number) {
        return Promise.resolve(this[index]);
    }

    invoke(...args: AnySchemType[]) {
        const firstElement = args[0];
        const index = (isNumber(firstElement)) ? firstElement : NaN;
        if (Number.isInteger(index) && index >= 0 && index < this.length) {
            return this[index];
        }
        throw `index ${index} out of bounds`;
    }

    first(): AnySchemType | null {
        return (this[0] != null) ? this[0] : null;
    }

    next() {
        return (this.length > 1) ? new SchemVector(...this.slice(1)) : null;
    }

    rest() {
        return (this.length > 1) ? new SchemVector(...this.slice(1)) : new SchemVector();
    }

    /** Returns a new Vector with element as the first item, followed by the original items. */
    cons(element: AnySchemType) {
        return new SchemVector(element, ...this);
    }
}

export class SchemMap implements Callable, Reducible, Countable, Metadatable, TaggedType {
    public typeTag: SchemTypes.SchemMap = SchemTypes.SchemMap;
    static isCollection = true;
    metadata: SchemMetadata;

    private nativeMap: Map<string, any> = new Map<string, AnySchemType>();
    /** Returns an array of alternating key value pairs
     * @returns
     * [key: SchemSymbol, value:  SchemType, ...] */
    public flatten(): SchemList {
        return new SchemList(...Array.from(this.nativeMap.keys()).reduce(
            (acc: AnySchemType[], currentKey: string) => {
                acc.push(fromSchemMapKey(currentKey));
                acc.push(this.nativeMap.get(currentKey)!);
                return acc;
            }, []));
    }

    private turnIntoKeyString(key: SchemMapKey): string {
        let keyString: string;
        if (typeof key === 'string') {
            keyString = 's' + key.valueOf();
        } else if (isNumber(key)) {
            keyString = 'n' + key.valueOf();
        } else if (isSchemKeyword(key)) {
            keyString = 'k' + key.name;
        } else if (isSchemSymbol(key)) {
            keyString = 'y' + key.name;
        } else {
            throw `invalid key type ${key}`;
        }
        return keyString;
    }

    set(key: SchemMapKey, value: AnySchemType): void {
        this.nativeMap.set(this.turnIntoKeyString(key), value);
    }

    get(key: SchemMapKey, defaultValue?: AnySchemType): AnySchemType {
        let v = this.nativeMap.get(this.turnIntoKeyString(key));
        if (v) return v;
        if (defaultValue) return defaultValue;
        return SchemNil.instance;
    }

    has(key: SchemMapKey): boolean {
        return this.nativeMap.has(this.turnIntoKeyString(key));
    }

    getValueForSymbol(name: string) {
        return this.get(SchemSymbol.from(name));
    }

    getValueForKeyword(name: string) {
        return this.get(SchemKeyword.from(name));
    }

    /** Returns a new map from the results of passing this map's values through the callback function (keys are not changed)*/
    map(callbackFn: (value: AnySchemType, key?: SchemMapKey) => AnySchemType): SchemMap {
        let newMap = new SchemMap();

        this.nativeMap.forEach((value, key) => {
            newMap.set(fromSchemMapKey(key), callbackFn(value));
        });

        return newMap;
    }

    forEach(callbackFn: (key: SchemMapKey, value: AnySchemType) => void) {
        this.nativeMap.forEach((value: AnySchemType, key: string) => {
            callbackFn(fromSchemMapKey(key), value);
        });
    }

    count(): number {
        return this.nativeMap.size;
    }

    /* TODO: implement amap?
    async amap(callbackFn: (value: SchemType , index: number, arrayOfValues: any[]) => any): Promise<any[]> {
    }*/

    reduce(callbackfn: (previousValue: number, currentValue: AnySchemType) => number, initialValue: number = 0): any {
        return this.flatten().reduce(callbackfn, initialValue);
    }

    invoke(...args: AnySchemType[]) {
        let key = args[0];
        if (isValidKeyType(key)) {
            return this.get(key, args[1]);
        } else {
            throw `type of ${key} is not of a key for maps`;
        }
    }
}
export class SchemLazyVector implements Countable, Indexable, TaggedType {
    public typeTag: SchemTypes.SchemLazyVector = SchemTypes.SchemLazyVector;
    static isCollection = true;

    private cachedValues: Map<number, any>;

    constructor(private producer: SchemFunction, public maximumSize = Infinity) {
        this.cachedValues = new Map<number, any>();
    }

    async nth(index: number): Promise<AnySchemType> {
        if (!this.cachedValues.has(index)) {
            this.cachedValues.set(index,
                await this.producer.invoke(index)
            );
        }
        return this.cachedValues.get(index)!;
    }

    async realizeSubvec(start: number, end: number = this.maximumSize): Promise<SchemVector> {
        if (typeof end === 'undefined' && this.maximumSize === Infinity) {
            throw `can't realize an infinite vector`;
        }
        let realizedContents: AnySchemType[] = new Array<AnySchemType>();
        for (let i = start; i < this.maximumSize && i < end; i++) {
            const value = await this.nth(i);
            realizedContents.push(value);
        }
        return new SchemVector(...realizedContents);
    }

    map(callbackfn: (value: Promise<AnySchemType>, index: number, array: any[]) => any, thisArg?: any): any[] {
        let realizedContents: AnySchemType[] = new Array<AnySchemType>();
        for (let i = 0; i < this.maximumSize; i++) {
            if (thisArg) {
                realizedContents.push(callbackfn.apply(thisArg, [this.nth(i), i, realizedContents]));
            } else {
                const realizedValue = this.nth(i);
                realizedContents[i] = (callbackfn(realizedValue, i, realizedContents));
            }
        }
        return realizedContents;
    }

    count() {
        return this.maximumSize;
    }
}

/// classes - Schem value types

export class SchemNil implements TaggedType {
    public typeTag: SchemTypes.SchemNil = SchemTypes.SchemNil;
    static instance = new SchemNil();
    private constructor() { }
}

export class SchemRegExp extends RegExp implements TaggedType {
    public typeTag: SchemTypes.SchemRegExp = SchemTypes.SchemRegExp;
    toString() {
        if (this.flags.length > 0) {
            return `#"(?${this.flags})${this.source}"`;
        }
        return `#"${this.source}"`;
    }
}

export class SchemJSReference implements TaggedType {
    typeTag: SchemTypes.SchemJSReference = SchemTypes.SchemJSReference;
    public propertyName: string;

    constructor(public readonly parent: any, public readonly propertyChain: string) {
        const properties = propertyChain.split('.');
        if (properties.length > 1) {
            // resolve the property chain
            // ex.: (window, "document.body") => {parent: window.document, propertyName: "body"}
            const allButLast = properties.slice(0, -1);
            this.parent = resolveJSPropertyChain(parent, ...allButLast);
            this.propertyName = properties.slice(-1)[0];
        } else {
            this.propertyName = properties[0];
        }
    }

    get() {
        return this.parent[this.propertyName];
    }

    set(value: any) {
        this.parent[this.propertyName] = value;
    }

    toSchemType() {
        jsObjectToSchemType(this.get());
    }

    typeof() {
        return typeof this.get();
    }

    invoke(...args: any[]) {
        if (args.length > 0) {
            return this.parent[this.propertyName].call(this.parent, ...args.map(coerceToJs));
        } else {
            return this.parent[this.propertyName].call(this.parent);
        }
    }
}

// This implementation is naïve and the symbol registry has no purpose as of yet.
// TODO: check if the overhead is necessary
class SymbolicType {
    static symbolRegistry: Set<string>;

    protected constructor(public name: string) {
    }

    static from(name: string) {
        if (isString(name)) {
            name = name.valueOf();
        }

        this.symbolRegistry.add(name);
        return new SymbolicType(name);
    }

    /** Always returns the plain name of a symbolic type */
    valueOf() {
        return this.name;
    }

    /** Might return something other than just the name in derived classes (such as ":name" for keywords) */
    toString() {
        return this.name;
    }
}

export class SchemSymbol extends SymbolicType implements Metadatable, TaggedType {
    public typeTag: SchemTypes.SchemSymbol = SchemTypes.SchemSymbol;
    metadata: SchemMetadata;

    static refersToJavascriptObject(sym: SchemSymbol): boolean {
        // does it contain at least one dot between two alphanumerical characters?
        return (sym.name.indexOf('.') !== -1 && /\w\.\w/.test(sym.name));
    }

    // static registeredSymbols: Map<symbol, SchemSymbol> = new Map<symbol, SchemSymbol>();

    private constructor(name: string) {
        super(name);
    }

    static from(name: string) {
        if (isString(name)) {
            name = name.valueOf();
        }

        if (name.length === 0) {
            throw new Error(`Zero-length symbols are not allowed.`);
        }

        if (name.length > 1 && /[:/]/.test(name)) {
            throw new Error(`Symbols mustn't contain the characters ':' or '/'. Those are reserved!`);
        }

        return new SchemSymbol(name);
    }
}


export class SchemKeyword extends SymbolicType implements Callable, TaggedType {
    public typeTag: SchemTypes.SchemKeyword = SchemTypes.SchemKeyword;
    static registeredSymbols: Map<symbol, SchemKeyword> = new Map<symbol, SchemKeyword>();

    static from(name: string): SchemKeyword {
        if (isString(name)) {
            name = name.valueOf();
        }

        if (name.length === 0) {
            throw new Error(`Zero-length keywords are not allowed. (':' by itself looks far too lonely)`);
        }

        if (/[:/]/.test(name)) {
            throw new Error(`Keywords' names mustn't contain the characters ':' or '/'. (Yes, keywords begin with ':' but the name is the part after the colon.)`);
        }

        return new SchemKeyword(name);
    }

    /** Returns the name of the keyword prefixed with ":" */
    toString() {
        return ':' + this.name;
    }

    /** Returns the value that is associated with this keyword in the provided collection */
    invoke(...args: AnySchemType[]) {
        if (args.length === 0) {
            throw `Tried to invoke a keywords without passing a collection. Did you accidentally put it in the head position of a form that wasn't supposed to be evaluated?`;
        }
        if (isSchemMap(args[0])) {
            return (args[0] as SchemMap).get(this, args[1]);
        } else {
            throw 'First argument to keyword lookup must be a map';
        }
    }
}

export class SchemContextSymbol extends SymbolicType implements TaggedType {
    public typeTag: SchemTypes.SchemContextSymbol = SchemTypes.SchemContextSymbol;
    static from(name: string): SchemContextSymbol {
        if (isString(name)) {
            name = name.valueOf();
        }

        if (/[:/]/.test(name)) {
            throw new Error(`A context name mustn't contain the characters ':' or '/'. (The name is the part before the colon at the end of a context symbol.)`);
        }

        return new SchemContextSymbol(name);
    }

    /** Returns the name of the context suffixed with ":" */
    toString() {
        return this.name + ':';
    }
}

/** Serializable description of a SchemContext. A definition allows the event page to instatiate and setup a new context that fits the description. Definitions also allow Schem scripts to reason about what a given context might be able to do.
 * In theory.
 */
export class SchemContextDefinition implements TaggedType {
    public typeTag: SchemTypes.SchemContextDefinition = SchemTypes.SchemContextDefinition;
    public lifetime: 'inject-once' | 'persistent';
    frameId?: number;
    features?: AvailableSchemContextFeatures[];
    runAt?: 'document_start' | 'document_end' | 'document_idle';
    parentContext?: Schem;
    init?: AnySchemType;

    constructor(public tabQuery: Tabs.QueryQueryInfoType,
        options: {
            features?: AvailableSchemContextFeatures[],
            'life-time'?: SchemContextDefinition['lifetime'],
            'run-at': SchemContextDefinition['runAt'],
            frameId?: number,
            init?: AnySchemType
        }) {
        // TODO: make DRY
        if (options.features != null) {
            this.features = options.features;
        }
        if (options['life-time'] != null) {
            this.lifetime = options['life-time']!;
        }
        if (options['run-at'] != null) {
            this.runAt = options['run-at'];
        }
        if (options.frameId != null) {
            this.frameId = options.frameId;
        }
    }

    static fromSchemMap(initializationMap: SchemMap, parentContext?: Schem): SchemContextDefinition {
        const jso = schemToJs(initializationMap);
        if (jso.tabQuery != null) {
            const scd = new SchemContextDefinition(jso.tabQuery, jso);

            if (parentContext != null) {
                scd.parentContext = parentContext;
                const initForm = initializationMap.get(SchemKeyword.from('init'));
                if (isSchemType(initForm)) {
                    scd.init = initForm;
                }
            }
            return scd;
        }

        throw new Error(`missing value for :tabQuery`);
    }

    static fromDirtyParsedJSONObject(obj: SchemContextDefinition) {
        // Ugh! TODO: Rethink serialization.
        // This is mostly necessary to strip the Schem type tags.
        return new SchemContextDefinition(obj.tabQuery, {
            features: obj.features,
            'life-time': obj.lifetime,
            'run-at': obj.runAt,
            frameId: obj.frameId,
            init: obj.init
        });
    }
}

/** Refers to a concrete context. (Effectively the same as SchemContextDefinition but with ids.)*/
export class SchemContextInstance implements TaggedType {
    public typeTag: SchemTypes.SchemContextInstance = SchemTypes.SchemContextInstance;
    baseContentScriptIsLoaded: boolean = false;
    activeFeatures: Set<SchemContextDefinition['features']>;

    // TODO: add properties describing the context's capabilities - available procedures, atoms, hasInterpreter etc.
    constructor(public id: number, public tabId: number, public windowId: number, public definition: SchemContextDefinition, public frameId?: number) {
    }

    static fromStringified(serialized: string) {
        const obj = JSON.parse(serialized) as SchemContextInstance;
        return new SchemContextInstance(obj.id, obj.tabId, obj.windowId, SchemContextDefinition.fromDirtyParsedJSONObject(obj.definition), obj.frameId);
    }


}

/// classes - other Schem types

export class SchemAtom implements TaggedType {
    public typeTag: SchemTypes.SchemAtom = SchemTypes.SchemAtom;
    private watches: [SchemKeyword, SchemFunction][] = [];

    constructor(private value: AnySchemType) {
    }

    /** Returns the atom's value */
    getValue() {
        return this.value;
    }

    /** Sets the atom's value, calling any existing watches in the order they were added.*/
    setValue(v: AnySchemType) {
        this.watches.forEach(watch => {
            // A watch function is invoked just like in clojure.
            // It is expected to have a signature like (fn [key atom old-value new-value] ...)
            // The parameters being: the watches' "key", the atom itself, its old value, its new value
            watch[1].invoke(watch[0], this, this.value, v);
        });
        return this.value = v;
    }

    private findWatchIndex(key: SchemKeyword): number {
        return this.watches.findIndex((watch) => {
            return watch[0].name === key.name;
        });
    }

    /** Adds a watch function (or overrides an existing watch that has the same key)*/
    addWatch(key: SchemKeyword, f: SchemFunction) {
        const index = this.findWatchIndex(key);
        if (index === -1) {
            this.watches.push([key, f]);
        } else {
            this.watches[index] = [key, f];
        }
    }

    /** Removes a watch function if one matching the key is found. */
    removeWatch(key: SchemKeyword) {
        const index = this.findWatchIndex(key);
        if (index > -1) {
            this.watches.splice(index, 1);
        } else {
            throw new Error(`A watch named ${key} was already added to this atom.`);
        }
    }
}

// type conversion
export function toSchemMapKey(key: SchemMapKey): string {
    if (isString(key)) {
        return 's' + key.valueOf();
    } else if (isNumber(key)) {
        return 'n' + key.valueOf();
    } else if (isSchemKeyword(key)) {
        return 'k' + key.name;
    } else if (isSchemSymbol(key)) {
        return 'y' + key.name;
    } else {
        throw `invalid key type ${key}`;
    }
}

export function fromSchemMapKey(key: string): SchemMapKey {
    const stringifiedValue = key.slice(1);
    switch (key[0]) {
        case 's': return stringifiedValue;
        case 'n': return parseFloat(stringifiedValue);
        case 'k': return SchemKeyword.from(stringifiedValue);
        case 'y': return SchemSymbol.from(stringifiedValue);
    }
    throw `key "${key}" starts with unknown type prefix`;
}

export function getMetadata(o: any) {
    if (isSchemType(o) && Object.prototype.hasOwnProperty.call(o, 'metadata')) {
        return (o as any).metadata;
    } else {
        return undefined;
    }
}

export function getTypeTag(o: any) {
    if (isSchemType(o) && Object.prototype.hasOwnProperty.call(o, 'typeTag')) {
        return (o as any).typeTag;
    } else {
        return undefined;
    }
}