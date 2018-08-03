export function getHTMLElementById(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (e instanceof HTMLElement) {
    return e;
  } else if (e === null) {
    throw new Error(`Couldn't find HTML Element with id ${id}`);
  } else {
    throw new Error(`${id} is not an HTML Element`);
  }
}