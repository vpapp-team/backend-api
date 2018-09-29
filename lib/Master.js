const CLUSTER = require('cluster');
const PATH = require('path');
const HTTPS = require('https');
const NUM_CPUS = require('os').cpus().length;
const URL = require('url');
// Defined by backend-types/snowflake
const MAX_WORKID = 16;

const LOGGER = new (require('backend-logger'))().is.API();

const UTIL = require('backend-util');
const CONFIG = require('./cfgLoader')('./config.json');
const TYPES = require('backend-types');

const MYSQL = require('mysql');
const sqlPool = MYSQL.createPool(CONFIG.mysql_read);

LOGGER.log(`Master ${process.pid} is running`);

/*
 * Add functionality for caching lastUpdates
 */
// lastUpdates = [type:lastUpdate]
let lastUpdates = [];
const getLastUpdates = category => {
  if (!category) return lastUpdates;
  return lastUpdates.find(a => a.isCategory(category));
};

/*
 * Add functionality for caching versions
 */
// bufferedVersions = [type:version]
let bufferedVersions = [];
let bufferedVersionsAt = 0;
const versionsMayHaveChanged = () => {
  LOGGER.log('versionsMayHaveChanged', lastUpdates);
  let lastVersionUpdate = getLastUpdates('version');
  if (!lastVersionUpdate) return;
  if (bufferedVersionsAt === lastVersionUpdate.lastUpdate.rawNumber) return;
  UTIL.promisifiedQuery(sqlPool, `SELECT * FROM ${CONFIG.mysql_read.tables.VERSIONS}`).then(rows => {
    // TODO: cast to type:version
    bufferedVersions = JSON.stringify(rows);
    bufferedVersionsAt = lastVersionUpdate.lastUpdate.rawNumber;
    for (const worker of WORKERS) sendVersions(worker);
  }).catch(err => {
    LOGGER.error('failed to pull versions', err);
  });
};
const sendVersions = worker => {
  LOGGER.log(`sendVersions worker pid:${worker.process.pid} uuid:${worker.id} id:${worker.WORKER_ID}`);
  // TODO: check that this doesnt fire on regular start
  if (!bufferedVersions) return;
  // TODO: check whether this format changed
  worker.send({
    type: 'version',
    // TODO: cast from type:version
    data: bufferedVersions,
  });
};

/*
 * Start cluster processes
 */
const WORKERS = [];
CLUSTER.setupMaster({
  exec: PATH.resolve(__dirname, './clusterSub.js'),
});
const startWorker = id => {
  const worker = CLUSTER.fork({
    NODE_WORKER_ID: id,
  });
  worker.WORKER_ID = id;
  LOGGER.log(`starting worker pid:${worker.process.pid} uuid:${worker.id} id:${worker.WORKER_ID}`);
  worker.on('exit', (code, signal) => {
    LOGGER.log(`worker died code:${code} signal:${signal} pid:${worker.process.pid} uuid:${worker.id} id:${worker.WORKER_ID}, restarting...`); // eslint-disable-line max-len
    WORKERS[id] = startWorker(id);
  });
  worker.on('message', msg => handleMessage(msg, worker));
  worker.on('online', () => sendVersions(worker));
  return worker;
};
for (let i = 0; i < NUM_CPUS && i < MAX_WORKID; i++) {
  WORKERS[i] = startWorker(i);
}

// TODO: this block
/*
 * Cluster client requests data
 */
const handleMessage = (msg, worker) => {
  console.log('handleMessage from worker', msg);
  if (!msg.get) return;

  const parts = msg.get.split('/').filter(a => a);
  let subLoader = LOADER;
  while (parts.length) {
    console.log('handleMessage while parts', parts, subLoader);
    if (!subLoader.has(parts[0])) return console.error(`handleMessage invalid request path "${msg.get}"`);
    subLoader = subLoader.get(parts.shift());
  }
  subLoader.handleData(...msg.args).then(data => {
    worker.send({
      type: 'masterRequest',
      data,
      uuid: msg.uuid,
    });
  }).catch(err => {
    console.error('handleMessage generalRequest failed', err);
  });
};

// TODO: this block
/*
 * Register to receive update push notifications
 */
// TODO: rework
const registerPushNotifications = () => {
  console.log('registerPushNotifications');
  const request = HTTPS.get(Object.assign(
    URL.parse(`https://${process.config.uplink}:${process.config.uplinkPort}/register`),
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
    if (resp.statusCode === 418) console.log('registerPushNotifications worked');
    else console.log('registerPushNotifications statusCode', resp.statusCode);
  });
  request.on('error', err => {
    console.error('registerPushNotifications', err);
  });
};
setInterval(registerPushNotifications, process.config.CONST.BROADCAST_DELAY);
registerPushNotifications();

// TODO: this block
/*
 * Setup server for receiving update push notificiation
 */
const onRequest = (req, resp) => {
  console.log(`onRequest to ${req.url} as ${req.method} from "${req.connection.remoteAddress}"`);
  if (req.method !== 'POST') return process.util.denie(resp, 'wrong method');
  if (req.url !== '/updates/') return process.util.denie(resp, 'unknown url');

  console.log('onRequest updates');
  onDataChange();
  process.util.accept(resp, null, null, 418);
};
let registrationServer = HTTPS.createServer(process.config.SECURE_CONTEXT.getCredentials(), onRequest).listen(process.config.internPort);
process.config.SECURE_CONTEXT.on('CHANGE', () => {
  console.log('SECURE_CONTEXT CHANGE');
  registrationServer.close(() => {
    registrationServer = HTTPS.createServer(process.config.SECURE_CONTEXT.getCredentials(), onRequest).listen(process.config.internPort);
  });
});

/*
 * Received a correct update push notificiation
 */
const onDataChange = () => {
  LOGGER.log('onDataChange');
  UTIL.promisifiedQuery(sqlPool, `SELECT * FROM ${CONFIG.mysql_read.tables.UPDATES}`).then(rows => {
    LOGGER.log('---onDataChange', 'pre', lastUpdates, 'post', rows);
    lastUpdates = rows.map(a => new (TYPES.get('Data').get('LastUpdate'))(a));
    versionsMayHaveChanged();
  }).catch(err => {
    LOGGER.error('onDataChange failed to select form sql', err);
  });
};
onDataChange();
// Set up a timer if we miss out on a notification
setInterval(onDataChange, CONFIG.BACKUP_DATA_CHECK_INTERVAL);
