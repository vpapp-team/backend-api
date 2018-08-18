const PATH = require('path');
const HTTPS_CERTS = require(PATH.resolve(__dirname, './types/HttpCert.js'));

module.exports = {
  uuid: '0@timeforaninja.de',
  host: 'localhost',
  auth: 'yehaaaa',
  internPort: 8443,
  publicPort: 443,
  uplink: 'localhost',
  uplinkPort: 8080,
  datacenter: 2,
  machineID: 0,
  epoche: 1515151515151,
  mysql_read: {
    connectionLimit: 10,
    host: 'nigb.app',
    user: '',
    password: '',
    database: 'NIGB',
    charset: 'UTF8MB4_GENERAL_CI',
    tables: {
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
    },
  },
  SECURE_CONTEXT: new HTTPS_CERTS(__dirname, {
    key: '../tls/nigb.app/privkey.pem',
    cert: '../tls/nigb.app/cert.pem',
    ca: '../tls/nigb.app/fullchain.pem',
  }),
  CONST: {
    ACCEPT_SELF_SIGNED_CERTS: true,
    BROADCAST_DELAY: 5 * 60 * 1000,
    REGISTER_PUSH_NOTIFICATIONS_INTERVAL: 5 * 60 * 1000,
    PUSH_NOTIFICATION_TIMEOUT: 10 * 60 * 1000,
  },
  calendars: [
    {
      uuid: 'ferien2018',
      ref: 'https://www.schulferien.eu/downloads/ical4.php?land=3&type=1&year=2018',
      uuidFormater: uuid => uuid.replace(/[^a-z0-9.\-_+]/ig, '').replace(/-schulferien\.eu$/g, '@schulferien.eu'),
    }, {
      uuid: 'feiertage2018',
      ref: 'https://www.schulferien.eu/downloads/ical4.php?land=NI&type=0&year=2018',
      uuidFormater: uuid => uuid.replace(/[^a-z0-9.\-_+]/ig, '').replace(/-schulferien\.eu$/g, '@schulferien.eu'),
    }, {
      uuid: 'ferien2019',
      ref: 'https://www.schulferien.eu/downloads/ical4.php?land=3&type=1&year=2019',
      uuidFormater: uuid => uuid.replace(/[^a-z0-9.\-_+]/ig, '').replace(/-schulferien\.eu$/g, '@schulferien.eu'),
    }, {
      uuid: 'feiertage2019',
      ref: 'https://www.schulferien.eu/downloads/ical4.php?land=NI&type=0&year=2019',
      uuidFormater: uuid => uuid.replace(/[^a-z0-9.\-_+]/ig, '').replace(/-schulferien\.eu$/g, '@schulferien.eu'),
    }, {
      uuid: 'schoolMain',
      ref: 'https://nigb.de/caldav/+public/calendar',
      username: '',
      password: '',
    },
  ],
  disableAfter3FailsInXMin: 5,
};
