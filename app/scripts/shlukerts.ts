import { AnySchemType, SchemVector, SchemNil, SchemBoolean, SchemMap } from './schem/types';
import { isSchemNil, isSchemVector, isSchemKeyword, isSchemMap, isSchemString } from './schem/typeGuards';

export const shlukerts: {[symbol: string]: any} = {
  'shluk': (input: SchemVector | SchemNil, e: AnySchemType): HTMLElement | void => {
    // [:div {:id "foo"} "I <3 content!"]
    return createHTMLElement(input);
    // todo: automatic :p for text node vectors?
  }
};


function createHTMLElement(input: SchemVector | SchemNil): HTMLElement | void {
  if (isSchemNil(input) || input.count() < 1) {
    return;
  } else {
    const tag = input[0];
    const attributes = isSchemMap(input[1]) ? input[1] as SchemMap : null;
    const content = (attributes == null) ? input.slice(1) : input.slice(2);

    if (isSchemKeyword(tag)) {
      const node = document.createElement(tag.name);

      if (attributes != null) attributes.forEach((key, value) => {
        const attributeName = isSchemKeyword(key) ? key.name : key.getStringRepresentation();
        node.setAttribute(attributeName, value.toString()); 
      });
      
      content.forEach( element => {
        if (isSchemString(element)) {
          node.appendChild(document.createTextNode(element.valueOf()));
        } else if (isSchemVector(element)) {
          const childNode = createHTMLElement(element);
          if (childNode != null) {
            node.appendChild(childNode);
          }
        }
      });
      return node;
    }
  }
}