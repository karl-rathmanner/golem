interface Window {
  golem: {
    contextId: number,
    injectedProcedures?: Map<string, Function>,
    interpreter?: import('../schem/schem').Schem, // have to use import() instead of a 'regular' import statement because this is a module in global scope
    priviledgedContext?: {
      contextManager: import('../contextManager').SchemContextManager
    }
  };
}