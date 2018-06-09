
import { Schem } from '../../../app/scripts/schem/schem';
import { expect } from 'chai';
import { EnvSetupMap } from '../../../app/scripts/schem/env';
import { SchemNil, SchemType, SchemFunction } from '../../../app/scripts/schem/types';
import { pr_str } from '../../../app/scripts/schem/printer';

/** These shouldn't be reused during unit test, unless you explicitly want to retain the interpreter's state between tests. (Calling expectRep with an array of inputs does that, for instance) */
class TestInterpreter extends Schem {
  println_buffer = '';

  /** Creates a new Schem instance suitable for testing */
  constructor() {
    super();

     // override (println x), exposes its output via println_buffer
    this.replEnv.set('println', new SchemFunction((...args: SchemType[]) => {
        this.println_buffer += (args.map((element) => {
          return pr_str(element, false);
        }).join(' '));
        return SchemNil.instance;
      }));
  }

  // overwrite this method, so evaluation is never delayed during testing
  async nextStep() {
      await true; // resolves immediately
  }
}

/**
* Describe a test case using a Schem expression and its expected output. If expected is an array, it has to
* have the same length as input (counting 1 for a simple string). Optionally a description can be provided to make the
* test case more informative.
* @param {string | string[]} input
* @param {string | string[]} expected
* @param {string} description
*/
let expectSchem = (input: string | string[], expected: string | string[], description: string = '') => {
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

  const ti = new TestInterpreter();
  it(description!, async function () {
    for (let i = 0; i < inputArray.length; i++) {
      let result = await ti.arep(inputArray[i]);
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

  expectSchem('true', 'true');

  expectSchem('(list 1 2 3 4 5)', '(1 2 3 4 5)');

  expectSchem('(vector 1 2 3 4 5)', '[1 2 3 4 5]');

  expectSchem('(+ 1 2)', '3');

  expectSchem(['(def! x 2)', '(+ 1 x)'] , ['2', '3'], 'define a variable and use it in a following function');

  expectSchem('(eval (list * 7 6))', '42', `(eval) should be able to execute an abstract syntax tree`);

  expectSchem('(eval (read-string "((fn* [x] (* x x)) 4)"))', '16', `(eval) should be able to execute an abstract syntax tree returned by (read-string)`);


  // Here, the first expression returns a SchemNumber, the second returns a SchemString.
  // Notice, that the typescript string itself has to be escaped. Schem actually "sees" (read-string "\"42\"") in example nr. 2
  expectSchem(['(read-string "42")', '(read-string "\\"42\\"")'], ['42', '"42"'], `read-string should be able to handle escaped strings`);


  expectSchem('(let* (a 24) (do (def! a 42) [a]))', '[42]', `the elements of a vectors should be evaluated in the current context`);

  expectSchem('(read-string "(1 2 (+ 3 4) nil)")', '(1 2 (+ 3 4) nil)');

  expectSchem('(eval (read-string "(* 7 6)"))', '42');

  expectSchem(['[(def! isZero (fn* (n) (= n 0)))]', '(isZero 0)', '(isZero 1)'], 'false', `functions shouldn't have their environment polluted by previously bound values` );

  // contrived println_buffer example
  it(`it's possible to define and call a cube function`, async function () {
    const ti = new TestInterpreter();
    return ti.arep('(let* (qube (fn* (x) (+ x x x))) (println (str (qube 1) " " (qube 2) " " (qube 3))))').then((result) => {
      expect(result).to.be.equal('nil');
      expect(ti.println_buffer).to.equal('3 6 9');
    });
  });

  expectSchem([`
    (def! sum (fn* (n acc)
      (if (= n 0)
        acc
        (sum (- n 1) (+ n acc)
      )
    )))
  `, '(sum 4242 0)'] , '8999403', 'recursive function calls in tail position should not cause stack overflow');

  // MAYDO: mock $.get so this is possible?
  // expectRep('(load-url "/chaiTest.schem")', 'MEEP!');

// add more tests here :)

});
