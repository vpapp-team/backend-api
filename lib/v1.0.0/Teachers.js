exports.onRequest = (req, resp, subpath, location, { version, platform, userAgent }) => {
  if (req.method !== 'POST') return process.util.denie(resp, 'invalid method');
  const requestData = {
    requestTime: req.headers.requesttime || process.types.get('General').get('Time').now(),
    dataStatus: null,
    leftSchool: req.headers.leftschool !== 'false',
    timetables: req.headers.timetables === 'true',
  };
  process.util.parseDataStatus(req, (err, parsedDataStatus) => {
    if (err) return process.util.denie(resp, err.message);

    requestData.dataStatus = parsedDataStatus;
    const isvalid = validateRequestData(requestData);
    if (!isvalid) return process.util.denie(resp, 'invalid parameters provided');

    process.util.requestMaster('api/v1.0.0/Teachers', data => {
      console.log('requested Data Teachers.js', data);
      data = data.filter(d => d.leftSchool === 1 ? requestData.leftSchool : true);
      const removed = requestData.dataStatus.has.filter(has => {
        for (const item of data) {
          if (item.uuid === has.simplify()) {
            // If it has been outdated by now => removed
            if (item.outdated && Number(item.outdated.substr(2)) < (requestData.requestTime.hasTime ? requestData.requestTime.toUnix() : requestData.requestTime.offset(1).toUnix())) return true;
            // Its already @ client and not outdated => ignore for now
            return false;
          }
        }
        // If not in db & range => removed
        return true;
      });
      // If client doesn't have it and its not outdated yet => added
      const added = data.filter(item => !item.outdated ? true : Number(item.outdated.substr(2)) >= requestData.requestTime.toUnix()).filter(item => !requestData.dataStatus.has.some(has => has.simplify() === item.uuid));

      if (!added.length && !removed.length) return process.util.denie(resp, 'nothing new', undefined, 304);

      let addedTeachers = added.map(a => new (process.types.get('Data').get('Teacher'))(a));
      if (requestData.timetables) {
        process.util.requestMaster('api/v1.0.0/Timetables', data => {
          // Organise teacher timetables
          let timetables = new Map();
          const relevantData = data.timetable.filter(a =>
            a.type === 'teacher' &&
            (!a.outdated || Number(a.outdated.substr(2)) > requestData.requestTime.toUnix())
          );
          for (const table of relevantData) {
            if (timetables.has(table.master)) timetables.get(table.master).push(new (process.types.get('Data').get('Timetable'))(table));
            else timetables.set(table.master, [new (process.types.get('Data').get('Timetable'))(table)]);
          }
          // Map timetables to teachers
          addedTeachers.forEach(a => {
            if (a.shorthand && timetables.has(a.shorthand)) a.timetable = timetables.get(a.shorthand);
          });

          process.util.accept(resp, {
            requestTime: requestData.requestTime,
            add: addedTeachers.map(a => a.simplify()),
            remove: removed.map(a => a.simplify()),
          });
        });
      } else {
        process.util.accept(resp, {
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
    if (!(data.requestTime instanceof process.types.get('General').get('Time'))) data.requestTime = new (process.types.get('General').get('Time'))(data.requestTime);
    if (data.dataStatus.has.length) {
      if (data.dataStatus.has.some(a => typeof a !== 'string' || !a)) return false;
      data.dataStatus.has = data.dataStatus.has.map(a => new (process.types.get('General').get('UUID'))(a));
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
  console.log('reached Teacher.js handleData');
  console.log('versionRequest Teacher');
  let lastUpdate = process.getLastUpdates('teachers');
  if (!lastUpdate) return resolve([]);
  if (bufferedTeachersAt < lastUpdate.lastUpdate.rawNumber) {
    process.util.promisifiedQuery(process.sqlPool, `SELECT * FROM ${process.config.mysql_readwrite.tables.TEACHERS}
      WHERE (
        (added BETWEEN ? AND ?)
      OR
        ((outdated IS NOT NULL) AND (outdated BETWEEN ? AND ?))
      )`, [`DT${bufferedTeachersAt}`, `DT${lastUpdate.lastUpdate.rawNumber}`, `DT${bufferedTeachersAt}`, `DT${lastUpdate.lastUpdate.rawNumber}`]).then(rows => {
      for (const row of rows) {
        if (bufferedTeachers.has(row.uuid)) bufferedTeachers.delete(row.uuid);
        bufferedTeachers.set(row.uuid, row);
      }
      bufferedTeachersAt = lastUpdate.lastUpdate.rawNumber;
      resolve(Array.from(bufferedTeachers.values()));
    }).catch(err => {
      console.error('handleData Teacher', err);
      resolve(Array.from(bufferedTeachers.values()));
    });
  } else {
    resolve(Array.from(bufferedTeachers.values()));
  }
});
