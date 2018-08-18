const FS = require('fs');
const PATH = require('path');

exports.onRequest = (req, resp, subpath, locationLOADER) => {
  console.log('onRequest files');

  const target = PATH.resolve(__dirname, subpath.join(PATH.sep));
  if (target === __filename) return process.util.denie(resp, 'no such file');
  if (!target.startsWith(__dirname) || !FS.existsSync(target)) return process.util.denie(resp, 'no such file');
  if (req.method !== 'GET') return process.util.denie(resp, 'wrong method');

  if (!stats.isFile()) return process.util.denie(resp, 'not a file');

  process.util.acceptFile(target, filePath, {
    'content-type': 'application/octet-stream',
  }, req.headers.range);
};
