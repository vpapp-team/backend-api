const UTIL = require('backend-util');
const LOGGER = new (require('backend-logger'))().is.API();

exports.onRequest = (req, resp, subpath, locationLOADER, { usedEndpoint, platform, userAgent }) => {
  LOGGER.log('onRequest v1', subpath, locationLOADER);

  if (subpath[0].toLowerCase() === 'index') return UTIL.denie(resp, 'url not found');
  const location = locationLOADER.getCaseInsensitive(subpath.shift());
  if (!location) return UTIL.denie(resp, 'url not found');
  if (typeof location.dir === 'string') {
    return location.get('Index').onRequest(req, resp, subpath, location, { usedEndpoint, platform, userAgent });
  } else { return location.onRequest(req, resp, subpath, location, { usedEndpoint, platform, userAgent }); }
};
