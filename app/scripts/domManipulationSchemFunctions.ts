import { readStr } from './schem/reader';
import { SchemList, SchemNil, SchemString, AnySchemType } from './schem/types';
import { jsObjectToSchemType } from './schem/schem';
import { isSchemFunction } from './schem/typeGuards';

(function addSchemFunctions() {
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
    'add-listener': async (eventName: SchemString, selector: SchemString, astOrCode: AnySchemType | string) => {
      let ast: AnySchemType;
      if (typeof astOrCode === 'string' ) {
        ast = readStr((astOrCode.valueOf()) as string);
      } else {
        ast = astOrCode;
      }
      const elements = document.querySelectorAll<HTMLElement>(selector.valueOf());
      // const code = await pr_str(ast);
      for (let i = 0; i < elements.length; i++) {
        elements.item(i).addEventListener(eventName.valueOf(),
          (e) => {

            if (isSchemFunction(astOrCode)) {
              // TODO: add some 'wrapped js object' Schem Type, that could be used here instead of converting e
              const newForm = new SchemList(astOrCode, jsObjectToSchemType(e));
              // eval only for the side effects
              window.golem.interpreter!.evalSchem(newForm);
            } else {
              window.golem.interpreter!.evalSchem(ast);
            }
          }
        );

      }
    }
  });
  window.golem.features.push('dom-manipulation');
})();