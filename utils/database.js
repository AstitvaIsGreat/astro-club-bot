const fs = require('fs');
const path = require('path');
const config = require('../config.js');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPaths = {
    staff: path.join(dataDir, 'staff.json'),
    settings: path.join(dataDir, 'settings.json'),
    vouches: path.join(dataDir, 'vouches.json'),
    personalVouches: path.join(dataDir, 'personalVouches.json'),
    activeGiveaways: path.join(dataDir, 'activeGiveaways.json'),
    stickies: path.join(dataDir, 'stickies.json'),
    afk: path.join(dataDir, 'afk.json'),
    levels: path.join(dataDir, 'levels.json'),
    customers: path.join(dataDir, 'customers.json'),
    giveawaySponsors: path.join(dataDir, 'giveawaySponsors.json') // 🚨 NEW DB ADDED
};

let cachedSettings = null;

function getFilePath(dbName) {
    if (dbPaths[dbName]) return dbPaths[dbName];
    return path.join(dataDir, `${dbName}.json`);
}

function readDB(dbName) {
    const filePath = getFilePath(dbName);
    if (!fs.existsSync(filePath)) {
        try { fs.writeFileSync(filePath, JSON.stringify({}, null, 4)); } catch (e) {}
        return {};
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) { return {}; }
}

function writeDB(dbName, data) {
    const filePath = getFilePath(dbName);
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 4)); } catch (error) {}
}

function getSettings() {
    if (cachedSettings) return cachedSettings;
    const settings = readDB('settings');

    const defaults = {
        prices: { skeletonSell: '3.8M', skeletonBuy: '4.1M', creeperSell: '4M', creeperBuy: '6.5M', golemSell: '6.5M', golemBuy: '8.5M' },
        spawnerLimitArea: '64 By 64', spawnerLimitQty: '32', perms: {}, gwMinNum: 10000000, gwMinStr: '10m',
        totalGiveawaysEnded: 0, logCacheTimeMs: 3600000, logCacheTimeStr: '1 Hour', ignoredLogChannels: [], 
        lastUpdatedTimestamp: Math.floor(Date.now() / 1000), lastWeeklyReset: Date.now(), lastMonthlyReset: Date.now(),
        lastYearlyReset: Date.now(), nickSync: { roles: {}, separator: '|' }
    };

    cachedSettings = { ...defaults, ...settings };
    return cachedSettings;
}

function saveSettings() {
    if (cachedSettings) { writeDB('settings', cachedSettings); }
}

function hasPerm(member, permKey) {
    if (!member) return false;
    if (member.id === config.ownerId) return true;
    if (member.permissions && member.permissions.has('Administrator')) return true;

    const settings = getSettings();
    const allowedRoles = settings.perms?.[permKey] || [];
    if (allowedRoles.length === 0) return false;
    return member.roles.cache.some(role => allowedRoles.includes(role.id));
}

function initStaffStats(staffData, staffId) {
    if (!staffData[staffId]) {
        staffData[staffId] = { main: 'Unknown', alts: [], giveawaysHosted: 0, tradeLogs: [], spawnersSold: { skeleton: 0, creeper: 0, golem: 0 }, spawnersBought: { skeleton: 0, creeper: 0, golem: 0 }, moneyGenerated: 0, moneySpent: 0 };
    }
    if (staffData[staffId].giveawaysHosted === undefined) staffData[staffId].giveawaysHosted = 0;
    if (!staffData[staffId].tradeLogs) staffData[staffId].tradeLogs = [];
    if (!staffData[staffId].spawnersSold) staffData[staffId].spawnersSold = { skeleton: 0, creeper: 0, golem: 0 };
    if (!staffData[staffId].spawnersBought) staffData[staffId].spawnersBought = { skeleton: 0, creeper: 0, golem: 0 };
    if (staffData[staffId].moneyGenerated === undefined) staffData[staffId].moneyGenerated = 0;
    if (staffData[staffId].moneySpent === undefined) staffData[staffId].moneySpent = 0;

    const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
    cycles.forEach(cycle => {
        if (!staffData[staffId][cycle]) {
            staffData[staffId][cycle] = { points: 0, closes: 0, claims: 0, proofs: 0, messages: 0, responseTotal: 0, responseCount: 0 };
        }
    });
    return staffData;
}

function initCustomerStats(customerData, userId) {
    if (!customerData[userId]) customerData[userId] = { spawnersBought: { skeleton: 0, creeper: 0, golem: 0 }, spawnersSold: { skeleton: 0, creeper: 0, golem: 0 }, moneySpent: 0, moneyEarned: 0 };
    if (!customerData[userId].spawnersBought) customerData[userId].spawnersBought = { skeleton: 0, creeper: 0, golem: 0 };
    if (!customerData[userId].spawnersSold) customerData[userId].spawnersSold = { skeleton: 0, creeper: 0, golem: 0 };
    if (customerData[userId].moneySpent === undefined) customerData[userId].moneySpent = 0;
    if (customerData[userId].moneyEarned === undefined) customerData[userId].moneyEarned = 0;
    return customerData;
}

// 🚨 NEW: Initializes sponsor stats for the leaderboard
function initSponsorStats(sponsorData, userId) {
    if (!sponsorData[userId]) sponsorData[userId] = { totalSponsoredValue: 0, giveawaysSponsored: 0, ign: 'Unknown' };
    return sponsorData;
}

module.exports = { readDB, writeDB, getSettings, saveSettings, hasPerm, initStaffStats, initCustomerStats, initSponsorStats };