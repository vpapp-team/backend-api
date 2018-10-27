const LOGGER = new (require('backend-logger'))().is.API();
const CONFIG = require('../cfgLoader');
const TYPES = require('backend-types');
const UTIL = require('backend-util');

exports.onRequest = (req, resp) => {
  if (req.method !== 'POST') return UTIL.denie(resp, 'invalid method');
  const requestData = {
    requestTime: req.headers.requesttime || TYPES.get('General').get('Time').now(),
    dataStatus: null,
    leftSchool: req.headers.leftschool !== 'false',
    timetables: req.headers.timetables === 'true',
  };
  return UTIL.parseDataStatus(req, (err, parsedDataStatus) => {
    if (err) return UTIL.denie(resp, err.message);

    requestData.dataStatus = parsedDataStatus;
    const isvalid = validateRequestData(requestData);
    if (!isvalid) return UTIL.denie(resp, 'invalid parameters provided');

    return UTIL.requestMaster('masterRequest', 'api/v1.0.0/Teachers', dataTeacher => {
      LOGGER.log('requested Data Teachers.js', dataTeacher);
      dataTeacher = dataTeacher.filter(d => d.leftSchool === 1 ? requestData.leftSchool : true);
      const removed = requestData.dataStatus.has.filter(has => {
        for (const item of dataTeacher) {
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
      const added = dataTeacher
        .filter(item => !item.outdated ? true : Number(item.outdated.substr(2)) >= requestData.requestTime.toUnix())
        .filter(item => !requestData.dataStatus.has.some(has => has.simplify() === item.uuid));

      if (!added.length && !removed.length) return UTIL.denie(resp, 'nothing new', undefined, 304);

      let addedTeachers = added.map(a => new (TYPES.get('Data').get('Teacher'))(a));
      if (requestData.timetables) {
        return UTIL.requestMaster('masterRequest', 'api/v1.0.0/Timetables', dataTimetable => {
          // Organise teacher timetables
          let timetables = new Map();
          const relevantData = dataTimetable.timetable.filter(a =>
            a.type === 'teacher' &&
            (!a.outdated || Number(a.outdated.substr(2)) > requestData.requestTime.toUnix())
          );
          for (const table of relevantData) {
            if (timetables.has(table.master)) {
              timetables.get(table.master).push(new (TYPES.get('Data').get('Timetable'))(table));
            } else { timetables.set(table.master, [new (TYPES.get('Data').get('Timetable'))(table)]); }
          }
          // Map timetables to teachers
          addedTeachers.forEach(a => {
            if (a.shorthand && timetables.has(a.shorthand)) a.timetable = timetables.get(a.shorthand);
          });

          UTIL.accept(resp, {
            requestTime: requestData.requestTime,
            add: addedTeachers.map(a => a.simplify()),
            remove: removed.map(a => a.simplify()),
          });
        });
      } else {
        return UTIL.accept(resp, {
          requestTime: requestData.requestTime,
          add: addedTeachers.map(a => a.simplify()),
          remove: removed.map(a => a.simplify()),
        });
      }
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
let bufferedTeachersAt = 0;
const bufferedTeachers = new Map();
exports.handleData = () => new Promise(resolve => {
  LOGGER.log('reached Teacher.js handleData');
  LOGGER.log('versionRequest Teacher');
  let lastUpdate = process.getLastUpdates('teachers');
  if (!lastUpdate) return resolve([]);
  if (bufferedTeachersAt < lastUpdate.lastUpdate.rawNumber) {
    return UTIL.promisifiedQuery(CONFIG.sqlPool, `SELECT * FROM ${CONFIG.mysql_read.tables.TEACHERS}
      WHERE (
        (added BETWEEN ? AND ?)
      OR
        ((outdated IS NOT NULL) AND (outdated BETWEEN ? AND ?))
      )`, [
      `DT${bufferedTeachersAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
      `DT${bufferedTeachersAt}`,
      `DT${lastUpdate.lastUpdate.rawNumber}`,
    ]).then(rows => {
      for (const row of rows) {
        if (bufferedTeachers.has(row.uuid)) bufferedTeachers.delete(row.uuid);
        bufferedTeachers.set(row.uuid, row);
      }
      bufferedTeachersAt = lastUpdate.lastUpdate.rawNumber;
      resolve(Array.from(bufferedTeachers.values()));
    }).catch(err => {
      LOGGER.error('handleData Teacher', err);
      resolve(Array.from(bufferedTeachers.values()));
    });
  } else {
    return resolve(Array.from(bufferedTeachers.values()));
  }
});
