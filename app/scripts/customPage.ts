import { Schem } from "./schem/schem";
import { VirtualFileSystem } from "./virtualFilesystem";
import { shlukerts } from './shlukerts';
import { domManipulationSchemFunctions } from './domManipulationSchemFunctions';

window.onload = () => {
  const interpreter = new Schem();
  interpreter.replEnv.addMap(shlukerts);
  interpreter.replEnv.addMap(domManipulationSchemFunctions);

  const qualifiedFileName = window.location.hash
  // if the url contains a hash property, load a schem script from the vfs and evaluate it
  if (qualifiedFileName != null && qualifiedFileName.length > 0) {
    const qualifiedFileName = window.location.hash.slice(1);
    VirtualFileSystem.readObject(qualifiedFileName).then(startupScript => {
      if (typeof startupScript === 'string' && startupScript.length > 0) {
        interpreter.arep(`(do ${startupScript})`);
      }
    }).catch((e) => console.error(e));
  }
};