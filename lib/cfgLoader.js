// LOADER IGNORE //
const HTTPS_CERT = require('backend-util').httpsCert;
const PATH = require('path');

module.exports = cfgFile => {
  // TODO: listen for changes of cfg
  const CFG = require(PATH.resolve(__dirname, '../', cfgFile));

  if (!CFG.mysql_read.hasOwnProperty('connectionLimit')) CFG.mysql_read.connectionLimit = 10;
  if (!CFG.mysql_read.hasOwnProperty('charset')) CFG.mysql_read.charset = 'UTF8MB4_GENERAL_CI';
  if (!CFG.mysql_read.hasOwnProperty('tables')) {
    CFG.mysql_read.tables = {
      CALENDAR: 'CalendarEvents',
      ERRORS: 'Errors',
      FEEDBACK: 'Feedback',
      UPDATES: 'LastUpdate',
      LESSONRANGES: 'LessonRanges',
      MENU: 'Menu',
      STANDINS: 'StandIn',
      TEACHERS: 'Teacher',
      TIMETABLE: 'Timetable',
      VERSIONS: 'Versions',
      BACKENDS: 'Backends',
      WEBADMINS: 'WebAdmins',
    };
  }
  if (!CFG.hasOwnProperty('BACKUP_DATA_CHECK_INTERVAL')) CFG.BACKUP_DATA_CHECK_INTERVAL = 1 * 60 * 60 * 1000;
  if (!CFG.hasOwnProperty('ONLY_SIGNED_PROXY')) CFG.ONLY_SIGNED_PROXY = true;
  if (!CFG.hasOwnProperty('REGISTER_INTERVAL')) CFG.REGISTER_INTERVAL = 5 * 60 * 1000;
  if(CFG.SECURE_CONTEXT) CFG.SECURE_CONTEXT = new HTTPS_CERT(CFG.SECURE_CONTEXT);

  return CFG;
};
