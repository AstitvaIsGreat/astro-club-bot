module.exports = {
    parsePrize: (prizeStr) => {
        const match = prizeStr.toLowerCase().replace(/,/g, '').match(/^([\d.]+)([kmb]?)$/);
        if (!match) return null;
        let num = parseFloat(match[1]);
        const suffix = match[2];
        if (suffix === 'k') num *= 1000;
        if (suffix === 'm') num *= 1000000;
        if (suffix === 'b') num *= 1000000000;
        return num;
    },
    
    formatPrize: (num) => {
        if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'b';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return num.toString();
    },
    
    calculateCost: (quantity, priceString) => {
        const priceMatch = priceString.match(/[\d,.]+/);
        const letterMatch = priceString.match(/[a-zA-Z]+/);
        if (!priceMatch) return '0';
        const priceNum = parseFloat(priceMatch[0].replace(/,/g, ''));
        const total = priceNum * quantity;
        const formattedTotal = Number.isInteger(total) ? total.toString() : total.toFixed(2).replace(/\.00$/, '');
        const suffix = letterMatch ? letterMatch[0] : '';
        return `${formattedTotal}${suffix}`;
    }
};