import { rep } from '../../../app/scripts/schem/schem';
import { expect } from 'chai';
import { EnvSetupMap } from '../../../app/scripts/schem/env';
import { SchemType, SchemNil } from '../../../app/scripts/schem/types';
import { pr_str } from '../../../app/scripts/schem/printer';

describe('basic Schem operations', function() {
  // prn override, exposes values in prn_buffer instead of printig it to the browser console
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
  it('"(+ 1 2)" should evaluate to "3"', function() {
    expect(rep('(+ 1 2)')).to.be.equal('3');
  });

  before(() => {
    rep(`
      (def! sum (fn* (n acc)
        (if (= n 0)
          acc
          (sum (- n 1) (+ n acc)
      ))))
    `);
  });

  it('recursive function calls in tail position should not cause stack overflow', () => {
    expect(rep('(sum 4242 0)')).to.be.equal('8999403');
  });


});
