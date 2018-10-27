// LOADER IGNORE //
const PATH = require('path');
const MYSQL = require('mysql');

const HTTPS_CERT = require('backend-util').httpsCert;

module.exports = (() => {
  const CFG = require(PATH.resolve(__dirname, '../config.json'));

  if (!CFG.mysql_read.hasOwnProperty('connectionLimit')) CFG.mysql_read.connectionLimit = 10;
  if (!CFG.mysql_read.hasOwnProperty('charset')) CFG.mysql_read.charset = 'UTF8MB4_GENERAL_CI';
  if (!CFG.mysql_read.hasOwnProperty('port')) CFG.mysql_read.port = 3306;
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
      ENDPOINTS: 'Endpoints',
      BACKENDS: 'Backends',
      WEBADMINS: 'WebAdmins',
    };
  }
  // Mysql lib only uses "host" but the name "hostname" is way more clearifying
  CFG.mysql_read.host = CFG.mysql_read.hostname;
  CFG.sqlPool = MYSQL.createPool(CFG.mysql_read);
  if (!CFG.hasOwnProperty('BACKUP_DATA_CHECK_INTERVAL')) CFG.BACKUP_DATA_CHECK_INTERVAL = 1 * 60 * 60 * 1000;
  if (!CFG.hasOwnProperty('ONLY_SIGNED_PROXY')) CFG.ONLY_SIGNED_PROXY = true;
  if (!CFG.hasOwnProperty('REGISTER_INTERVAL')) CFG.REGISTER_INTERVAL = 5 * 60 * 1000;
  if (CFG.SECURE_CONTEXT) CFG.SECURE_CONTEXT = new HTTPS_CERT(CFG.SECURE_CONTEXT);
  if (!CFG.snowflake.hasOwnProperty('epoche')) CFG.snowflake.epoche = 1515151515151;
  if (CFG.hasOwnProperty('proxy') && !CFG.proxy.hasOwnProperty('secure')) CFG.proxy.secure = true;

  return CFG;
})();
