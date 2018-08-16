import { SchemNil, SchemString } from "./schem/types";

(function addSchemFunctions() {
  console.log(window.golem.interpreter!.replEnv);
  window.golem.interpreter!.replEnv.addMap({
    'set-css-text': async (selector: SchemString, cssText: SchemString) => {
      const element = document.querySelector<HTMLElement>(selector.valueOf());
      if (element != null) {
        element.style.cssText = cssText.valueOf();
        return SchemNil.instance;
      } else {
        throw new Error(`No object found with selector ${selector.valueOf()}`);
      }
    }
  });

  console.log(window.golem.interpreter!.replEnv);
  window.golem.features.push('dom-manipulation');
})();