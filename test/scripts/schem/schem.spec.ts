import { rep } from '../../../app/scripts/schem/schem';
import { expect } from 'chai';
import { EnvSetupMap } from '../../../app/scripts/schem/env';
import { SchemNil, SchemType } from '../../../app/scripts/schem/types';
import { pr_str } from '../../../app/scripts/schem/printer';

/**
 * Describe a test case using repl lines (input) and testing the output (expected). If expected is an array, it has to
 * have the same length as input (counting 1 for a simple string). Optionally a description can be provided to make the
 * test case more informative.
 * @param {string | string[]} input
 * @param {string | string[]} expected
 * @param {string} description
 */
let describeRep = (input: string | string[], expected: string | string[], description?: string) => {
  let inputs = (typeof input === 'string') ? [input] : input;
  if (typeof expected !== 'string' && inputs.length !== expected.length) {
    throw Error(`length of the inputs (${inputs.length}) should math the expected one (${expected.length})`);
  }
  it(description ? `${description}` : `"${inputs.join('; ')}" should evaluate to "${(typeof expected !== 'string') ? expected.join('; ') : expected}"`, function () {
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
  before(() => {
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

  describeRep('(+ 1 2)', '3');

  describeRep('(list 1 2 3 4 5)', '(1 2 3 4 5)');

  describeRep('(vector 1 2 3 4 5)', '[1 2 3 4 5]');

  describeRep(['(def! x 2)', '(+ x 1)'] , ['2', '3'], 'define a variable and use it in a following function');

  describeRep([`
      (def! sum (fn* (n acc)
        (if (= n 0)
          acc
          (sum (- n 1) (+ n acc)
      ))))
    `, '(sum 4242 0)'] , '8999403', 'recursive function calls in tail position should not cause stack overflow');

  // add more tests here :)

});
