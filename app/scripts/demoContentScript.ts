(function addSomeDemoProcedures() {
  window.golem.injectedProcedures.set('alert', (msg: string) => alert(msg));
  window.golem.injectedProcedures.set('set-text-content', (querySelector: string, content: string) => {
    const element = document.querySelector<Element>(querySelector);
    if (element !== null) {
      element.textContent = content;
    }
  });
  window.golem.injectedProcedures.set('set-css-text', (selector: string, cssText: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element !== null) {
    element.style.cssText = cssText;
    }
  });
})();