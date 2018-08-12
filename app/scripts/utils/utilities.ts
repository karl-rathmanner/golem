/** Returns true if all properties in needle are present and equal in object. (Supports needles with nested properties.) */
export function objectPatternMatch(object: any, needle: any) {
  const needleProperties = Object.getOwnPropertyNames(needle);

  const invertedMatch = needleProperties.findIndex(needleProperty => {
    // return true for the first mismatch between pattern and object
    if (!(needleProperty in object)) {
      return true;
    }
    const objectPropertyValue = (object as any)[needleProperty];
    const needlePropertyValue = (needle as any)[needleProperty];

    if (typeof objectPropertyValue === 'object') {
      return this.objectPatternMatch(objectPropertyValue, needlePropertyValue);
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