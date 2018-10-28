const URL = require('url');
const HTTPS = require('https');

const LOGGER = new (require('backend-logger'))().is.API();
const TYPES = require('backend-types');
const UTIL = require('backend-util');

exports.onRequest = (req, resp, subpath, location, { usedEndpoint, userAgent }) => {
  if (req.method !== 'POST') return UTIL.denie(resp, 'invalid method');
  return UTIL.getBody(req).then(body => {
    let requestData;
    try {
      const bodyData = JSON.parse(body);
      requestData = new (TYPES.get('Data').get('Error'))({
        uuid: TYPES.get('General').get('UUID').new(),
        time: TYPES.get('General').get('Time').now(),
        version: usedEndpoint.version.simplify(),
        userAgent,
        platform: req.headers.platform.toLowerCase(),
        occurredAt: bodyData.occurredAt,
        error: bodyData.error,
        stack: bodyData.stack,
      });
    } catch (e) {
      return UTIL.denie(resp, 'invalid data provided');
    }
    UTIL.requestMaster('masterRequest',
      'api/v1.0.0/Error',
      () => {}, // eslint-disable-line no-empty-function
      JSON.stringify(requestData.simplify())
    );
    return UTIL.accept(resp, { msg: 'thank you for your error' });
  }).catch(err => UTIL.denie(resp, err.message));
};

// TODO: rewrite
exports.handleData = data => new Promise(resolve => {
  resolve();
});
