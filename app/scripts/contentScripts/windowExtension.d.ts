interface Window {
    // disclaimer: I have to use import() instead of a 'regular' import statement because this is a module in global scope
    golem: {
        contextId: number,
        contextInstance?: import('../schem/types').SchemContextInstance,
        features: import('../contextManager').AvailableSchemContextFeatures[],
        injectedProcedures?: Map<string, Function>,
        interpreter?: import('../schem/schem').Schem,
        priviledgedContext?: {
            globalState: import('../GlobalGolemState').GlobalGolemState,
            globalFunctions: import('../GlobalGolemFunctions').GlobalGolemFunctions
        }
    };
}