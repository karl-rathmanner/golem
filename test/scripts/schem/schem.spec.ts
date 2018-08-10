
import { Schem } from '../../../app/scripts/schem/schem';
import { expect } from 'chai';
import { SchemNil, SchemType, SchemFunction } from '../../../app/scripts/schem/types';
import { pr_str } from '../../../app/scripts/schem/printer';

/** These shouldn't be reused during unit test, unless you explicitly want to retain the interpreter's state between tests. (Calling expectRep with an array of inputs does that, for instance) */
class TestInterpreter extends Schem {
  println_buffer = '';

  /** Creates a new Schem instance suitable for testing */
  constructor() {
    super();

     // override (println x), exposes its output via println_buffer
    this.replEnv.set('println', new SchemFunction(async (...args: SchemType[]) => {
        this.println_buffer += (await Promise.all(args.map((element) => {
          return pr_str(element, false);
        }))).join(' ');
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

  expectSchem('(< 1 2 3 3.1)', 'true');
  expectSchem('(< 1 2 3 1.3)', 'false');
  expectSchem('(>= 42 42 24)', 'true');
  expectSchem('(<= 1 1 2 3 3)', 'true');

  expectSchem(['(def x 2)', '(+ 1 x)'] , ['2', '3'], 'define a variable and use it in a following function');

  expectSchem('(not true)', 'false', 'core.schem is loaded correctly');

  expectSchem('(eval (list * 7 1 (list + 2 4))))', '42', `(eval) should be able to execute an abstract syntax tree`);

  // Here, the first expression returns a SchemNumber, the second returns a SchemString.
  // Notice, that the typescript string itself has to be escaped. Schem actually "sees" (read-string "\"42\"") in example nr. 2
  expectSchem(['(read-string "42")', '(read-string "\\"42\\"")'], ['42', '"42"'], `read-string should be able to handle escaped strings`);

  expectSchem('(eval (read-string "((fn [x] (* x x)) 4)"))', '16', `(read-string) should return an eval'able abstract syntax tree`);

  expectSchem('(let (a 24) (do (def a 42) [a]))', '[42]', `the elements of a vectors should be evaluated in the current context`);

  expectSchem('(read-string "(1 2 (+ 3 4) nil)")', '(1 2 (+ 3 4) nil)');

  expectSchem(['[(def isZero (fn (n) (= n 0)))]', '(isZero 0)', '(isZero 1)'], 'false', `functions shouldn't have their environment polluted by values previously supplied as arguments` );

  // contrived println_buffer example
  it(`it's possible to define and call a cube function`, async function () {
    const ti = new TestInterpreter();
    return ti.arep('(let (qube (fn (x) (+ x x x))) (println (str (qube 1) " " (qube 2) " " (qube 3))))').then((result) => {
      expect(result).to.be.equal('nil');
      expect(ti.println_buffer).to.equal('3 6 9');
    });
  });

  expectSchem(['(defn variadic (a b & c) (list a b c))', '(variadic 1 2 3 4 5)'], '(1 2 (3 4 5))');

  expectSchem([`
    (def sum (fn (n acc)
      (if (= n 0)
        acc
        (sum (- n 1) (+ n acc)
      )
    )))
  `, '(sum 4242 0)'] , '8999403', 'recursive function calls in tail position should not cause stack overflow');

  expectSchem('(cons 1 (list 2 3))', '(1 2 3)');
  expectSchem('(cons 1 ())', '(1)');
  expectSchem('(cons (list 1 2) (list 3 4))', '((1 2) 3 4)');
  expectSchem('(cons 1 () (list 2))', '(1)');

  expectSchem('(concat 1 2 3)', '(1 2 3)');
  expectSchem('(concat (list 1) (list 2 3) 4 5))', '(1 2 3 4 5)');

  // quote
  expectSchem(['(def x 1)', '(quote x)'], 'x');
  expectSchem('(quote (+ 1 2))', '(+ 1 2)');
  expectSchem('(quote (+ 1 (+ 2 3)))', '(+ 1 (+ 2 3))');

  // quasiquote
  expectSchem('(quasiquote 1)', '1');
  expectSchem('(quasiquote (1))', '(1)');
  expectSchem('(let (a 4 b 5) (quasiquote (1 2 (+ 3) a b)))', '(1 2 (+ 3) a b)', 'quasiquote acts like quote unless you unquote stuff.');
  expectSchem('(let (a 4 b 5) (quasiquote (1 2 (unquote (+ 3)) (splice-unquote (list a b)) 6)))', '(1 2 3 4 5 6)', 'unquote and splice-unquote seem to work.');
  expectSchem('(let (a 4 b 5) `(1 2 ~(+ 3) ~@[a b] 6))', '(1 2 3 4 5 6)', 'reader macros for quasiquote, unquote and splice-unquote seem to work. (`,~,~@)');
  expectSchem(`'(+ 1 (+ 2 3))`, '(+ 1 (+ 2 3))', `reader macro for quote works (')`);


  // Quine taken from: https://github.com/kanaka/mal/blob/master/tests/step7_quote.mal
  expectSchem('((fn [q] (quasiquote ((unquote q) (quote (unquote q))))) (quote (fn [q] (quasiquote ((unquote q) (quote (unquote q)))))))',
              '((fn [q] (quasiquote ((unquote q) (quote (unquote q))))) (quote (fn [q] (quasiquote ((unquote q) (quote (unquote q)))))))',
              'A quine should return a quine should return a quine...');

  // Quoting vectors
  expectSchem('(let (a ":" b ")") (str `[a b]))', '"(a b)"');
  expectSchem(`(let (a ":" b ")") (str '[a b]))`, '"[a b]"');
  expectSchem('(let (a ":" b ")") (str [a b]))', '"[: )]"');

  // Macros
  // from: https://github.com/kanaka/mal/blob/master/tests/step8_macros.mal
  expectSchem(['(defmacro unless (fn (pred a b) `(if ~pred ~b ~a)))', '(unless true 1 2)'], '2');
  expectSchem(['(defmacro unless (fn (pred a b) `(if ~pred ~b ~a)))', '(macroexpand (unless true 1 2))'], '(if true 2 1)');
  expectSchem(['(defmacro identity (fn (x) x))', '(let (a 123) (identity a))'], '123');

  const testMacro = `(defmacro executePostfix (fn (l) (cons (last l) (butlast l))))`;

  expectSchem([testMacro, '(executePostfix [1 2 +])'], '3');
  expectSchem([testMacro, '(executePostfix (1 2 +))'], '3');

  expectSchem([testMacro, '(executePostfix (1 2 3 +))'],
              '6', 'Macros receive arguments as unevaluated data.');

  expectSchem([testMacro, '(def five 5)',
              '(executePostfix (7 (+ 1 five) *))'],
              '42', 'Macros receive arguments as unevaluated data.');

  expectSchem([testMacro, '(def five 5)',
              '(macroexpand (executePostfix (7 (+ 1 five) *)))'],
              '(* 7 (+ 1 five))', 'Macros receive arguments as unevaluated data and expanding them works as expected.');

  expectSchem(`(let [add1 (fn (x) (+ x 1))]
                    (map add1 [1 2 3]))`,
              '(2 3 4)');

  expectSchem('(map + [1 2 3] [4 5 6] [7 8 9 10])', '(12 15 18)');
  expectSchem('(map list `(a b c) [1 2 3] `(x y z q))', '((a 1 x) (b 2 y) (c 3 z))');

  expectSchem('(map score-string-similarity ["ab" "ab" "ab" "ab" "ab" "ab"] ["xabx" "abx" "axb" "bxa" "ab" "xbabx"])', '(3 5 4 0 5 3)');
  expectSchem('(sort-and-filter-by-string-similarity "abc" ["axbxc" "abxc" "abc" "abx" "ab" "xbabxbcx"])', '("abc" "abxc" "axbxc" "xbabxbcx")');

  // Invoking callable values
  expectSchem('({:a 42 :b 13} :a)', '42');
  expectSchem('({:a "meh" :b "bleh"} :c "default")', '"default"');
  expectSchem('(:inner ({:outer {:inner 42}} :outer))', '42');
  expectSchem('([:a :b :c] 2)', ':c');

  // thread first macro
  expectSchem(`(-> {:six 6} :six (* 3 2.3333333333333333) (#(str "It's " %1 "!"))))`, `"It's 42!"`, 'Thread first macro supports unary, n-ary and anonymous functions');
  expectSchem(`(macroexpand (-> {:six 6} :six (* 7) (#(str "It's " %1 "!"))))`,
              `((fn (%1) (str "It's " %1 "!")) (* (:six {:six 6}) 7))`,
              '(-> convoluted example) expands into (even less readable code)');

  // Lazy Vectors
  expectSchem('(lazy-vector (fn (x) (* x x)) 7)', '[0 1 4 9 16 25 36]');

  // fn shorthand
  expectSchem('(#(list %3 [%5 [%4]] (list %1 {:first % :rest %&}) ) 1 2 3 4 5 6 7)', '(3 [5 [4]] (1 {:first 1 :rest (6 7)}))',
              `The reader macro #() expands correctly, finding placeholders in nested collections, treating "%" and "%1" as interchangeable, it doesn't care about the order in which placeholders occur or if some are omitted`);

  // MAYDO: mock $.get so this is possible?
  // expectRep('(load-url "/chaiTest.schem")', 'MEEP!');

});
