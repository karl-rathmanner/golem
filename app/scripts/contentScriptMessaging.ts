export type GolemContextMessage = {
    action: 'has-base-content-script' | 'has-context-with-id' | 'get-context-instance' | 'has-feature' | 'invoke-context-procedure' | 'invoke-js-procedure' | 'set-js-property' | 'arep',
    args?: any
};