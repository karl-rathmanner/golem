import { coreFunctions } from '../../../app/scripts/schem/core';
import { expect, use } from 'chai';
import { SchemBoolean, SchemList, SchemMap, SchemNil, SchemNumber, SchemString, SchemVector, SchemKeyword, SchemSymbol, AnySchemType } from '../../../app/scripts/schem/types';
import schemHelpers from './chaiSchemHelper';
// Adds Schem specific assertions to chai
use(schemHelpers);

function getCoreFunction(symbol: string): Function {
    let fn = coreFunctions[symbol];
    if (typeof fn !== 'function') {
        throw Error(`"${symbol}" is not a function.`);
    }
    return fn;
}

describe('core operators', function () {
    console.log(schemHelpers);

    describe('(= x y &) - equality', function () {
        it('always true with a single argument', function () {
            expect(getCoreFunction('=')(new SchemNumber(1))).equals(SchemBoolean.true);
            expect(SchemBoolean.true).equals(SchemBoolean.true);
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
            expect(getCoreFunction('=')(SchemSymbol.from('a'), SchemSymbol.from('a'), SchemKeyword.from('a'))).equals(SchemBoolean.false);
        });

        it('true for collections with same length and content, regardless of type', function () {
            expect(getCoreFunction('=')(SchemList.fromPrimitiveValues(1, 2, 3, 4, 5), SchemVector.fromPrimitiveValues(1, 2, 3, 4, 5))).equals(SchemBoolean.true);
            expect(getCoreFunction('=')(new SchemVector(new SchemNumber(42), new SchemString('42'), SchemKeyword.from('42')),
                new SchemList(new SchemNumber(42), new SchemString('42'), SchemKeyword.from('42'))));
            expect(getCoreFunction('=')(SchemList.fromPrimitiveValues(1, 2, 3, 4), SchemVector.fromPrimitiveValues(1, 2, 3, 4))).equals(SchemBoolean.true);
        });

        it('false for lists with different length or content', function () {
            expect(getCoreFunction('=')(SchemList.fromPrimitiveValues(1, 2, 3, 4, 5), SchemList.fromPrimitiveValues(1, 2, 3, 4))).equals(SchemBoolean.false);
            expect(getCoreFunction('=')(SchemVector.fromPrimitiveValues(1, 2, 3, 4), SchemVector.fromPrimitiveValues(4, 2, 4, 2))).equals(SchemBoolean.false);
            expect(getCoreFunction('=')(SchemVector.fromPrimitiveValues(1, 2, 3, 4), SchemList.fromPrimitiveValues(42, 23, 42, 23))).equals(SchemBoolean.false);
        });
    });

    describe('(+) (+ x) (+ x y) (+ x y & more)', function () {
        it('(+) returns 0', function () {
            expect(getCoreFunction('+')()).hasValueOf(0);
        });

        it('(+ x) returns x', function () {
            expect(getCoreFunction('+')(new SchemNumber(-42))).hasValueOf(-42);
        });

        it('adds two numbers', function () {
            let res = getCoreFunction('+')(new SchemNumber(1), new SchemNumber(2));
            expect(res).hasValueOf(3);
        });

        it('adds multiple numbers', function () {
            let res = getCoreFunction('+')(new SchemNumber(1), new SchemNumber(42), new SchemNumber(-3), new SchemNumber(-39), new SchemNumber(-1));
            expect(res).hasValueOf(0);
        });
    });

    describe('op: "-"', function () {
        it('with two numbers', function () {
            let res = getCoreFunction('-')(new SchemNumber(1), new SchemNumber(2));
            expect(res).hasValueOf(-1);
        });

        it('with more than two numbers', function () {
            let res = getCoreFunction('-')(new SchemNumber(3), new SchemNumber(1), new SchemNumber(2));
            expect(res).hasValueOf(0);
        });

        it('with negative numbers', function () {
            let res = getCoreFunction('-')(new SchemNumber(-3), new SchemNumber(1), new SchemNumber(-2));
            expect(res).hasValueOf(-2);
        });
    });

    describe('(count x)', function () {
        it('counting a list', function () {
            let res = getCoreFunction('count')(SchemList.fromPrimitiveValues(1, 2, 3, 4, 5));
            expect(res).hasValueOf(5);
        });
        it('counting a vector', function () {
            let res = getCoreFunction('count')(SchemVector.fromPrimitiveValues(0, 1, 2, 3, 4, 5));
            expect(res).hasValueOf(6);
        });
        it('counting a nil returns 0', function () {
            expect(getCoreFunction('count')(SchemNil.instance)).hasValueOf(0);
        });
    });
});

describe('map functions', function () {
    describe('(get x)', function () {
        it('returns value from map', function () {
            let map = new SchemMap();
            map.set(new SchemString('x'), new SchemNumber(2));
            let res = getCoreFunction('get')(map, new SchemString('x'));
            expect(res).hasValueOf(2);
        });
        it('allows keys with differnt types', function () {
            let map = new SchemMap();
            map.set(new SchemString('1'), new SchemNumber(1));
            map.set(new SchemNumber(1), new SchemNumber(2));

            expect(getCoreFunction('get')(map, new SchemString('1'))).hasValueOf(1);
            expect(getCoreFunction('get')(map, new SchemNumber(1))).hasValueOf(2);
        });
    });
});