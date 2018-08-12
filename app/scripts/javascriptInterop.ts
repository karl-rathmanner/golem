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