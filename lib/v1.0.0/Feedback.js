const HTTPS = require('https');
const URL = require('url');

exports.onRequest = (req, resp, subpath, location, { version, platform, userAgent }) => {
  if (req.method !== 'POST') return process.util.denie(resp, 'invalid method');
  process.util.getBody(req).then(body => {
    let requestData;
    try {
      const bodyData = JSON.parse(body);
      requestData = new (process.types.get('Data').get('Feedback'))({
        uuid: process.types.get('General').get('UUID').new(),
        time: process.types.get('General').get('Time').now(),
        version,
        userAgent,
        platform: req.headers.platform.toLowerCase(),
        name: bodyData.name || null,
        email: bodyData.email || null,
        content: bodyData.feedback,
      });
    } catch (e) {
      return process.util.denie(resp, 'invalid data provided');
    }
    process.util.requestMaster(
      'api/v1.0.0/Feedback',
      () => {},
      JSON.stringify(requestData.simplify())
    );
    process.util.accept(resp, { msg: 'thank you for your feedback' });
  }).catch(err => process.util.denie(resp, err.message));
};

exports.handleData = data => new Promise(resolve => {
  resolve();
  console.log('handleData Feedback', data);
  const req = HTTPS.request(Object.assign(
    URL.parse(`https://${process.config.uplink}:${process.config.uplinkPort}/feedback`),
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
    if (resp.statusCode === 418) console.log('handleData Feedback worked');
    else console.log('handleData Feedback statusCode', resp.statusCode);
  });
  req.on('error', err => {
    console.error('handleData Feedback', err);
  });
  req.setHeader('content-length', Buffer.byteLength(data));
  req.write(data);
  req.end();
});
