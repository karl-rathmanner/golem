import Dexie from 'dexie'

let userDB = new Dexie('userDB');

export const dexieIntegration = {
  'dexie': userDB
}   