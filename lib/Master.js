// LOADER IGNORE //
const CLUSTER = require('cluster');
const PATH = require('path');
const HTTPS = require('https');
const HTTP = require('http');
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
let lastUpdates = [];
// LastUpdates = [type:lastUpdate]
const getLastUpdates = category => {
  if (!category) return lastUpdates;
  return lastUpdates.find(a => a.isCategory(category));
};

/*
 * Add functionality for caching versions
 */
let bufferedVersions = [];
// BufferedVersions = [type:version]
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
    module: 'version',
    // TODO: cast from type:version
    payload: bufferedVersions,
    uuid: null,
  });
};

/*
 * Start cluster processes
 */
const WORKERS = [];
CLUSTER.setupMaster({
  exec: PATH.resolve(__dirname, './Worker.js'),
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

/*
 * Cluster client requests data
 */
const MODULES = UTIL.loader.readDir(__dirname);
const handleMessage = (msg, worker) => {
  LOGGER.log('handleMessage from worker', msg);
  // TODO: is this used? if no throw and dont return
  if (!msg.get) return;

  const parts = msg.get.split('/').filter(a => a);
  let subLoader = MODULES;
  while (parts.length) {
    LOGGER.log('handleMessage while parts', parts, subLoader);
    if (!subLoader.has(parts[0])) {
      return LOGGER.error(`handleMessage invalid request path ${parts[0]}"" in "${msg.get}"`);
    }
    subLoader = subLoader.get(parts.shift());
  }
  if (!subLoader.handleData) return LOGGER.error(`handleMessage missing handleData "${msg.get}"`);
  subLoader.handleData(...msg.args).then(data => {
    // TODO: check whether this format changed
    worker.send({
      type: 'masterRequest',
      module: msg.get,
      payload: data,
      uuid: msg.uuid,
    });
  }).catch(err => {
    LOGGER.error('handleMessage generalRequest failed', err);
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
setInterval(registerPushNotifications, CONFIG.REGISTER_INTERVAL);
registerPushNotifications();

// TODO: dont spawn a web server, catch the requests in clusterSub.js
/*
 * Setup server for receiving update push notificiation
 */
const onRequest = (req, resp) => {
  LOGGER.log(`onRequest to ${req.url} as ${req.method} from "${req.connection.remoteAddress}"`);
  if (req.method !== CONFIG.serverConfig.method) return UTIL.denie(resp, 'wrong method');
  if (req.url !== CONFIG.serverConfig.path) return UTIL.denie(resp, 'unknown url');
  // TODO: check whether the server includes the uid set registering for push notifications

  LOGGER.log('onRequest updates');
  onDataChange();
  UTIL.accept(resp, "thanks for the push");
};
let registrationServer;
if(CONFIG.serverConfig.https) {
  registrationServer = HTTPS.createServer(CONFIG.SECURE_CONTEXT.getCredentials(), onRequest).listen(CONFIG.serverConfig.modPort);
  CONFIG.SECURE_CONTEXT.on('CHANGE', () => {
    LOGGER.log('SECURE_CONTEXT CHANGE');
    registrationServer.close(() => {
      registrationServer = HTTPS.createServer(CONFIG.SECURE_CONTEXT.getCredentials(), onRequest).listen(CONFIG.serverConfig.modPort);
    });
  });
} else {
  registrationServer = HTTP.createServer(onRequest).listen(CONFIG.serverConfig.modPort);
}

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
