/* @flow */

// TODO: MERGE THIS WITH obj-utils in common

export function forEachObject(obj: Object, cb: Function): void {
  for (let prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      cb(obj[prop], prop);
    }
  }
}
