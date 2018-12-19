/** Invokes a js function */
export async function invokeJsProcedure(qualifiedProcedureName: string, procedureArgs: any[]) {
  const blackList = ['eval', 'innerHTML'];
  let propertyNames = qualifiedProcedureName.split('.');
  const procedureName: string = propertyNames.pop()!;
  let obj: any = window;

  if (propertyNames[0] === '') {
    // qualifiedName began with a dot, so the first propertyName is an empty string. For the time being, the initial dot is optional. In any case, we drop the first item...
    propertyNames.shift();
  }

  if (propertyNames.length > 0) {
    obj = resolveJSPropertyChain(window, ...propertyNames);
  }

  if (blackList.some(element => procedureName.lastIndexOf(element) > -1)) {
    return Promise.reject('Tried to invoke a blacklisted JS function.');
  } else {
    try {
      return Promise.resolve(obj[procedureName](...procedureArgs));
    } catch (e) {
      console.error(e);
      return Promise.reject('Js procedure invocation failed with message: ' + e.message);
    }
  }
}

/** Asynchronously returns a js property */
export async function getJsProperty(qualifiedPropertyName: string) {
  try {
    return Promise.resolve(getOrSetJSProperty(qualifiedPropertyName));
  } catch (e) {
    console.error(e);
    return Promise.reject(`Couldn't get JS property. ${e.message}`);
  }
}

/** Asynchronously sets a js property and returns its value
 * (unless: race condition...)
 */
export async function setJsProperty(qualifiedPropertyName: string, value: any) {
  try {
    return Promise.resolve(getOrSetJSProperty(qualifiedPropertyName, value));
  } catch (e) {
    console.error(e);
    return Promise.reject(`Couldn't set JS property. ${e.message}`);
  }
}

async function getOrSetJSProperty(qualifiedName: string, value?: any): Promise<any> {
  const blackList = ['eval', 'innerHTML'];
  const propertyNames: string[] = qualifiedName.split('.');
  const lastPropertyName = propertyNames.pop()!;
  let obj: any = window;

  if (propertyNames[0] === '') {
    // qualifiedName began with a dot, so the first propertyName is an empty string. For the time being, the initial dot is optional. In any case, we drop the first item...
    propertyNames.shift();
  }

  if (propertyNames.length > 0) {
    obj = resolveJSPropertyChain(window, ...propertyNames);
  }

  if (blackList.some(element => propertyNames.lastIndexOf(element) > -1)) {
    return Promise.reject('Tried to access a blacklisted JS object.');
  } else {
    if (typeof  value !== 'undefined') {
      obj[lastPropertyName] = value;
    }
    return Promise.resolve(obj[lastPropertyName]);
  }
}

/** Returns a (possibly nested) property of parentObject */
export function resolveJSPropertyChain(parentObject: any, ...propertyNames: string[]): any {

  // if a single propertyName argument is supplied, but it contains dots -> explode it, so the property chain can be properly resolved
  if (propertyNames[0].indexOf('.') !== -1) {
    propertyNames = propertyNames[0].split('.');
  }

  let obj = parentObject;

  // "descend" into properties
  for (let i = 0; i < propertyNames.length; i++) {
    obj = obj[propertyNames[i]];
  }

  return obj;
}


/** Returns all properties of an object, including those of its prototypes and not enumerable ones. */
export function getAllProperties(obj: any): string[] | void {
  if (obj == null) return;

  //const prototype = Object.getPrototypeOf(obj);
  const prototypeProperties = getAllProperties(Object.getPrototypeOf(obj));
  if (prototypeProperties != null) {
    return Object.getOwnPropertyNames(obj).concat(prototypeProperties);
  } else {
    return Object.getOwnPropertyNames(obj);
  }
}