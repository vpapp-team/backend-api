const HTTPS = require('https');
const URL = require('url');

const UTIL = require('backend-util');
const TYPES = require('backend-types');
const LOGGER = new (require('backend-logger'))().is.API();

exports.onRequest = (req, resp, subpath, location, { version, userAgent }) => {
  if (req.method !== 'POST') return UTIL.denie(resp, 'invalid method');
  return UTIL.getBody(req).then(body => {
    let requestData;
    try {
      const bodyData = JSON.parse(body);
      requestData = new (TYPES.get('Data').get('Error'))({
        uuid: TYPES.get('General').get('UUID').new(),
        time: TYPES.get('General').get('Time').now(),
        version,
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

exports.handleData = data => new Promise(resolve => {
  resolve();
  LOGGER.log('handleData Error', data);
  const req = HTTPS.request(Object.assign(
    URL.parse(`https://${process.config.uplink}:${process.config.uplinkPort}/error`),
    {
      method: 'POST',
      headers: {
        auth: process.config.auth,
        host: process.config.host,
        uuid: process.config.uuid,
      },
      rejectUnauthorized: !process.config.CONST.ACCEPT_SELF_SIGNED_CERTS,
    }
  ), resp => {
    if (resp.statusCode === 418) LOGGER.log('handleData Error worked');
    else LOGGER.log('handleData Error statusCode', resp.statusCode);
  });
  req.on('error', err => {
    LOGGER.error('handleData Error', err);
  });
  req.setHeader('content-length', Buffer.byteLength(data));
  req.write(data);
  req.end();
});
