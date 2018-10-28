// LOADER IGNORE //
const HTTP = require('http');
const HTTPS = require('https');
const CLUSTER = require('cluster');
CLUSTER.worker.workID = Number(process.env.NODE_WORKER_ID);

const LOGGER = new (require('backend-logger'))().is.API();
const CONFIG = require('./cfgLoader');
const TYPES = require('backend-types');
const UTIL = require('backend-util');
UTIL.snowflake.setCFG({
  epoche: CONFIG.snowflake.epoche,
  datacenter: CONFIG.snowflake.datacenter,
  worker: CLUSTER.worker.workID,
  hostname: CONFIG.snowflake.hostname,
});

LOGGER.log(`Worker started pid:${process.pid} uuid:${CLUSTER.worker.id} id:${CLUSTER.worker.workID}`);

let bufferedVersions = new Map();
process.on('message', msg => {
  if (msg.type !== 'Endpoints') return;
  const newVersions = new Map();
  for (let d of msg.payload) {
    d = new (TYPES.get('Data').get('Endpoints'))(d);
    newVersions.set(d.version, d);
  }
  bufferedVersions = newVersions;
  LOGGER.log('updated versions');
});
process.getVersions = () => bufferedVersions;

const MODULES = UTIL.loader(__dirname);
const onRequest = (req, resp) => {
  LOGGER.log('request');
  LOGGER.log(`reached Worker pid:${process.pid} uuid:${CLUSTER.worker.id} id:${CLUSTER.worker.workID} ${req.method}@${req.url}`); // eslint-disable-line max-len

  if (CONFIG.proxy &&
    req.headers.host.split(':')[0] === CONFIG.proxy.hostname &&
    (Number(req.headers.host.split(':')[1]) || req.socket.server.address().port) === CONFIG.proxy.port &&
    req.method === CONFIG.proxy.method &&
    req.url === CONFIG.proxy.url
  ) {
    return UTIL.requestMaster('validationRequest', 'validationRequest', isValid => {
      if (!isValid) return UTIL.denie(resp, 'invalid validation request');
      else return UTIL.accept(resp, 'looks like the registration is going well');
    }, req.headers.proxyuuid, req.headers.reqid);
  }

  const { error, errorCode, usedEndpoint, platform, userAgent } = parseRequestData(req);
  if (error) return UTIL.denie(resp, error, null, errorCode);

  const paths = req.url.split('/').filter(a => a);
  LOGGER.log(`requestUrl: "${require('util').inspect(paths, { depth: Infinity })}"`);

  if (!paths[0] || !MODULES.hasCaseInsensitive(paths[0])) return UTIL.denie(resp, `endpoint "${paths[0]}" not found`);
  const location = MODULES.getCaseInsensitive(paths.shift());
  if (!location.has('Index')) return UTIL.denie(resp, 'url not found');
  return location.get('Index').onRequest(req, resp, paths, location, { usedEndpoint, platform, userAgent });
};
const parseRequestData = req => {
  let version;
  try {
    version = new (TYPES.get('General').get('Version'))(req.headers.version);
  } catch (e) {
    return { error: 'invalid version', errorCode: 400 };
  }
  let platform;
  try {
    platform = TYPES.get('Data').get('Endpoints').PLATFORMS.indexOf(req.headers.platform.toLowerCase());
  } catch (e) {
    return { error: 'invalid platform', errorCode: 400 };
  }
  if (platform === -1) return { error: 'invalid platform', errorCode: 400 };
  let userAgent = req.headers['user-agent'];
  if (!userAgent || typeof userAgent !== 'string') return { error: 'wrong user-agent', errorCode: 400 };

  const usedEndpoint = process.getVersions().find(v => v.version.equals(version) && v.isPlatform(platform));
  if (!usedEndpoint) return { error: 'wrong version', errorCode: 400 };
  if (usedEndpoint.isOutdated) return { error: 'version out of date', errorCode: 424 };
  const requestedApi = req.url.split('/').filter(a => a)[0];
  if (!usedEndpoint.devVersion &&
    typeof requestedApi === 'string' &&
    requestedApi.toLowerCase() !== usedEndpoint.apiVersion.simplify()) {
    return { error: 'not requesting the correct endpoint', errorCode: 400 };
  }

  return { usedEndpoint, platform, userAgent };
};
if (!CONFIG.serverConfig.https) { HTTP.createServer(onRequest).listen(CONFIG.serverConfig.port); } else {
  let server = HTTPS.createServer(CONFIG.SECURE_CONTEXT.getCredentials(), onRequest).listen(CONFIG.serverConfig.port);
  CONFIG.SECURE_CONTEXT.on('CHANGE', () => {
    LOGGER.log('SECURE_CONTEXT CHANGE');
    server.close(() => {
      server = HTTPS.createServer(CONFIG.SECURE_CONTEXT.getCredentials(), onRequest).listen(CONFIG.serverConfig.port);
    });
  });
}
