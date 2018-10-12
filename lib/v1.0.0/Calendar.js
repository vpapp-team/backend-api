const LOGGER = new (require('backend-logger'))().is.API();
const CONFIG = require('../cfgLoader')();
const TYPES = require('backend-types');
const UTIL = require('backend-util');

exports.onRequest = (req, resp) => {
  if (req.method !== 'POST') return UTIL.denie(resp, 'invalid method');
  const requestData = {
    requestTime: req.headers.requesttime || TYPES.get('General').get('Time').now(),
    dataStatus: null,
    range: req.headers.range || `D${Math.floor(Date.now() / (24 * 60 * 60 * 1000)) - 1}+-D30`,
  };
  return UTIL.parseDataStatus(req, (err, parsedDataStatus) => {
    if (err) return UTIL.denie(resp, err.message);

    requestData.dataStatus = parsedDataStatus;
    const isvalid = validateRequestData(requestData);
    if (!isvalid) return UTIL.denie(resp, 'invalid parameters provided');

    return UTIL.requestMaster('masterRequest', 'api/v1.0.0/Calendar', data => {
      LOGGER.log('requested Data Calendar.js', data);
      const removed = requestData.dataStatus.has.filter(has => {
        for (const item of data) {
          if (item.uuid === has.simplify()) {
            // If it has been outdate by now => removed
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
        add: added.map(a => new (TYPES.get('Data').get('CalendarEvent'))(a).simplify()),
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
let bufferedCalendarsAt = 0;
const bufferedCalendars = new Map();
exports.handleData = range => new Promise(resolve => {
  LOGGER.log('reached Calendar.js handleData');
  let lastUpdate = process.getLastUpdates('calendar');
  if (!lastUpdate) return resolve([]);
  if (bufferedCalendarsAt < lastUpdate.lastUpdate.rawNumber) {
    return UTIL.promisifiedQuery(CONFIG.sqlPool, `SELECT * FROM ${CONFIG.mysql_read.tables.CALENDAR}
      WHERE (
        (added BETWEEN ? AND ?)
      OR
        ((outdated IS NOT NULL) AND (outdated BETWEEN ? AND ?))
      )`, [
      `DT${bufferedCalendarsAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
      `DT${bufferedCalendarsAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
    ]).then(rows => {
      for (const row of rows) {
        if (!bufferedCalendars.has(row._masterUUID)) bufferedCalendars.set(row._masterUUID, new Map());
        let master = bufferedCalendars.get(row._masterUUID);
        if (master.has(row.uuid)) master.delete(row.uuid);
        master.set(row.uuid, row);
      }
      bufferedCalendarsAt = lastUpdate.lastUpdate.rawNumber;
      resolve(returnEventsInRange(new (TYPES.get('General').get('Range'))(range)));
    }).catch(err => {
      LOGGER.error('handleData Calendar', err);
      return resolve(returnEventsInRange(new (TYPES.get('General').get('Range'))(range)));
    });
  } else {
    return resolve(returnEventsInRange(new (TYPES.get('General').get('Range'))(range)));
  }
});

const returnEventsInRange = range => {
  let inRange = [];
  for (const [calendar] of bufferedCalendars) {
    for (const [event] of calendar) {
      const eventStart = new (TYPES.get('General').get('Time'))(event.start);
      const eventEnd = new (TYPES.get('General').get('Time'))(event.start);
      if (!(range.isBefore(eventEnd) || range.isAfter(eventStart))) {
        inRange.push(event);
      }
    }
  }
  return inRange;
};
