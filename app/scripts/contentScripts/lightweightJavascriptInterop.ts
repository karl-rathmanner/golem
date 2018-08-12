import { invokeJsProcedure } from '../javascriptInterop';

// This is intedended for when you just want to call some js procedures with pre-evaluated arguments and you don't need a whole interpreter in your context.
// (just an idea, doesnt work at this point)

(function addLightweightInterop() {
  window.golem.features.push('js-interop');
  if (window.golem.injectedProcedures != null) {
    window.golem.injectedProcedures.set('invoke-js-procedure', invokeJsProcedure);
    console.log('added js-interop!');
  }
})();