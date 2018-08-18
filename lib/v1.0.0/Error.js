const HTTPS = require('https');
const URL = require('url');

exports.onRequest = (req, resp, subpath, location, { version, platform, userAgent }) => {
  if (req.method !== 'POST') return process.util.denie(resp, 'invalid method');
  process.util.getBody(req).then(body => {
    let requestData;
    try {
      const bodyData = JSON.parse(body);
      requestData = new (process.types.get('Data').get('Error'))({
        uuid: process.types.get('General').get('UUID').new(),
        time: process.types.get('General').get('Time').now(),
        version,
        userAgent,
        platform: req.headers.platform.toLowerCase(),
        occurredAt: bodyData.occurredAt,
        error: bodyData.error,
        stack: bodyData.stack,
      });
    } catch (e) {
      return process.util.denie(resp, 'invalid data provided');
    }
    process.util.requestMaster(
      'api/v1.0.0/Error',
      () => {},
      JSON.stringify(requestData.simplify())
    );
    process.util.accept(resp, { msg: 'thank you for your error' });
  }).catch(err => process.util.denie(resp, err.message));
};

exports.handleData = data => new Promise(resolve => {
  resolve();
  console.log('handleData Error', data);
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
    if (resp.statusCode === 418) console.log('handleData Error worked');
    else console.log('handleData Error statusCode', resp.statusCode);
  });
  req.on('error', err => {
    console.error('handleData Error', err);
  });
  req.setHeader('content-length', Buffer.byteLength(data));
  req.write(data);
  req.end();
});