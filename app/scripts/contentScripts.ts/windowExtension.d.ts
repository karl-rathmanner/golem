interface Window {
  golem: {
    contextId: number,
    injectedProcedures: Map<string, Function>,
    hasInterpreterInstance: boolean
  };
}