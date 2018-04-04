import { coreFunctions } from '../../../app/scripts/schem/core';
import { expect } from 'chai';
import { SchemBoolean, SchemList, SchemMap, SchemNil, SchemNumber, SchemString, SchemVector, SchemKeyword, SchemSymbol } from '../../../app/scripts/schem/types';

const getCoreFunction: Function = (symbol: string) => {
  let fn = coreFunctions[symbol];
  if (typeof fn !== 'function') {
    throw Error(`"${symbol}" is not a function.`);
  }
  return fn;
};

describe('core operators', function() {
  describe('(= x y &) - equality', function() {
    it('always true with a single argument', function () {
      expect( getCoreFunction('=')(new SchemNumber(1)) ).equals(SchemBoolean.true);
      expect(getCoreFunction('=')(SchemNil.instance)).equals(SchemBoolean.true);
      expect(getCoreFunction('=')(new SchemString('meep'))).equals(SchemBoolean.true);
    });

    it('true when two values and types are equal', function () {
      expect(getCoreFunction('=')(new SchemNumber(1), new SchemNumber(1))).equals(SchemBoolean.true);
      expect(getCoreFunction('=')(new SchemString('meep'), new SchemString('meep'))).equals(SchemBoolean.true);
      expect(getCoreFunction('=')(SchemKeyword.from('k'), SchemKeyword.from('k'))).equals(SchemBoolean.true);
    });
    
    it('false for two different values or types', function () {
      expect(getCoreFunction('=')(new SchemNumber(1), new SchemNumber(2))).equals(SchemBoolean.false);
      expect(getCoreFunction('=')(SchemKeyword.from('a'), SchemKeyword.from('b'))).equals(SchemBoolean.false);
      expect(getCoreFunction('=')(SchemKeyword.from('a'), SchemSymbol.from('a'))).equals(SchemBoolean.false);
    });

    
    it('true when all of more than two values and types are the same', function () {
      expect(getCoreFunction('=')(new SchemNumber(1), new SchemNumber(1), new SchemNumber(1))).equals(SchemBoolean.true);
      expect(getCoreFunction('=')(SchemBoolean.false, SchemBoolean.false, SchemBoolean.false, SchemBoolean.false)).equals(SchemBoolean.true);
    });
    
    it('false if any one of more than two values or types is different', function () {
      expect(getCoreFunction('=')(new SchemNumber(1), new SchemNumber(1), new SchemNumber(2))).equals(SchemBoolean.false);
      expect(getCoreFunction('=')(new SchemString('a'), new SchemString('b'), new SchemString('a'))).equals(SchemBoolean.false);
      expect(getCoreFunction('=')(SchemSymbol.from('a'), SchemSymbol.from('a'),SchemKeyword.from('a'))).equals(SchemBoolean.false);
    });

    it('true for lists with same length, type and content', function (){
      expect(getCoreFunction('=')(new SchemList(1, 2, 3, 4, 5), new SchemList(1, 2, 3, 4, 5))).equals(SchemBoolean.true);
      expect(getCoreFunction('=')(new SchemVector(42, '42', SchemKeyword.from('42')), new SchemVector(42, '42', SchemKeyword.from('42')))).equals(SchemBoolean.true);
    });

    it('false for lists with different length, type, or content', function (){
      expect(getCoreFunction('=')(new SchemList(1, 2, 3, 4, 5), new SchemList(1, 2, 3, 4))).equals(SchemBoolean.false);
      expect(getCoreFunction('=')(new SchemList(1, 2, 3, 4), new SchemVector(1, 2, 3, 4))).equals(SchemBoolean.false);
      expect(getCoreFunction('=')(new SchemVector(1, 2, 3, 4), new SchemVector(4, 2, 4, 2))).equals(SchemBoolean.false);
    });
  });
  
  
  
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
      expect(getCoreFunction('count')(SchemBoolean.true)).is.instanceof(SchemNumber).and.contain(new SchemNumber(0));
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
