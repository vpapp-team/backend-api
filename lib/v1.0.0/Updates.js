const TYPES = require('backend-types');
const UTIL = require('backend-util');

exports.onRequest = (req, resp, subpath, location, { platform }) => {
  if (req.method !== 'GET') return UTIL.denie(resp, 'invalid method');
  const requestData = {
    lastUpdates: [],
    recommendedDays: getRecommendedDays(),
  };
  requestData.message = null;
  const viableVersions = process.getVersions()
    .filter(a => !a.isOutdated && !a.devVersion && a.isPlatform(platform));
  return UTIL.requestMaster('masterRequest', 'api/v1.0.0/Updates', lastUpdates => {
    requestData.lastUpdates = lastUpdates;
    const recommendedVersion = viableVersions.find(a => a.isRecommended);
    requestData.recommendedVersion = recommendedVersion ? recommendedVersion.version.simplify() : null;
    const minVersion = viableVersions.array().sort((a, b) => {
      if (a.version.major !== b.version.major) return a.version.major - b.version.major;
      if (a.version.minor !== b.version.minor) return a.version.minor - b.version.minor;
      return a.version.patch - b.version.patch;
    })[0];
    requestData.minVersion = minVersion ? minVersion.version.simplify() : null;
    UTIL.accept(resp, requestData);
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
  const PUBLIC_UPDATES = TYPES.get('Data').get('LastUpdate').PUBLIC_UPDATES;
  resolve(
    process.getLastUpdates()
      .filter(a => PUBLIC_UPDATES.some(b => a.isCategory(b)))
      .map(a => a.simplify())
  );
});
