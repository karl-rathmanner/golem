import { coreFunctions } from '../../../app/scripts/schem/core';
import { expect } from 'chai';
import {
  SchemBoolean,
  SchemList,
  SchemMap,
  SchemNil,
  SchemNumber,
  SchemString,
  SchemVector
} from '../../../app/scripts/schem/types';

const getCoreFunction: Function = (symbol: string) => {
  let fn = coreFunctions[symbol];
  if (typeof fn !== 'function') {
    throw Error(`"${symbol}" is not a function.`);
  }
  return fn;
};

describe('core operations', function() {
  describe('op: "+"', function() {
    it('with two numbers', function () {
      let res = getCoreFunction('+')(new SchemNumber(1), new SchemNumber(2));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(3));
    });

    it('with more than two numbers', function () {
      let res = getCoreFunction('+')(new SchemNumber(3), new SchemNumber(1), new SchemNumber(2));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(6));
    });

    it('with negative numbers', function () {
      let res = getCoreFunction('+')(new SchemNumber(-3), new SchemNumber(1), new SchemNumber(-2));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(-4));
    });
  });

  describe('op: "-"', function() {
    it('with two numbers', function () {
      let res = getCoreFunction('-')(new SchemNumber(1), new SchemNumber(2));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(-1));
    });

    it('with more than two numbers', function () {
      let res = getCoreFunction('-')(new SchemNumber(3), new SchemNumber(1), new SchemNumber(2));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(0));
    });

    it('with negative numbers', function () {
      let res = getCoreFunction('+')(new SchemNumber(-3), new SchemNumber(1), new SchemNumber(-2));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(-2));
    });
  });

  describe('op: "count"', function() {
    it('counting a list', function () {
      let res = getCoreFunction('count')(new SchemList(1, 2, 3, 4, 5));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(5));
    });
    it('counting a vector', function () {
      let res = getCoreFunction('count')(new SchemVector(0, 1, 2, 3, 4, 5));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(6));
    });
    it('counting a non-list/vector returns 0', function () {
      expect(getCoreFunction('count')(new SchemNumber(123))).is.instanceof(SchemNumber).and.contain(new SchemNumber(0));
      expect(getCoreFunction('count')(new SchemString('x'))).is.instanceof(SchemNumber).and.contain(new SchemNumber(0));
      expect(getCoreFunction('count')(new SchemBoolean(true))).is.instanceof(SchemNumber).and.contain(new SchemNumber(0));
      expect(getCoreFunction('count')(SchemNil.instance)).is.instanceof(SchemNumber).and.contain(new SchemNumber(0));
    });
  });

  describe('op: "get"', function() {
    it('get value from map', function () {
      let map = new SchemMap();
      map.set(new SchemString('x'), new SchemNumber(2));
      let res = getCoreFunction('get')(map, new SchemString('x'));
      expect(res).is.instanceof(SchemNumber).and.contain(new SchemNumber(2));
    });
    it('allow keys with differnt types', function () {
      let map = new SchemMap();
      map.set(new SchemString('1'), new SchemNumber(1));
      map.set(new SchemNumber(1), new SchemNumber(2));

      expect(getCoreFunction('get')(map, new SchemString('1'))).is.instanceof(SchemNumber).and.contain(new SchemNumber(1));
      expect(getCoreFunction('get')(map, new SchemNumber(1))).is.instanceof(SchemNumber).and.contain(new SchemNumber(2));
    });
  });
});
