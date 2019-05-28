import { AnySchemType, SchemVector, SchemNil, SchemBoolean, SchemMap, SchemKeyword, SchemFunction } from './schem/types';
import { isSchemNil, isSchemVector, isSchemKeyword, isSchemMap, isSchemString, isSchemList, isSchemAtom } from './schem/typeGuards';
import { randomString } from './utils/utilities';

export const shlukerts: { [symbol: string]: any } = {
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
        let body = (attributes == null) ? input.slice(1) : input.slice(2);

        if (!isSchemKeyword(tag)) {
            throw new Error(`A shlukerts vector's first element must be a tag (denoted by a keyword or string)`);
        }

        // expand lists into the body, turning [:ul (list [:li "ah"] [:li "oh"])] into [:ul [:li "ah"] [:li "oh"]]
        body = body.reduce((body: AnySchemType[], element): AnySchemType[] => {
            if (isSchemList(element)) {
                body.push(...element);
            } else {
                body.push(element);
            }
            return body;
        }, []);

        const node = document.createElement(tag.name);

        if (attributes != null) attributes.forEach((key, value) => {
            const attributeName = isSchemKeyword(key) ? key.name : key.getStringRepresentation();
            node.setAttribute(attributeName, value.toString());
        });
        body.forEach(element => {
            if (isSchemString(element)) {
                node.appendChild(document.createTextNode(element.valueOf()));
            } else if (isSchemAtom(element)) {
                const atomValue = element.getValue();

                if (isSchemString(atomValue)) {
                    const watchName = 'databinding-watch-' + randomString(16);
                    const newSpan = document.createElement('span');
                    newSpan.setAttribute('golem-atom', watchName);
                    newSpan.textContent = atomValue.valueOf();
                    node.appendChild(newSpan);
                    element.addWatch(SchemKeyword.from(watchName), new SchemFunction((...args: any) => {
                        const [, , , newValue] = args;
                        const atomSpan = document.querySelector(`[golem-atom=${watchName}]`);
                        console.log(watchName, newValue);
                        if (atomSpan != null && isSchemString(newValue)) {
                            atomSpan.textContent = newValue.valueOf();
                        } else {
                            throw new Error('As of now, only atoms with string values are supported by shlukerts.');
                        }
                    }));
                } else {
                    throw new Error('As of now, only atoms with string values are supported by shlukerts.');
                }
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