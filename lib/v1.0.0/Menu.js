const UTIL = require('backend-util');
const TYPES = require('backend-types');
const LOGGER = new (require('backend-logger'))().is.API();
const CONFIG = require('./cfgLoader')('./config.json');

exports.onRequest = (req, resp) => {
  if (req.method !== 'POST') return UTIL.denie(resp, 'invalid method');
  const requestData = {
    requestTime: req.headers.requesttime || TYPES.get('General').get('Time').now(),
    dataStatus: null,
    range: req.headers.range || `D${Math.floor(Date.now() / (24 * 60 * 60 * 1000)) - 1}-`,
  };
  return UTIL.parseDataStatus(req, (err, parsedDataStatus) => {
    if (err) return UTIL.denie(resp, err.message);

    requestData.dataStatus = parsedDataStatus;
    const isvalid = validateRequestData(requestData);
    if (!isvalid) return UTIL.denie(resp, 'invalid parameters provided');

    return UTIL.requestMaster('masterRequest', 'api/v1.0.0/Menu', data => {
      LOGGER.log('requested Data Menu.js', data);
      const removed = requestData.dataStatus.has.filter(has => {
        for (const item of data) {
          if (item.uuid === has.simplify()) {
            // If it has been outdated by now => removed
            if (item.outdated &&
              Number(item.outdated.substr(2)) <
              (
                requestData.requestTime.hasTime ?
                  requestData.requestTime.toUnix() :
                  requestData.requestTime.offset(1).toUnix()
              )
            ) return true;
            // Its already @ client and not outdated => ignore for now
            return false;
          }
        }
        // If not in db & range => removed
        return true;
      });
      // If client doesn't have it and its not outdated yet => added
      const added = data
        .filter(item => !item.outdated ? true : Number(item.outdated.substr(2)) >= requestData.requestTime.toUnix())
        .filter(item => !requestData.dataStatus.has.some(has => has.simplify() === item.uuid));

      if (!added.length && !removed.length) return UTIL.denie(resp, 'nothing new', undefined, 304);
      return UTIL.accept(resp, {
        requestTime: requestData.requestTime.simplify(),
        add: added.map(a => new (TYPES.get('Data').get('Menu'))(a).simplify()),
        remove: removed.map(a => a.simplify()),
      });
    }, requestData.range.simplify());
  });
};

/*
 * Validate data and map to types
 */
const validateRequestData = data => {
  try {
    if (!(data.requestTime instanceof TYPES.get('General').get('Time'))) {
      data.requestTime = new (TYPES.get('General').get('Time'))(data.requestTime);
    }
    if (data.dataStatus.has.length) {
      if (data.dataStatus.has.some(a => typeof a !== 'string' || !a)) return false;
      data.dataStatus.has = data.dataStatus.has.map(a => new (TYPES.get('General').get('UUID'))(a));
    }
    data.range = new (TYPES.get('General').get('Range'))(data.range);
  } catch (e) {
    return false;
  }
  return true;
};

/*
 * This part is running in master and returning the data to all clusters
 */
let bufferedMenuAt = 0;
const bufferedMenus = new Map();
exports.handleData = range => new Promise(resolve => {
  LOGGER.log('reached Menu.js handleData');
  LOGGER.log('versionRequest Menu');
  let lastUpdate = process.getLastUpdates('menu');
  if (!lastUpdate) return resolve([]);
  if (bufferedMenuAt < lastUpdate.lastUpdate.rawNumber) {
    return UTIL.promisifiedQuery(CONFIG.sqlPool, `SELECT * FROM ${CONFIG.mysql_read.tables.MENU}
      WHERE (
        (added BETWEEN ? AND ?)
      OR
        ((outdated IS NOT NULL) AND (outdated BETWEEN ? AND ?))
      )`, [
      `DT${bufferedMenuAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
      `DT${bufferedMenuAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
    ]).then(rows => {
      for (const day of UTIL.unDoub(rows.map(a => a.day))) {
        if (bufferedMenus.has(day)) {
          const buffered = bufferedMenus.get(day);
          for (const item of rows.filter(a => a.day === day)) {
            if (buffered.has(item.uuid)) buffered.delete(item.uuid);
            buffered.set(item.uuid, item);
          }
        } else {
          let daysItems = new Map();
          for (const item of rows.filter(a => a.day === day)) daysItems.set(item.uuid, item);
          bufferedMenus.set(day, daysItems);
        }
      }
      bufferedMenuAt = lastUpdate.lastUpdate.rawNumber;
      resolve(returnDaysInRange(new (TYPES.get('General').get('Range'))(range)));
    }).catch(err => {
      LOGGER.error('handleData Menu', err);
      resolve(returnDaysInRange(new (TYPES.get('General').get('Range'))(range)));
    });
  } else {
    return resolve(returnDaysInRange(new (TYPES.get('General').get('Range'))(range)));
  }
});

const returnDaysInRange = range => {
  let inRange = [];
  for (const [day, items] of bufferedMenus) {
    if (range.isIn(new (TYPES.get('General').get('Time'))(day))) {
      inRange.push(...Array.from(items.values()));
    }
  }
  return inRange;
};
