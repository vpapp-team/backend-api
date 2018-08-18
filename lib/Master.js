// LOADER IGNORE //
const CLUSTER = require('cluster');
const PATH = require('path');
const HTTPS = require('https');
const NUM_CPUS = require('os').cpus().length;
const URL = require('url');
const MAX_WORKID = 16;
const LOADER = require('../Loader.js')();
process.util = LOADER.get('util');
process.config = LOADER.get('config');
process.types = LOADER.get('types');

const MYSQL = require('mysql');
process.sqlPool = MYSQL.createPool(process.config.mysql_readwrite);

let lastUpdates = [];
process.getLastUpdates = category => {
  if (!category) return lastUpdates;
  return lastUpdates.find(a => a.isCategory(category));
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
  worker.workID = id;
  console.log(`starting worker pid:${worker.process.pid} uuid:${worker.id} id:${worker.workID}`);
  worker.on('exit', (code, signal) => {
    console.log(`worker died pid:${worker.process.pid} uuid:${worker.id} id:${worker.workID}`);
    WORKERS[id] = startWorker(id);
  });
  worker.on('message', msg => handleMessage(msg, worker));
  worker.on('online', () => sendVersions(worker));
  return worker;
};
console.log(`Master ${process.pid} is running`);
for (let i = 0; i < NUM_CPUS && i < MAX_WORKID; i++) {
  WORKERS[i] = startWorker(i);
}


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

let bufferedVersions;
let bufferedVersionsAt = 0;
const versionsMayHaveChanged = () => {
  console.log('versionsMayHaveChanged', lastUpdates);
  let lastVersionUpdate = process.getLastUpdates('version');
  if (!lastVersionUpdate) return;
  if (bufferedVersionsAt === lastVersionUpdate.lastUpdate.rawNumber) return;
  process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.VERSIONS}`).then(rows => {
    bufferedVersions = JSON.stringify(rows);
    bufferedVersionsAt = lastVersionUpdate.lastUpdate.rawNumber;
    for (const worker of WORKERS) sendVersions(worker);
  }).catch(err => {
    console.error('failed to pull versions', err);
  });
};
const sendVersions = worker => {
  console.log(`sendVersions worker pid:${worker.process.pid} uuid:${worker.id} id:${worker.workID}`);
  if (!bufferedVersions) return;
  worker.send({
    type: 'version',
    data: bufferedVersions,
  });
};

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
  console.log('onDataChange');
  process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.UPDATES}`).then(rows => {
    console.log('---onDataChange', 'pre', lastUpdates, 'post', rows);
    lastUpdates = rows.map(a => new (process.types.get('Data').get('LastUpdate'))(a));
    versionsMayHaveChanged();
  }).catch(err => {
    console.error('onDataChange failed to select form sql', err);
  });
};
onDataChange();
// Set up a timer if we miss out on a notification
setInterval(onDataChange, 1 * 60 * 60 * 1000);
