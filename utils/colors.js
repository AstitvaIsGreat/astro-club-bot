const colors = {
    cyan: '#00E5FF',
    red: '#ED4245',
    green: '#57F287',
    blue: '#3498DB',
    yellow: '#FEE75C',
    purple: '#9B59B6',
    magenta: '#E91E63',
    orange: '#E67E22',
    black: '#000000',
    white: '#FFFFFF',
    invisible: '#2B2D31' // Matches Discord's dark mode background
};

function parseColor(input) {
    if (!input) return null;
    let str = input.toLowerCase().trim();
    
    // Check if it's a known name
    if (colors[str]) return colors[str];
    
    // Check if it's a raw hex code (e.g., #ff00ff or ff00ff)
    if (/^#?[0-9A-Fa-f]{6}$/.test(str)) {
        return str.startsWith('#') ? str : `#${str}`;
    }
    
    return null; // Invalid color
}

module.exports = { colors, parseColor };