import { SchemNil, SchemString, SchemType, SchemList } from './schem/types';
import { pr_str } from './schem/printer';

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
    },
    'add-listener': async (eventName: SchemString, selector: SchemString, ast: SchemType) => {
      const elements = document.querySelectorAll<HTMLElement>(selector.valueOf());
      console.log(ast);
      // const code = await pr_str(ast);
      for (let i = 0; i < elements.length; i++) {
        elements.item(i).addEventListener(eventName.valueOf(), () => window.golem.interpreter!.evalSchem(ast));
      }
    }
  });

  console.log(window.golem.interpreter!.replEnv);
  window.golem.features.push('dom-manipulation');
})();