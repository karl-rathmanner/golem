/** Returns true if all properties in needle are present and equal in object. (Supports needles with nested properties.) */
export function objectPatternMatch(object: any, needle: any) {
    const needleProperties = Object.getOwnPropertyNames(needle);

    const invertedMatch = needleProperties.findIndex(needleProperty => {
        // return true for the first *mismatch* between pattern and object
        if (!(needleProperty in object)) {
            return true;
        }
        const objectPropertyValue = (object as any)[needleProperty];
        const needlePropertyValue = (needle as any)[needleProperty];

        if (typeof objectPropertyValue === 'object') {
            return (!this.objectPatternMatch(objectPropertyValue, needlePropertyValue));
        } else if (typeof objectPropertyValue === 'function') {
            throw new Error(`can't compare functions`);
        } else {
            // compare properties with primitive values
            return (objectPropertyValue !== needlePropertyValue);
        }
    });

    // return true if *none* of the properties were *unequal*
    return (invertedMatch === -1);
}

/** Tries to return a string containing the error message of ill defined error objects. TODO: fix the cause instead of treating the symptom */
export function extractErrorMessage(error: any) {
    return (typeof error === 'string') ? error :  // I still throw many plain strings as errors. This band-aid 'fixes' that.
        ('error' in error) ? error.error :     // I also throw whatever that is. Somewhere. This clearly calls for more band-aids.
            ('message' in error) ? error.message : // This is what an error is supposed to look like...
                `Unknown error type thrown. Try checking the browser's console for more information !`; // ...but if it doesn't, at least tell the user.
}

/** Surrounds a string with some sensible number of parens, trying to turn it into an s-expression. */
export function addParensAsNecessary(s: string) {
    // add one opening paren at the beginning if there isn't one already
    s = (/^\(/.test(s) ? '' : '(') + s;
    // adds as least as many closing ones as necessary* to the end
    // *(number of '(' minus number of ')', but not less than zero)
    s += ')'.repeat(Math.max(0, (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length));
    return s;
}

/** Escapes xml entities in a string*/
export const escapeXml = (s: string) => {
    // credit: https://stackoverflow.com/a/35802512
    let holder = document.createElement('div');
    holder.textContent = s;
    return holder.innerHTML;
};

/** Returns a string containing random uppercase characters. */
export function randomString(length: number) {
    let rndstr = '';
    for (let index = 0; index < length; index++) {
        rndstr += String.fromCharCode(65 + Math.random() * 24);
    }

    return rndstr;
}