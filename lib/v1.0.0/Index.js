const FS = require('fs');
const PATH = require('path');

exports.onRequest = (req, resp, subpath, locationLOADER, { version, platform, userAgent }) => {
  console.log('onRequest v1', subpath, locationLOADER);

  if (subpath[0].toLowerCase() === 'index') return process.util.denie(resp, 'url not found');
  const location = locationLOADER.getCaseInsensitive(subpath.shift());
  if (!location) return process.util.denie(resp, 'url not found');
  if (typeof location.dir === 'string') location.get('Index').onRequest(req, resp, subpath, location, { version, platform, userAgent });
  else location.onRequest(req, resp, subpath, location, { version, platform, userAgent });
};
