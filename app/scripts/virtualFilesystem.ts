import { browser } from '../../node_modules/webextension-polyfill-ts';


type VFSObjectKeysNode = {
  objects: {[name: string]: string};
  folders: {[name: string]: VFSObjectKeysNode};
};

/** The Virtual File System makes it possible to create, read, update, and delete objects in the browser's local storage, in a hierachical, file-system-like way.
 * The VFS keeps track of directory and object names using a tree. Each tree node represents a folder. Each folder can contain multiple objects or child folders.
 * Oualified object names (like "exampleFolder/subFolder/objectName") can be resolved to a key that is radomly generated during object creation.
 * It's these keys that map to the objects' value in the browser's 'flat' local storage.
*/
export class VirtualFileSystem {

  public static async writeObject(qualifiedObjectName: string, value: any, overwriteExistingObject = false) {
    return this.crudObject('create', qualifiedObjectName, value, overwriteExistingObject);
  }

  public static async readObject(qualifiedObjectName: string) {
    return this.crudObject('read', qualifiedObjectName);
  }

  public static async updateObject(qualifiedObjectName: string, value: any) {
    return this.crudObject('update', qualifiedObjectName, value);
  }

  public static async removeObject(qualifiedObjectName: string) {
    return this.crudObject('delete', qualifiedObjectName);
  }

  public static async existsOject(qualifiedObjectName: string) {
    return this.crudObject('read', qualifiedObjectName).then(() => true).catch(() => false);
  }

  public static async clearStorage() {
    return browser.storage.local.clear();
  }

  public static async getVFSTree() {
    return browser.storage.local.get({virtualFileSystemKeyTree: {}}).then(async results => {
      const objectKeyTree = results.virtualFileSystemKeyTree as VFSObjectKeysNode;
      return (objectKeyTree);
    });
  }

  /*
  public static listDirectoryContents() {
    return browser.storage.local.get({virtualFileSystemKeyTree: {}}).then(async results => {
      const objectKeyTree = results.virtualFileSystemKeyTree as VFSObjectKeyTree;
    });
  }*/

  // private methods

  private static async crudObject(action: 'create' | 'update' | 'read' | 'delete', qualifiedObjectName: string, value?: any, overwriteExistingObject?: boolean): Promise<any> {
    // TODO: extract the tree traversal code and write a less overloaded method?
    if (qualifiedObjectName[0] === '/') qualifiedObjectName = qualifiedObjectName.slice(1); // drop leading slash silently (those would lead to a zero-length token)
    let fqnTokens: string[] = qualifiedObjectName.split('/');
    const objectName = fqnTokens.pop();
    let pathTokens = fqnTokens;

    if (typeof objectName !== 'string' || objectName.length === 0) {
      throw new Error(`Invalid or empty object name.`);
    }

    return await browser.storage.local.get({virtualFileSystemKeyTree: {}}).then(async results => {
      let objectKeyNode = results.virtualFileSystemKeyTree as VFSObjectKeysNode;

      // create an empty root node if necessary
      if (objectKeyNode == null || objectKeyNode.objects == null || objectKeyNode.folders == null) {
        console.warn('Virtual file system tree was deleted or corrupted, setting up empty one.');
        browser.storage.local.set({virtualFileSystemKeyTree: {}});
        objectKeyNode = {objects: {}, folders: {}};
      }

      // for each 'part' of the path, descend into the corresponding child folder
      let currentFolder = objectKeyNode;
      while (pathTokens.length > 0) {
        const childFolderName = pathTokens.shift();
        if (childFolderName!.length === 0) {
          throw new Error(`Folder names can't be empty.`);
        }
        if (childFolderName != null && currentFolder.folders[childFolderName] != null) {
          currentFolder = currentFolder.folders[childFolderName];
        } else {

          if (action === 'create') {
            currentFolder.folders[childFolderName!] = {objects: {}, folders: {}};
            currentFolder = currentFolder.folders[childFolderName!];
          } else {
            throw new Error(`Couldn't find key for file "${qualifiedObjectName}". Folder ${childFolderName} doesn't exist.`);
          }
        }
      }

      // crud an object
      if (action === 'create') {
        if (value === null || typeof value === 'undefined') {
          throw new Error(`Value mustn't be empty when creating objects.`);
        }

        // is there already an object with this name?
        if (currentFolder.objects[objectName] != null) {
          if (overwriteExistingObject === true) {
            return this.crudObject('update', qualifiedObjectName, value);
          }
          throw new Error(`Creating ${qualifiedObjectName} failed because an object with that name already exists. (You might want to call create with the overwrite flag set or use the update action instead.)`);
        }

        // Create a unique, random, alphabetic key for the object
        let randomKey: string;
        do {
          randomKey = Array.from('xxxxxxxxxx').map(char => String.fromCharCode(65 + Math.random() * 24)).join('');
          // fun fact: a key collision will, on average, occur once in a septillion
        } while ((await browser.storage.local.get(randomKey)).hasOwnProperty(randomKey));

        // write the object to storage
        currentFolder.objects[objectName] =  randomKey;
        await this.writeVFSKeyTreeToStorage(objectKeyNode);
        return this.writeObjectToStorage(randomKey, value);
      } else {

        // the other three actions only work on existing objects
        if (currentFolder.objects[objectName] != null) {
          const objectKey = currentFolder.objects[objectName];

          switch (action) {
            case 'read': {
              if (currentFolder.objects[objectName] != null) {
                return this.readObjectFromStorage(objectKey);
              } else {
                throw new Error(`File "${qualifiedObjectName}" not found.`);
              }
            }
            case 'update': {
              if (value === null || typeof value === 'undefined') {
                throw new Error(`Value mustn't be empty when updating objects.`);
              }
              return this.writeObjectToStorage(objectKey, value);
            }
            case 'delete': {
              return this.removeObjectFromStorage(objectKey);
            }
            default: {
              throw new Error(`unknown action`);
            }
          }
        } else {
          throw new Error(`File "${qualifiedObjectName}" not found.`);
        }
      }
    });
  }

  private static async writeVFSKeyTreeToStorage(newTree: VFSObjectKeysNode) {
    return browser.storage.local.set({virtualFileSystemKeyTree: newTree});
  }

  private static async writeObjectToStorage(key: string, value: any) {
    return browser.storage.local.set({[key]: value});
  }

  private static async removeObjectFromStorage(key: string) {
    return browser.storage.local.remove(key);
  }

  private static async readObjectFromStorage(key: string) {
    return browser.storage.local.get(key).then(result => result[key]);
  }
}