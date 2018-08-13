/** Invokes a js function */
export async function invokeJsProcedure(qualifiedProcedureName: string, procedureArgs: any[]) {
  const blackList = ['eval', 'innerHTML'];
  const namespaces: string[] = qualifiedProcedureName.split('.');
  const procedureName: string = namespaces.pop()!;
  let parentObjectForProcedure: any = window;

  // "descend" into namespaces
  for (let i = 0; i < namespaces.length; i++) {
    parentObjectForProcedure = parentObjectForProcedure[namespaces[i]];
  }

  if (blackList.some(element => procedureName.lastIndexOf(element) > -1)) {
    return Promise.reject('Tried to invoke a blacklisted JS function.');
  } else {
    try {
      return Promise.resolve(parentObjectForProcedure[procedureName](...procedureArgs));
    } catch (e) {
      return Promise.reject('Js procedure invocation failed with message: ' + JSON.stringify(e));
    }
  }
}

export async function getJsProperty(qualifiedPropertyName: string) {
  try {
    return Promise.resolve(getOrSetJSObject(qualifiedPropertyName));
  } catch (e) {
    return Promise.reject(`Couldn't access JS object. ${JSON.stringify(e)}`);
  }
}

export async function setJsProperty(qualifiedPropertyName: string, value: any) {
  try {
    return Promise.resolve(getOrSetJSObject(qualifiedPropertyName, value));
  } catch (e) {
    return Promise.reject(`Couldn't access JS object. ${JSON.stringify(e)}`);
  }
}


async function getOrSetJSObject(qualifiedName: string, value?: any): Promise<any> {
  const blackList = ['eval', 'innerHTML'];
  const namespaces: string[] = qualifiedName.split('.');
  const propertyName: string = namespaces.pop()!;
  let parentObject: any = window;

  // "descend" into namespaces
  for (let i = 0; i < namespaces.length; i++) {
    parentObject = parentObject[namespaces[i]];
  }

  if (blackList.some(element => propertyName.lastIndexOf(element) > -1)) {
    return Promise.reject('Tried to access a blacklisted JS object.');
  } else {
    if (typeof value !== 'undefined') {
      parentObject[propertyName] = value;
    }
    return Promise.resolve(parentObject[propertyName]);
  }
}