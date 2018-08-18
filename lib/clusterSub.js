// LOADER IGNORE //
const CLUSTER = require('cluster');
CLUSTER.worker.workID = Number(process.env.NODE_WORKER_ID);
console.log(`Worker started pid:${process.pid} uuid:${CLUSTER.worker.id} id:${CLUSTER.worker.workID}`);

const PLATFORMS = 'android,ios'.split(',');
let bufferedVersions = new Map();
process.on('message', msg => {
  if (msg.type !== 'version') return;
  const newVersions = new Map();
  for (const d of JSON.parse(msg.data)) {
    d.version = new (process.types.get('General').get('Version'))(d.version);
    newVersions.set(d.version, d);
  }
  console.log('updated versions');
  bufferedVersions = newVersions;
});
process.getVersions = () => bufferedVersions;

const HTTPS = require('https');
const LOADER = require('../Loader.js')();
process.util = LOADER.get('util');
process.config = LOADER.get('config');
process.types = LOADER.get('types');
process.snowflake = new (LOADER.get('Snowflake'))({
  epoche: process.config.epoche,
  datacenter: process.config.datacenter,
  worker: CLUSTER.worker.workID,
});

const onRequest = (req, resp) => {
  console.log('request');
  console.log(`reached Worker pid:${process.pid} uuid:${CLUSTER.worker.id} id:${CLUSTER.worker.workID} ${req.method}@${req.url}`);
  const paths = req.url.split('/').filter(a => a);
  console.log(`"${require('util').inspect(paths, { depth: Infinity })}"`);

  let version, platform;
  try {
    version = new (process.types.get('General').get('Version'))(req.headers.version);
  } catch (e) {}
  try {
    platform = PLATFORMS.indexOf(req.headers.platform ? req.headers.platform.toLowerCase() : null);
  } catch (e) {}
  let userAgent = req.headers['user-agent'];
  if (!userAgent || typeof userAgent !== 'string') return process.util.denie(resp, 'wrong user-agent');
  if (!version) return process.util.denie(resp, 'wrong version');
  if (platform === -1) return process.util.denie(resp, 'wrong platform');

  const usedVersion = process.getVersions().find(v => v.version.equals(version) && v.platform === PLATFORMS[platform]);
  if (!usedVersion) return process.util.denie(resp, 'wrong version');
  if (!usedVersion.devVersion && usedVersion.isOutdated) return process.util.denie(resp, 'version out of date', undefined, 424);
  if (!usedVersion.devVersion && usedVersion.apiVersion && paths[0] && paths[0].toLowerCase() !== 'files' && paths[0].toLowerCase() !== usedVersion.apiVersion) return process.util.denie(resp, 'not requesting the correct endpoint');

  if (!paths[0] || !LOADER.get('api').hasCaseInsensitive(paths[0])) return process.util.denie(resp, 'url not found');
  const location = LOADER.get('api').getCaseInsensitive(paths.shift());
  location.get('Index').onRequest(req, resp, paths, location, { version, platform, userAgent });
};
let mainServer = HTTPS.createServer(process.config.SECURE_CONTEXT.getCredentials(), onRequest).listen(process.config.publicPort);
process.config.SECURE_CONTEXT.on('CHANGE', () => {
  console.log('SECURE_CONTEXT CHANGE');
  mainServer.close(() => {
    mainServer = HTTPS.createServer(process.config.SECURE_CONTEXT.getCredentials(), onRequest).listen(process.config.publicPort);
  });
});
