export type ContextMessage = {
  action: 'invoke-context-procedure' | 'invoke-js-procedure' | 'set-js-property' | 'arep',
  args: any
};