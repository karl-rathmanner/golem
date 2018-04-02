import { rep } from '../../../app/scripts/schem/schem';
import { expect } from 'chai';

describe('basic Schem operations', function() {
  it('"true" should evaluate to "true"', function() {
    expect(rep('true')).to.be.equal('true');
  });
  it('"(+ 1 2)" should evaluate to "3"', function() {
    expect(rep('(+ 1 2)')).to.be.equal('3');
  });
});
