import { AnySchemType, SchemVector, SchemNil, SchemBoolean, SchemMap, SchemKeyword, SchemFunction, SchemAtom, SchemString } from './schem/types';
import { isSchemNil, isSchemVector, isSchemKeyword, isSchemMap, isSchemString, isSchemList, isSchemAtom, isSchemFunction } from './schem/typeGuards';
import { randomString } from './utils/utilities';
import { EnvSetupMap } from './schem/env';

export const shlukerts: EnvSetupMap = {
    'shluk': {
        f: async (shlukertsVector: SchemVector | SchemNil, e: AnySchemType): Promise<HTMLElement | void> => {
        // [:div {:id "foo"} "I <3 content!"]
        return await createDocumentFragment(shlukertsVector);
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
            `     [:ul [[:li "one"] [:li "two"]]\n` +
            `[:span "Text " atom " more text."]\n` + 
            `  └─ Simple data binding.\n` +
            `     The atom must have a string value.\n` +
            `[atom-with-a-DOM-tree-value]\n` +
            `  └─ Advanced data binding.\n` +
            `     The atom's value must be an HTMLElement.\n` +
            `[atom transformation-function]\n` +
            `  └─ more advanced data binding\n` +
            `     The atom can have any value, but the\n` +
            `     transformation fn must return an HTMLElement.\n`
    },
    'dom->shluk' : {
        f: createShlukertsVector,
        docstring: `Turns an HTML/XML document, subtree or node into a shlukerts vector.`,
        paramstring: `document-or-element`
    },
    'html->shluk' :  {
        f: (str: SchemString) => {
            const dp = new DOMParser();
            return createShlukertsVector(dp.parseFromString(str.toString(), 'text/html'));
        },
        docstring: `Parses an HTLM string and turns the resulting document into a shlukerts vector.`,
        paramstring: `html-string`
    },
    'xml->shluk' :  {
        f: (str: SchemString) => {
            const dp = new DOMParser();
            return createShlukertsVector(dp.parseFromString(str.toString(), 'text/xml'));
        },
        docstring: `Parses an XML string and turns the resulting document into a shlukerts vector.`,
        paramstring: `xml-string`
    },
    'parse-xml' : {
        f: (str: SchemString) => {
            const dp = new DOMParser();
            return dp.parseFromString(str.toString(), 'text/xml');
        },
        docstring: `Uses DOMParser to turn an XML-String into a document object.`,
        paramstring: `xml-string`
    },
    'parse-html' : {
        f: (str: SchemString) => {
            const dp = new DOMParser();
            return dp.parseFromString(str.toString(), 'text/html');
        },
        docstring: `Uses DOMParser to turn an HTML-String into a document object.`,
        paramstring: `xml-string`
    },

};

async function createDocumentFragment(shlukertsVector: SchemVector | SchemNil): Promise<HTMLElement | void> {
    if (isSchemNil(shlukertsVector) || shlukertsVector.count() < 1) {
        return;
    } else {
        const tagOrAtom: SchemKeyword | SchemAtom = shlukertsVector[0] as SchemKeyword | SchemAtom;
        
        if (!isSchemKeyword(tagOrAtom) && !isSchemAtom(tagOrAtom)) {
            throw new Error(`A shlukerts vector's first element must be a tag (denoted by a keyword or string) or an atom.`);
        }

        const bindAtomToElement = (element: HTMLElement, atom: SchemAtom, transformationFuncion?: SchemFunction) => {
            const watchName = 'databinding-watch-' + randomString(16);
            element.setAttribute('golem-atom', watchName); 
            atom.addWatch(SchemKeyword.from(watchName), new SchemFunction(async (...args: any) => {
                let [, , , newValue] = args;

                if (newValue instanceof Promise) {
                    newValue = await newValue;
                }

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

        // e.g. [:div ...]
        if (isSchemKeyword(tagOrAtom)) {

            const attributes = isSchemMap(shlukertsVector[1]) ? shlukertsVector[1] as SchemMap : new SchemMap(); // e.g. [:div {:title "meh"}]
            let body = (isSchemMap(shlukertsVector[1])) ? shlukertsVector.slice(2) : shlukertsVector.slice(1);

            const [wholeMatch, tagName, id, classNames] =  tagOrAtom.name.match(/([^#.]+)(#[^.]*)?(\.[^#]*)?/) || [null, null, null, null];
            // e.g. "div#id.c1.c2" -> 
            //
            // tagName == "div"
            // id == "#id" (optional)
            // classNames == ".c1.c2" (optional)

            if (wholeMatch == null || tagName == null) throw new Error(`Shlukerts vector started with an invalid keyword. (Expected something like ":tag" or ":tag#id.class1.class2..." etc. but got "${tagOrAtom.name}" instead.)`);
            
            const node = document.createElement(tagName);

            if (id != null) {
                attributes.set(SchemKeyword.from('id'), new SchemString(id.slice(1)));
            }

            if (classNames != null) {
                attributes.set(SchemKeyword.from('class'), new SchemString(classNames.slice(1).replace('.', ' ')));
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
                    const childNode = await createDocumentFragment(element);
                    if (childNode != null) {
                        node.appendChild(childNode);
                    }
                }
            });
            return node;
        } else if (isSchemAtom(tagOrAtom)) {
            let value = tagOrAtom.getValue();
            const transformationFuncion: SchemFunction | undefined = shlukertsVector[1];

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

function createShlukertsVector(nodeOrDocument: Element | Document) : SchemVector | SchemNil {
    if (nodeOrDocument == null) return SchemNil.instance;
    const vector = new SchemVector();

    if (!(nodeOrDocument instanceof Document)) {
        vector.push(SchemKeyword.from(nodeOrDocument.nodeName));

        if (nodeOrDocument.hasAttributes()) {
            const attrMap = new SchemMap();
            for (let i = 0; i < nodeOrDocument.attributes.length; i++) {
                attrMap.set(
                    SchemKeyword.from(nodeOrDocument.attributes[i].name),
                    new SchemString(nodeOrDocument.attributes[i].value))
            }
            vector.push(attrMap);
        }
    } else {
        vector.push(SchemKeyword.from('#document'));
    }
    
    const childNodes = nodeOrDocument.childNodes;

    if (childNodes != null) for (const element of nodeOrDocument.childNodes) {
        if (element instanceof Text) {
            vector.push(new SchemString(element.textContent));
        } else if (element instanceof Element) {
            vector.push(createShlukertsVector(element));
        } else {
            throw new Error(`Encountered something in the dom fragement, that was neither an Element nor a text node. Are you sure this is a document or document fragment object?`);
        }
    }

    return vector;
}