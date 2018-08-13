import { invokeJsProcedure, getJsProperty, setJsProperty } from './javascriptInterop';

// This is intedended for when you just want to call some js procedures with pre-evaluated arguments and you don't need a whole interpreter in your context.
// (just an idea, doesnt work at this point)

(function addLightweightInterop() {
  window.golem.features.push('lightweight-js-interop');
  if (window.golem.injectedProcedures != null) {
    window.golem.injectedProcedures.set('invoke-js-procedure', invokeJsProcedure);
    window.golem.injectedProcedures.set('get-js-property', invokeJsProcedure);
    window.golem.injectedProcedures.set('set-js-property', setJsProperty);
    console.log('injected lightweight js-interop feature');
  }
})();