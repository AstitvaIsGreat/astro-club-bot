// 🚨 IMPORTING THE BIFURCATED LOGIC MODULES
const tradeActions = require('../utils/tradeActions.js');
const ticketActions = require('../utils/ticketActions.js');
const ticketClose = require('../utils/ticketClose.js');
const ticketCreator = require('../utils/ticketCreator.js'); // 🚨 NEW: Added Ticket Creator

module.exports = {
    async execute(interaction, client) {
        
        // 🚨 INTERCEPT AND ROUTE TO SPLIT FILES
        if (await ticketCreator.handle(interaction, client)) return true; // 🚨 NEW: Intercepts dropdowns & ticket creation modals
        if (await tradeActions.handle(interaction, client)) return true;
        if (await ticketActions.handle(interaction, client)) return true;
        if (await ticketClose.handle(interaction, client)) return true;
        
        return false;
    }
};