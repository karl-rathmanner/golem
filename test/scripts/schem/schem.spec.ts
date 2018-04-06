import { rep } from '../../../app/scripts/schem/schem';
import { expect } from 'chai';
import { EnvSetupMap } from '../../../app/scripts/schem/env';
import { SchemNil, SchemType } from '../../../app/scripts/schem/types';
import { pr_str } from '../../../app/scripts/schem/printer';

/**
* Describe a test case using a Schem expression and its expected output. If expected is an array, it has to
* have the same length as input (counting 1 for a simple string). Optionally a description can be provided to make the
* test case more informative.
* @param {string | string[]} input
* @param {string | string[]} expected
* @param {string} description
*/
let expectRep = (input: string | string[], expected: string | string[], description: string = '') => {
  let inputs = (typeof input === 'string') ? [input] : input;
  if (typeof expected !== 'string' && inputs.length !== expected.length) {
    throw Error(`length of the inputs (${inputs.length}) should math the expected one (${expected.length})`);
  }

  if (description === '') {
    if (expected instanceof Array) {
      let multilineDescription: string[] = [];
      expected.forEach((e, index: number) => {
        multilineDescription.push(`${input[index]} => ${expected[index]}`);
      });
      description = multilineDescription.join('; ');
    } else if (input instanceof Array) {
      description = `${input.join('; ')}; should finally evaluate to => ${expected}`;
    } else {
      description = `${input} => ${expected}`;
    }
  }

  it(description!, function () {
    let output;
    inputs.forEach((it, index) => {
      output = rep(it);
      if (typeof expected !== 'string') {
        expect(output).to.be.equal(expected[index]);
      }
    });
    if (typeof expected === 'string') {
      expect(output).to.be.equal(expected);
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
    expect(rep('true')).to.be.equal('true');
  });

  expectRep('(+ 1 2)', '3');

  expectRep('(list 1 2 3 4 5)', '(1 2 3 4 5)');

  expectRep('(vector 1 2 3 4 5)', '[1 2 3 4 5]');

  expectRep(['(def! x 2)', '(+ x 1)'] , ['2', '3'], 'define a variable and use it in a following function');

  expectRep([`
    (def! sum (fn* (n acc)
      (if (= n 0)
        acc
        (sum (- n 1) (+ n acc)
      )
    )))
  `, '(sum 4242 0)'] , '8999403', 'recursive function calls in tail position should not cause stack overflow');

  expectRep(['(read-string "42")', '(read-string "\\"42\\"")'], ['42', '"42"']);

  expectRep('(read-string "((fn* [x] (* x x)) 4)")', '((fn* [x] (* x x)) 4)');

  expectRep(['(def! a 42)', '[a]'], '[42]');

// add more tests here :)

});
