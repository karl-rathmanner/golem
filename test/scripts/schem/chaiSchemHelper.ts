// Inform typescript of what we're going to add to chai's Assertion
declare global {
    export namespace Chai {
        interface Assertion {
            /** Asserts that an Object is a SchemType with the specified primitive value */
            hasValueOf(expectedValue: number | string): Assertion;
        }
    }
}

import { SchemBoolean, SchemString } from '../../../app/scripts/schem/types';

export default function (chai: any, utils: any): void {
    const Assertion: Chai.Assertion = chai.Assertion;

    // see: http://www.chaijs.com/api/plugins/#method_addmethod
    utils.addMethod(Assertion.prototype, 'hasValueOf', function (v: number | string) {
        const obj = this._obj;

        // New Assertions throw AssertionErrors if they fail. To allow obj to be either a SchemNumber or a SchemString, the first assertion may fail.
        try {
            new chai.Assertion(obj).to.be.a('number');
        } catch {
            new chai.Assertion(obj).to.be.instanceof(SchemString);
        }

        this.assert(
            obj.valueOf() === v,                          // unwrapping the SchemType's value
            'expected value to be #{exp} but got #{act}', // message used when positive assertion failed
            'expected value to not be #{act}',            // message used when negative assertion failed
            v,                                            // expected value
            obj.valueOf()                                 // actual value
        );
    });
}
