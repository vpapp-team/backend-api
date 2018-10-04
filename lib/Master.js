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
    uuid: null,
    module: 'version',
    // TODO: cast from type:version
    payload: bufferedVersions,
    args: null,
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
const MODULES = UTIL.loader(__dirname);
const handleMessage = (msg, worker) => {
  LOGGER.log('handleMessage from worker', msg);
  if(msg.type === 'masterRequest') {
    const parts = msg.module.split('/').filter(a => a);
    let subLoader = MODULES;
    while (parts.length) {
      LOGGER.log('handleMessage while parts', parts, subLoader);
      subLoader = subLoader.get(parts.shift());
      if (!subLoader) {
        return LOGGER.error(`handleMessage invalid request path ${parts[0]}"" in "${msg.module}"`);
      }
    }
    if (!subLoader.handleData) return LOGGER.error(`handleMessage missing handleData "${msg.module}"`);
    subLoader.handleData(...msg.args).then(data => {
      // TODO: check whether this format changed
      worker.send({
        type: 'masterRequest',
        uuid: msg.uuid,
        module: msg.module,
        payload: data,
        args: null,
      });
    }).catch(err => {
      LOGGER.error('handleMessage generalRequest failed', err);
    });
  }
  else if(msg.type === 'validationRequest') {
    if(msg.module !== msg.type) return;
    if(!registrationID || registrationID !== msg.args[1]) {
      return worker.send({
        type: 'validationRequest',
        uuid: msg.uuid,
        module: 'validationRequest',
        payload: false,
        args: null,
      });
    }
    proxyUUID = msg.args[0];
    registrationID = null;
    worker.send({
      type: 'validationRequest',
      uuid: msg.uuid,
      module: 'validationRequest',
      payload: true,
      args: null,
    });
  }
  else if(msg.type === 'dataChangeRequest') {
    if(msg.module !== msg.type) return;
    if(!proxyUUID || proxyUUID !== msg.args[0]) return;
    onDataChange();
  }
};

/*
 * Register to receive update push notifications
 */
let registrationID = null;
let proxyUUID = null;
const registerAtProxy = () => {
  LOGGER.log('registerAtProxy');
  if(!proxyUUID) registrationID = UTIL.genSalt(128);
  const request = HTTPS.request({
    hostname: CFG.proxy.hostname,
    port: CFG.proxy.port,
    path: CFG.proxy.url,
    method: CFG.proxy.method,
    headers: {
      sign: CFG.serverConfig.signature,
      reqID: registrationID,
      proxyUUID,
    },
    rejectUnauthorized: CFG.ONLY_SIGNED_PROXY,
  }, resp => {
    if (resp.statusCode === 409) {
      if(proxyUUID) proxyUUID = false;
      else return LOGGER.error('invalid proxyUUID with no proxyUUID set');
      return registerAtProxy();
    }
    else if (resp.statusCode === 200) LOGGER.log('registerAtProxy worked');
    else LOGGER.log(`registerAtProxy failed statusCode=${resp.statusCode}`);
  });
  // this not only defines the config but also the content to be signed
  let payload = Object.assign({}, CFG.serverConfig);
  delete payload.signature;
  request.send(JSON.stringify(payload));
  request.end();
  request.on('error', err => {
    LOGGER.error('registerAtProxy failed', err);
  });
};
if(CFG.proxy) {
  setInterval(registerAtProxy, CONFIG.REGISTER_INTERVAL);
  registerAtProxy();
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
