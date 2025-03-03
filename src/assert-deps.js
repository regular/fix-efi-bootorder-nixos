const fs = require('fs');
const path = require('path');

// if all deps are met, will return path to bash

module.exports = function assertBinaryDeps(envPath, binaries) {
  // Split the provided PATH by colon to get individual directories.
  const pathDirs = envPath.split(':');
  const missing = [];
  let bash;

  for (const bin of binaries) {
    let found = false;
    for (const dir of pathDirs) {
      const fullPath = path.join(dir, bin);
      try {
        // Check if the file exists and is executable.
        fs.accessSync(fullPath, fs.constants.X_OK);
        found = true;
        if (bin == 'bash') bash = fullPath
        break;
      } catch (e) {
        // Not found or not executable in this directory; try the next.
      }
    }
    if (!found) {
      missing.push(bin);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing binaries: ${missing.join(', ')}`);
  }
  return bash
}

