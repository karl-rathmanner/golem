import { readStr } from './schem/reader';
import { SchemList, SchemNil, SchemString, SchemType } from './schem/types';
import { jsObjectToSchemType } from './schem/schem';
import { isSchemFunction } from './schem/typeGuards';

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
    'add-listener': async (eventName: SchemString, selector: SchemString, astOrCode: SchemType | string) => {
      const elements = document.querySelectorAll<HTMLElement>(selector.valueOf());
      console.log(astOrCode);
      // const code = await pr_str(ast);
      for (let i = 0; i < elements.length; i++) {
        elements.item(i).addEventListener(eventName.valueOf(),
          (e) => {

            if (typeof astOrCode.valueOf() === 'string' ) {
              astOrCode = readStr((astOrCode.valueOf()) as string);
            }

            if (isSchemFunction(astOrCode)) {
              const newForm = new SchemList(astOrCode, e);
              // eval only for the side effects
              window.golem.interpreter!.evalSchem(newForm);
            } else {
              window.golem.interpreter!.evalSchem(astOrCode);
            }
          }
        );

      }
    }
  });

  console.log(window.golem.interpreter!.replEnv);
  window.golem.features.push('dom-manipulation');
})();