const LOGGER = new (require('backend-logger'))().is.API();
const CONFIG = require('../cfgLoader');
const TYPES = require('backend-types');
const UTIL = require('backend-util');

exports.onRequest = (req, resp) => {
  if (req.method !== 'POST') return UTIL.denie(resp, 'invalid method');
  const requestData = {
    requestTime: req.headers.requesttime || TYPES.get('General').get('Time').now(),
    dataStatus: null,
    teachers: req.headers.teachers === 'true',
    rooms: req.headers.rooms === 'true',
    classes: req.headers.classes === 'true',
  };
  return UTIL.parseDataStatus(req, (err, parsedDataStatus) => {
    if (err) return UTIL.denie(resp, err.message);

    requestData.dataStatus = parsedDataStatus;
    const isvalid = validateRequestData(requestData);
    if (!isvalid) return UTIL.denie(resp, 'invalid parameters provided');

    return UTIL.requestMaster('masterRequest', 'api/v1.0.0/Timetables', data => {
      if (!data) UTIL.denie(resp, 'you shouldn\'t see this error:thinking:', undefined, 500);
      LOGGER.log('requested Data Timetables.js', data);
      let timetableData = data.timetable.filter(a => {
        if (a.type === 'teacher') return requestData.teachers;
        else if (a.type === 'room') return requestData.rooms;
        else return requestData.classes;
      });
      const removed = requestData.dataStatus.has.filter(has => {
        for (const item of timetableData) {
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
      const added = timetableData
        .filter(item => !item.outdated ? true : Number(item.outdated.substr(2)) >= requestData.requestTime.toUnix())
        .filter(item => !requestData.dataStatus.has.some(has => has.simplify() === item.uuid));

      if (!added.length && !removed.length) return UTIL.denie(resp, 'nothing new', undefined, 304);
      return UTIL.accept(resp, {
        requestTime: requestData.requestTime.simplify(),
        add: added.map(a => new (TYPES.get('Data').get('Timetable'))(a).simplify()),
        remove: removed.map(a => a.simplify()),
        hours: data.lessonRanges.map(a => new (TYPES.get('General').get('LessonRange'))(a).simplify()),
      });
    });
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
  } catch (e) {
    return false;
  }
  return true;
};

/*
 * This part is running in master and returning the data to all clusters
 */
exports.handleData = () => new Promise(resolve => {
  LOGGER.log('reached Timetables.js handleData');
  Promise.all([
    getTimetableData(),
    getLessonRangeData(),
  ]).then(results => {
    resolve({
      timetable: results[0],
      lessonRanges: results[1],
    });
  }).catch(err => {
    LOGGER.error('handleData Timetable failed', err);
    resolve({
      timetable: [],
      lessonRanges: [],
    });
  });
});

let bufferedTimetableAt = 0;
const bufferedTimetable = new Map();
const getTimetableData = () => new Promise((resolve, reject) => {
  let lastUpdate = process.getLastUpdates('timetables');
  if (!lastUpdate) return resolve([]);
  if (bufferedTimetableAt < lastUpdate.lastUpdate.rawNumber) {
    return UTIL.promisifiedQuery(CONFIG.sqlPool, `SELECT * FROM ${CONFIG.mysql_read.tables.TIMETABLE}
      WHERE (
        (added BETWEEN ? AND ?)
      OR
        ((outdated IS NOT NULL) AND (outdated BETWEEN ? AND ?))
      )`, [
      `DT${bufferedTimetableAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
      `DT${bufferedTimetableAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
    ]).then(rows => {
      for (const item of rows) {
        if (bufferedTimetable.has(item.uuid)) bufferedTimetable.delete(item.uuid);
        bufferedTimetable.set(item.uuid, item);
      }
      bufferedTimetableAt = lastUpdate.lastUpdate.rawNumber;
      resolve(Array.from(bufferedTimetable.values()));
    }).catch(reject);
  } else {
    return resolve(Array.from(bufferedTimetable.values()));
  }
});

let bufferedLessonRangesAt = 0;
const bufferedLessonRanges = new Map();
const getLessonRangeData = () => new Promise((resolve, reject) => {
  let lastUpdate = process.getLastUpdates('lessonranges');
  if (!lastUpdate) return resolve([]);
  if (bufferedLessonRangesAt < lastUpdate.lastUpdate.rawNumber) {
    return UTIL.promisifiedQuery(CONFIG.sqlPool, `SELECT * FROM ${CONFIG.mysql_read.tables.LESSONRANGES}
      WHERE (
        (added BETWEEN ? AND ?)
      OR
        ((outdated IS NOT NULL) AND (outdated BETWEEN ? AND ?))
      )`, [
      `DT${bufferedLessonRangesAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
      `DT${bufferedLessonRangesAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
    ]).then(rows => {
      for (const item of rows) {
        if (bufferedLessonRanges.has(item.uuid)) bufferedLessonRanges.delete(item.uuid);
        bufferedLessonRanges.set(item.uuid, item);
      }
      bufferedLessonRangesAt = lastUpdate.lastUpdate.rawNumber;
      resolve(Array.from(bufferedLessonRanges.values()));
    }).catch(reject);
  } else {
    return resolve(Array.from(bufferedLessonRanges.values()));
  }
});
