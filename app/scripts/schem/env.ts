import { SchemFunction, SchemNumber, SchemSymbol, SchemType } from './types';

export class Env {
  data: Map<SchemSymbol, SchemType> = new Map<SchemSymbol, SchemType>();

  constructor(public outer?: Env) {
  }

  set(key: SchemSymbol, value: SchemType): SchemType {
    this.data.set(key, value);
    return value;
  }

  addMap(map: any) {
    for (const key in map) {
      if (map.hasOwnProperty(key)) {
        this.set(SchemSymbol.from(key as string), map[key]);
      }
    }
  }

  find(key: SchemSymbol): Env {
    if (this.data.has(key)) {
      return this;
    } else {
      if (this.outer) {
        return this.outer.find(key);
      } else {
        throw `Symbol ${key.name} not found.`;
      }
    }
  }

  get(key: SchemSymbol): SchemType {
    return this.find(key).data.get(key)!;
  }
}

