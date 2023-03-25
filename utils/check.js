const { existsSync, mkdirSync } = require('fs')

/**
 * @param {string} path
 */
exports.checkPath = (path) => {
   if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
   }
}

exports.checkPathExist = (path) => {
   if (!existsSync(path)) {
     return false
   }else{
      return true
   }
}