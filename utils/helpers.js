const economyUtils = require('./economyUtils.js');
const staffUtils = require('./staffUtils.js');
const leaderboardUtils = require('./leaderboardUtils.js');
const ticketUtils = require('./ticketUtils.js');

module.exports = {
    ...economyUtils,
    ...staffUtils,
    ...leaderboardUtils,
    ...ticketUtils
};