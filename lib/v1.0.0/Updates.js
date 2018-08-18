const PUBLIC_UPDATES = 'timetables,rooms,teachers,menu,stand-in,calendar'.split(',');
const PLATFORMS = 'android,ios'.split(',');

exports.onRequest = (req, resp, subpath, location, { version, platform, userAgent }) => {
  if (req.method !== 'GET') return process.util.denie(resp, 'invalid method');
  const requestData = {
    lastUpdates: [],
    recommendedDays: getRecommendedDays(),
  };
  requestData.message = null;
  const versions = process.getVersions().filter(a => !a.isOutdated && !a.devVersion && a.platform === PLATFORMS[platform]);
  process.util.requestMaster('api/v1.0.0/Updates', lastUpdates => {
    requestData.lastUpdates = lastUpdates;
    const recommendedVersion = versions.find(a => a.isRecommended);
    requestData.recommendedVersion = recommendedVersion ? recommendedVersion.version.simplify() : null;
    const minVersion = versions.array().sort((a, b) => {
      if (a.version.major !== b.version.major) return a.version.major - b.version.major;
      if (a.version.minor !== b.version.minor) return a.version.minor - b.version.minor;
      if (a.version.patch !== b.version.patch) return a.version.patch - b.version.patch;
    })[0];
    requestData.minVersion = minVersion ? minVersion.version.simplify() : null;
    process.util.accept(resp, requestData);
  });
};

const getRecommendedDays = () => {
  let now = new Date();
  let day = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
  if (now.getDay() === 0) {
    // Sonntag
    return `D${day - 2}-D${day + 2}`;
  } else if (now.getDay() === 1) {
    // Montag
    return `D${day - 3}-D${day + 1}`;
  } else if (now.getDay() === 5) {
    // Freitag
    return `D${day - 1}-D${day + 3}`;
  } else if (now.getDay() === 6) {
    // Samstag
    return `D${day - 1}-D${day + 3}`;
  } else {
    return `D${day}+-D1`;
  }
};

exports.handleData = () => new Promise(resolve => {
  resolve(
    process.getLastUpdates()
      .filter(a => PUBLIC_UPDATES.some(b => a.isCategory(b)))
      .map(a => a.simplify())
  );
});
