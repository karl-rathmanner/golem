import { AnySchemType, SchemVector, SchemNil, SchemBoolean, SchemMap, SchemKeyword, SchemFunction, SchemAtom } from './schem/types';
import { isSchemNil, isSchemVector, isSchemKeyword, isSchemMap, isSchemString, isSchemList, isSchemAtom, isSchemFunction } from './schem/typeGuards';
import { randomString } from './utils/utilities';
import { EnvSetupMap } from './schem/env';

export const shlukerts: EnvSetupMap = {
    'shluk': {
        f: async (input: SchemVector | SchemNil, e: AnySchemType): Promise<HTMLElement | void> => {
        // [:div {:id "foo"} "I <3 content!"]
        return await createHTMLElement(input);
        },
        paramstring: "shlukerts-vector",
        docstring: 
            `Shluk takes vectors and transforms them into a\n` +
            `DOM tree based on a bunch of underdocumented rules.\n` +
            `Have some examples instead:\n\n` +
            `[:h1 {:class "myStyle"} "Some text."]\n` +
            `  └─ Creates an h1 element with attributes.\n` +
            `[:ul (list [:li "one"] [:li "two])]\n` + 
            `  └─ Lists are expanded, this turns into:\n` +
             `    [:ul [[:li "one"] [:li "two"]]\n` +
            `[:span "Text " atom " more text."]\n` + 
            `  └─ Simple data binding.\n` +
            `     The atom must have a string value.\n` +
            `[atom-with-a-DOM-tree-value]\n` +
            `  └─ Advanced data binding.\n` +
            `     The atom's value must be an HTMLElement.\n` +
            `[atom transformation-function]\n` +
            `  └─ more advanced data binding\n` +
            `     Atom can have any value, but the\n` +
            `     Transformation fn must return an HTMLElement\n`
    }
};

async function createHTMLElement(input: SchemVector | SchemNil): Promise<HTMLElement | void> {
    if (isSchemNil(input) || input.count() < 1) {
        return;
    } else {
        const tagOrAtom: SchemKeyword | SchemAtom = input[0] as SchemKeyword | SchemAtom;
        
        if (!isSchemKeyword(tagOrAtom) && !isSchemAtom(tagOrAtom)) {
            throw new Error(`A shlukerts vector's first element must be a tag (denoted by a keyword or string) or an atom.`);
        }

        const bindAtomToElement = (element: HTMLElement, atom: SchemAtom, transformationFuncion?: SchemFunction) => {
            const watchName = 'databinding-watch-' + randomString(16);
            element.setAttribute('golem-atom', watchName); 
            atom.addWatch(SchemKeyword.from(watchName), new SchemFunction(async (...args: any) => {
                let [, , , newValue] = args;

                if (transformationFuncion != null) {
                    newValue = await transformationFuncion.f(newValue);
                }
                const atomElement = document.querySelector(`[golem-atom=${watchName}]`);

                if (atomElement == null) {
                    throw new Error(`A data-bound atom's value was changed, but the dom node it was bound to seems to have been deleted.`);
                }

                if (isSchemString(newValue)) {
                    atomElement.textContent = newValue.valueOf();
                } else if (newValue instanceof HTMLElement) {
                    newValue.setAttribute('golem-atom', watchName); 
                    const p = atomElement.parentElement;
                    p!.replaceChild(newValue, atomElement);
                } else {
                    throw new Error('As of now, only atoms with string or HTMLElement values can be data-bound.');
                }
            }));
            return element;
        }

        if (isSchemKeyword(tagOrAtom)) {
            const attributes = isSchemMap(input[1]) ? input[1] as SchemMap : null;
            let body = (attributes == null) ? input.slice(1) : input.slice(2);
    
            // expand lists into the body, turning [:ul (list [:li "ah"] [:li "oh"])] into [:ul [:li "ah"] [:li "oh"]]
            body = body.reduce((body: AnySchemType[], element): AnySchemType[] => {
                if (isSchemList(element)) {
                    body.push(...element);
                } else {
                    body.push(element);
                }
                return body;
            }, []);

            const node = document.createElement(tagOrAtom.name);
            if (attributes != null) attributes.forEach((key, value) => {
                const attributeName = isSchemKeyword(key) ? key.name : key.getStringRepresentation();
                node.setAttribute(attributeName, value.toString());
            });
            body.forEach(async element => {
                if (isSchemString(element)) {
                    node.appendChild(document.createTextNode(element.valueOf()));
                } else if (isSchemAtom(element)) {

                    let atomValue = element.getValue();
                    if (isSchemString(atomValue)) {
                        const newSpan = bindAtomToElement(document.createElement('span'), element);
                        newSpan.textContent = atomValue.valueOf();
                        node.appendChild(newSpan);
                    } else {
                        throw new Error('As of now, only atoms with string values are supported by shlukerts.');
                    }
                } else if (isSchemVector(element)) {
                    const childNode = await createHTMLElement(element);
                    if (childNode != null) {
                        node.appendChild(childNode);
                    }
                }
            });
            return node;
        } else if (isSchemAtom(tagOrAtom)) {
            let value = tagOrAtom.getValue();
            const transformationFuncion: SchemFunction | undefined = input[1];

            if (isSchemFunction(transformationFuncion)) {
                // TODO: use evalSchem instead
                value = await transformationFuncion.f(value);
            }

            if (value instanceof HTMLElement) {
                const node = value;
                bindAtomToElement(node, tagOrAtom, transformationFuncion);
                return node;
            } else {
                throw new Error(`If a shlukerts vektor starts with an Atom, that Atom's value must resolve to an HTML element.`);
            }
        }
    }
}