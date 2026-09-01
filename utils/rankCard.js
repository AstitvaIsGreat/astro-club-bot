const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// ==========================================
// 🎨 DYNAMIC IMAGE & BAR COLOR LOGIC
// ==========================================
function getTierData(level) {
    if (level >= 200) return { bg: 'template_200.png', color: '#333333' }; 
    if (level >= 150) return { bg: 'template_150.png', color: '#FF3333' }; 
    if (level >= 125) return { bg: 'template_125.png', color: '#FFFFFF' }; 
    if (level >= 100) return { bg: 'template_100.png', color: '#00FFFF' }; 
    if (level >= 75)  return { bg: 'template_75.png',  color: '#FF55FF' }; 
    if (level >= 50)  return { bg: 'template_50.png',  color: '#FFAA00' }; 
    if (level >= 40)  return { bg: 'template_40.png',  color: '#AA00AA' }; 
    if (level >= 30)  return { bg: 'template_30.png',  color: '#5555FF' }; 
    if (level >= 20)  return { bg: 'template_20.png',  color: '#55FF55' }; 
    
    return { bg: 'template_10.png', color: '#AAAAAA' }; 
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

async function generateRankCard(member, userData, requiredXp) {
  const tier = getTierData(userData.level);
  const templatePath = path.join(__dirname, `../assets/${tier.bg}`);

  let template;
  try {
    template = await loadImage(templatePath);
  } catch (err) {
    console.error(`[rankCard] Failed to load ${tier.bg}:`, err);
    throw err;
  }

  const W = template.width;
  const H = template.height;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(template, 0, 0, W, H);

  // ==========================================
  // 🛠️ DYNAMIC PERCENTAGE COORDINATES
  // ==========================================

  const AVATAR_RADIUS = H * 0.245;       
  const AVATAR_CENTER_X = W * 0.223;
  const AVATAR_CENTER_Y = H * 0.500;     
  const AVATAR_X = AVATAR_CENTER_X - AVATAR_RADIUS;
  const AVATAR_Y = AVATAR_CENTER_Y - AVATAR_RADIUS;
  const AVATAR_SIZE = AVATAR_RADIUS * 2;

  const BAR_X = W * 0.385;
  const BAR_Y = H * 0.459;
  const BAR_MAX_WIDTH = W * 0.54;
  const BAR_HEIGHT = H * 0.085;

  const USERNAME_X = W * 0.385;
  const USERNAME_Y = H * 0.33;
  const LEVEL_X = W * 0.95;
  const LEVEL_Y = H * 0.30;
  const XP_TEXT_X = W * 0.95;
  const XP_TEXT_Y = H * 0.40;

  const PILL_1_CENTER_X = W * 0.510;
  const PILL_2_CENTER_X = W * 0.685;
  const PILL_3_CENTER_X = W * 0.865;
  const PILL_TEXT_Y = H * 0.72;
  const PILL_NUMBER_Y = H * 0.85;

  // Dynamic Font Sizes 
  const FONT_XL = Math.floor(H * 0.09); 
  const FONT_L = Math.floor(H * 0.075); // Added for the Rank Number
  const FONT_M = Math.floor(H * 0.065); 
  const FONT_S = Math.floor(H * 0.035);

  // ==========================================
  // 🖌️ DRAWING THE DATA
  // ==========================================

  // 3. Draw Progress Bar
  const currentXp = Math.max(0, userData.xp || 0);
  const safeRequiredXp = requiredXp > 0 ? requiredXp : 1; 
  const percentage = Math.min(currentXp / safeRequiredXp, 1);
  const barWidth = Math.max(0, BAR_MAX_WIDTH * percentage);

  if (barWidth > 0) {
    ctx.fillStyle = tier.color;
    ctx.beginPath();
    ctx.roundRect(BAR_X, BAR_Y, barWidth, BAR_HEIGHT, H * 0.02);
    ctx.fill();
  }

  // 4. Draw Avatar
  try {
    const avatarURL = member.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 });
    const avatarImage = await loadImage(avatarURL);

    ctx.save();
    ctx.beginPath();
    ctx.arc(AVATAR_CENTER_X, AVATAR_CENTER_Y, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImage, AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE);
    ctx.restore();
  } catch (avatarError) {
    ctx.save();
    ctx.fillStyle = '#112228';
    ctx.beginPath();
    ctx.arc(AVATAR_CENTER_X, AVATAR_CENTER_Y, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 5. Draw Typography
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.font = `bold ${FONT_XL}px Arial`;
  
  let rawName = member.displayName || member.user.username;
  
  // 🧠 SMART FILTER: Keeps ALL letters (even fancy small-caps fonts) and punctuation.
  // It ONLY strips out Emojis so they don't turn into ugly blank boxes!
  rawName = rawName.replace(/[^\x20-\x7E\p{L}]/gu, '');
  
  // Safely uppercase only the standard letters without breaking the special fonts
  rawName = rawName.replace(/[a-z]/g, char => char.toUpperCase());
  
  ctx.fillText(truncateText(ctx, rawName, W * 0.55), USERNAME_X, USERNAME_Y);

  ctx.textAlign = 'right';
  ctx.fillText(`Lv. ${userData.level}`, LEVEL_X, LEVEL_Y);
  
  ctx.font = `bold ${FONT_M}px Arial`;
  ctx.fillStyle = '#AAAAAA'; 
  ctx.fillText(`${currentXp.toLocaleString()} / ${requiredXp.toLocaleString()} XP`, XP_TEXT_X, XP_TEXT_Y);

  // 6. Draw Pill Data 
  ctx.textAlign = 'center';
  ctx.font = `bold ${FONT_S}px Arial`;
  ctx.fillStyle = '#888888';
  ctx.fillText('CURRENT XP', PILL_1_CENTER_X, PILL_TEXT_Y);
  ctx.fillText('REMAINING', PILL_2_CENTER_X, PILL_TEXT_Y);
  ctx.fillText('RANK', PILL_3_CENTER_X, PILL_TEXT_Y); // Changed label

  ctx.font = `bold ${FONT_M}px Arial`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(currentXp.toLocaleString(), PILL_1_CENTER_X, PILL_NUMBER_Y);
  ctx.fillText(Math.max(0, requiredXp - currentXp).toLocaleString(), PILL_2_CENTER_X, PILL_NUMBER_Y);
  
  // RANK NUMBER - Colored and slightly larger
  ctx.font = `bold ${FONT_L}px Arial`;
  ctx.fillStyle = tier.color; 
  ctx.fillText(`#${userData.rank || 0}`, PILL_3_CENTER_X, PILL_NUMBER_Y);

  return canvas.toBuffer('image/png');
}

module.exports = { generateRankCard };