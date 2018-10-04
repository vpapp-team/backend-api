// LOADER IGNORE //
const CLUSTER = require('cluster');
CLUSTER.worker.workID = Number(process.env.NODE_WORKER_ID);
const HTTPS = require('https');
const HTTP = require('http');
const CONFIG = require('./cfgLoader')('./config.json');
const LOGGER = new (require('backend-logger'))().is.API();
const TYPES = require('backend-types');
const UTIL = require('backend-util');

LOGGER.log(`Worker started pid:${process.pid} uuid:${CLUSTER.worker.id} id:${CLUSTER.worker.workID}`);

let bufferedVersions = new Map();
process.on('message', msg => {
  if (msg.type !== 'version') return;
  const newVersions = new Map();
  for (const d of msg.payload) {
    // Cast hole version?
    // TODO: add second type for db version object
    d.version = new (TYPES.get('General').get('Version'))(d.version);
    newVersions.set(d.version, d);
  }
  bufferedVersions = newVersions;
  LOGGER.log('updated versions');
});
process.getVersions = () => bufferedVersions;

// TODO: more platforms? other ref for platforms?
const PLATFORMS = 'android,ios'.split(',');
const MODULES = UTIL.loader(__dirname);
const onRequest = (req, resp) => {
  LOGGER.log('request');
  LOGGER.log(`reached Worker pid:${process.pid} uuid:${CLUSTER.worker.id} id:${CLUSTER.worker.workID} ${req.method}@${req.url}`); // eslint-disable-line max-len

  if (req.headers.host === `${CONFIG.proxy.hostname}:${CONFIG.proxy.port}` &&
    req.method === CONFIG.proxy.method &&
    req.url === CONFIG.proxy.url
  ) {
    return UTIL.requestMaster('validationRequest', 'validationRequest', isValid => {
      if (!isValid) return UTIL.denie(resp, 'invalid validation request');
      else return UTIL.accept(resp, 'looks like the registration is going well');
    }, req.headers.proxyuuid, req.headers.reqid);
  }

  const { error, version, platform, userAgent } = parseRequestData(req);
  if (error) return UTIL.denie(resp, error);

  const paths = req.url.split('/').filter(a => a);
  LOGGER.log(`requestUrl: "${require('util').inspect(paths, { depth: Infinity })}"`);

  // TODO: make usedVersion its own type...
  const usedVersion = process.getVersions().find(v => v.version.equals(version) && v.platform === PLATFORMS[platform]);
  if (!usedVersion) return UTIL.denie(resp, 'wrong version');
  if (!usedVersion.devVersion && usedVersion.isOutdated) return UTIL.denie(resp, 'version out of date', undefined, 424);
  if (!usedVersion.devVersion &&
    usedVersion.apiVersion &&
    paths[0] &&
    paths[0].toLowerCase() !== 'files' &&
    paths[0].toLowerCase() !== usedVersion.apiVersion) {
    return UTIL.denie(resp, 'not requesting the correct endpoint');
  }

  if (!paths[0] || !MODULES.hasCaseInsensitive(paths[0])) return UTIL.denie(resp, 'url not found');
  const location = MODULES.getCaseInsensitive(paths.shift());
  if (!location.has('Index')) return UTIL.denie(resp, 'url not found');
  // TODO: don't pass version, pass usedVersion and keep version inside parseRequestData
  return location.get('Index').onRequest(req, resp, paths, location, { version, platform, userAgent });
};
const parseRequestData = req => {
  let version;
  try {
    version = new (TYPES.get('General').get('Version'))(req.headers.version);
  } catch (e) {
    return { error: 'invalid version' };
  }
  let platform;
  try {
    platform = PLATFORMS.indexOf(req.headers.platform ? req.headers.platform.toLowerCase() : null);
  } catch (e) {
    return { error: 'invalid platform' };
  }
  if (platform === -1) return { error: 'invalid platform' };
  let userAgent = req.headers['user-agent'];
  if (!userAgent || typeof userAgent !== 'string') return { error: 'wrong user-agent' };
  return { error: null, version, platform, userAgent };
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
