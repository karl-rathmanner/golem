
import { Schem } from '../../../app/scripts/schem/schem';
import { expect } from 'chai';
import { EnvSetupMap } from '../../../app/scripts/schem/env';
import { SchemNil, SchemType } from '../../../app/scripts/schem/types';
import { pr_str } from '../../../app/scripts/schem/printer';
let interpreter = new Schem();

// mock function, so evaluation is never delayed during testing
interpreter.nextStep = async function() {
  await true; // resolves immediately
};


/**
* Describe a test case using a Schem expression and its expected output. If expected is an array, it has to
* have the same length as input (counting 1 for a simple string). Optionally a description can be provided to make the
* test case more informative.
* @param {string | string[]} input
* @param {string | string[]} expected
* @param {string} description
*/
let expectRep = (input: string | string[], expected: string | string[], description: string = '') => {
  let inputArray = (typeof input === 'string') ? [input] : input;
  if (typeof expected !== 'string' && inputArray.length !== expected.length) {
    throw Error(`length of the inputs (${inputArray.length}) should math the expected one (${expected.length})`);
  }

  if (description === '') {
    if (expected instanceof Array) {
      let multilineDescription: string[] = [];
      expected.forEach((e, index: number) => {
        multilineDescription.push(`${inputArray[index]} => ${expected[index]}`);
      });
      description = multilineDescription.join('; ');
    } else if (input instanceof Array) {
      description = `${inputArray.join('; ')}; should finally evaluate to => ${expected}`;
    } else {
      description = `${input} => ${expected}`;
    }
  }

  it(description!, async function () {
    for (let i = 0; i < inputArray.length; i++) {
      let result = await interpreter.arep(inputArray[i]);
      // Expect every input to lead to the expected result
      if (expected instanceof Array) {
        expect(result).to.be.equal(expected[i]);
      // If expected was passed as a string, only check the last result
      } else if (i === inputArray.length - 1) {
        expect(result).to.be.equal(expected);
      }
    }
  });
};

describe('blackbox tests', function() {
  // prn override, exposes values in prn_buffer instead of printing it to the browser console
  before(function () {
    let prn_buffer = '';
    const envOverwrites: EnvSetupMap = {
      'prn': (...args: SchemType[]) => {
        prn_buffer += (args.map((element) => {
          return pr_str(element, true);
        }).join(' '));
        return SchemNil.instance;
      },
    };
  });


  it('"true" should evaluate to "true"', function() {
    return interpreter.arep('true').then((result) => {
      expect(result).to.be.equal('true');
    });
  });

  expectRep('(+ 1 2)', '3');

  expectRep('(list 1 2 3 4 5)', '(1 2 3 4 5)');

  expectRep('(vector 1 2 3 4 5)', '[1 2 3 4 5]');

  expectRep(['(def! x 2)', '(+ x 1)'] , ['2', '3'], 'define a variable and use it in a following function');

  /*
  expectRep([`
    (def! sum (fn* (n acc)
      (if (= n 0)
        acc
        (sum (- n 1) (+ n acc)
      )
    )))
  `, '(sum 4242 0)'] , '8999403', 'recursive function calls in tail position should not cause stack overflow');
*/
  expectRep(['(read-string "42")', '(read-string "\\"42\\"")'], ['42', '"42"']);

  expectRep('(read-string "((fn* [x] (* x x)) 4)")', '((fn* [x] (* x x)) 4)');

  expectRep('(eval (read-string "((fn* [x] (* x x)) 4)"))', '16');

  expectRep(['(def! a 42)', '[a]'], '[42]');

  expectRep('(read-string "(1 2 (+ 3 4) nil)")', '(1 2 (+ 3 4) nil)');

  expectRep('(eval (read-string "(* 7 6)"))', '42');

  expectRep(['[(def! isZero (fn* (n) (= n 0)))], (isZero 0), (isZero 1)'], 'false');

  // expectRep('(load-url "/chaiTest.schem")', "MEEP!");

// add more tests here :)

});
