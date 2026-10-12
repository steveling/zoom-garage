// Drawing helpers: the cars (seen from above, pointing up), stickers, and canvas sizing.
// Car units: about 40 wide and 68 long at scale 1.

const DISPLAY_FONT = "'Bungee', 'Arial Black', Impact, sans-serif";

function fitCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function shade(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  let r = parseInt(c.slice(0, 2), 16);
  let g = parseInt(c.slice(2, 4), 16);
  let b = parseInt(c.slice(4, 6), 16);
  if (amt < 0) {
    r *= 1 + amt; g *= 1 + amt; b *= 1 + amt;
  } else {
    r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Wheel centers and sizes per body: [x, y, w, h]
const WHEELS = {
  racer: [[-18, -18, 10, 16], [18, -18, 10, 16], [-18, 19, 10, 16], [18, 19, 10, 16]],
  rally: [[-18, -17, 10, 15], [18, -17, 10, 15], [-18, 19, 10, 15], [18, 19, 10, 15]],
  truck: [[-22, -19, 14, 22], [22, -19, 14, 22], [-22, 20, 14, 22], [22, 20, 14, 22]],
  formula: [[-18, -20, 10, 14], [18, -20, 10, 14], [-19, 18, 12, 18], [19, 18, 12, 18]],
};

// Where the number badge and sticker sit on each body: [x, y, size]
const BADGE = {
  racer: { num: [0, -19, 8], sticker: [0, 20, 10] },
  rally: { num: [0, 4, 8], sticker: [0, -23, 9] },
  truck: { num: [0, -6, 7.5], sticker: [0, 17, 9] },
  formula: { num: [0, -18, 5.5], sticker: [0, 17, 7] },
};

function drawSticker(ctx, id, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 10, size / 10);
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1b2130';
  ctx.beginPath();
  if (id === 'bolt') {
    ctx.fillStyle = '#ffd23f';
    ctx.moveTo(3, -10); ctx.lineTo(-6, 1.5); ctx.lineTo(-0.5, 1.5); ctx.lineTo(-3, 10);
    ctx.lineTo(6, -2); ctx.lineTo(0.8, -2); ctx.closePath();
  } else if (id === 'star') {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 4.2 : 10;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  } else if (id === 'flame') {
    ctx.fillStyle = '#ff7a1a';
    ctx.moveTo(0, 10);
    ctx.bezierCurveTo(-9, 8, -8, -2, -3, -10);
    ctx.bezierCurveTo(-2, -4, 1, -3, 2, -7);
    ctx.bezierCurveTo(8, -1, 9, 8, 0, 10);
  } else {
    ctx.fillStyle = '#ff5fa2';
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-13, -1, -6, -12, 0, -4);
    ctx.bezierCurveTo(6, -12, 13, -1, 0, 8);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawWheel(ctx, x, y, w, h, state, pop) {
  const out = (pop || 0) * Math.sign(x) * 8;
  ctx.save();
  ctx.translate(x + out, y);
  ctx.fillStyle = state === 0 ? '#5a4632' : '#15171c';
  rr(ctx, -w / 2, -h / 2, w, h, 3);
  ctx.fill();
  ctx.fillStyle = state === 0 ? '#6e573f' : '#30343c';
  for (let i = -1; i <= 1; i++) ctx.fillRect(-w / 2 + 1.5, i * (h / 4) - 0.8, w - 3, 1.6);
  if (state === 1) {
    ctx.fillStyle = '#d4d9e2';
    ctx.fillRect(-w / 2 + 2, -1.5, w - 4, 3);
  }
  ctx.restore();
}

// o: { angle, lights, flame, wheels:[state], pop:[0..1], mud:[{x,y,r,a}], name }
function drawCar(ctx, car, x, y, s, o = {}) {
  const body = WHEELS[car.body] ? car.body : 'racer';
  const col = car.color;
  const dk = shade(col, -0.38);
  const lt = shade(col, 0.32);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.angle || 0);
  ctx.scale(s, s);

  if (o.lights) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, -30, 0, -200);
    g.addColorStop(0, 'rgba(255,238,170,0.5)');
    g.addColorStop(1, 'rgba(255,238,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-12, -30); ctx.lineTo(-55, -200); ctx.lineTo(55, -200); ctx.lineTo(12, -30);
    ctx.fill();
    ctx.restore();
  }

  if (o.flame) {
    const len = 26 + Math.random() * 14;
    const g = ctx.createLinearGradient(0, 30, 0, 30 + len);
    g.addColorStop(0, '#fff3a8');
    g.addColorStop(0.4, '#ffb22e');
    g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-10, 30);
    ctx.quadraticCurveTo(0, 30 + len * 1.3, 10, 30);
    ctx.fill();
  }

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  rr(ctx, -19, -30, 42, 68, 14);
  ctx.fill();

  WHEELS[body].forEach((w, i) =>
    drawWheel(ctx, w[0], w[1], w[2], w[3], o.wheels ? o.wheels[i] : 2, o.pop ? o.pop[i] : 0),
  );

  const glass = '#8fd0ff';
  const glassDk = '#1e2a3a';

  if (body === 'racer') {
    ctx.fillStyle = col;
    rr(ctx, -16, -33, 32, 66, 13); ctx.fill();
    ctx.fillStyle = dk;
    rr(ctx, -12, -33, 24, 6, 3); ctx.fill();
    ctx.fillStyle = lt;
    ctx.fillRect(-14, -8, 3, 28); ctx.fillRect(11, -8, 3, 28);
    ctx.fillStyle = glassDk;
    rr(ctx, -11, -6, 22, 20, 8); ctx.fill();
    ctx.fillStyle = glass;
    rr(ctx, -9, -4, 18, 7, 4); ctx.fill();
    ctx.fillStyle = dk;
    rr(ctx, -21, 26, 42, 8, 2); ctx.fill();
  } else if (body === 'rally') {
    ctx.fillStyle = col;
    rr(ctx, -18, -32, 36, 64, 8); ctx.fill();
    ctx.fillStyle = dk;
    ctx.fillRect(-18, -32, 36, 3);
    ctx.fillStyle = '#ffe9a0';
    ctx.fillRect(-15, -32, 6, 3); ctx.fillRect(9, -32, 6, 3);
    ctx.fillStyle = glass;
    rr(ctx, -14, -13, 28, 6, 2); ctx.fill();
    ctx.fillStyle = lt;
    rr(ctx, -14, -7, 28, 24, 5); ctx.fill();
    ctx.fillStyle = '#5aa9dd';
    rr(ctx, -12, 18, 24, 5, 2); ctx.fill();
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(-16, 29, 6, 3); ctx.fillRect(10, 29, 6, 3);
  } else if (body === 'truck') {
    ctx.fillStyle = dk;
    rr(ctx, -19, -27, 38, 54, 4); ctx.fill();
    ctx.fillStyle = col;
    rr(ctx, -16, -31, 32, 62, 6); ctx.fill();
    ctx.fillStyle = glass;
    rr(ctx, -12, -20, 24, 5, 2); ctx.fill();
    ctx.fillStyle = lt;
    rr(ctx, -12, -15, 24, 19, 4); ctx.fill();
    ctx.fillStyle = dk;
    rr(ctx, -13, 7, 26, 21, 3); ctx.fill();
    ctx.fillStyle = shade(col, -0.2);
    for (let i = 0; i < 3; i++) ctx.fillRect(-11, 10 + i * 6, 22, 2);
    ctx.fillStyle = '#ffe066';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 6, -16.5, 1.4, 0, 7); ctx.fill(); }
  } else {
    ctx.fillStyle = dk;
    rr(ctx, -23, -37, 46, 6, 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-4, -34); ctx.lineTo(4, -34); ctx.lineTo(9, -8); ctx.lineTo(14, 4); ctx.lineTo(14, 24);
    ctx.lineTo(-14, 24); ctx.lineTo(-14, 4); ctx.lineTo(-9, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lt;
    rr(ctx, -15, 2, 5, 18, 2); ctx.fill();
    rr(ctx, 10, 2, 5, 18, 2); ctx.fill();
    ctx.fillStyle = glassDk;
    ctx.beginPath(); ctx.ellipse(0, 2, 6, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(0, 4, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = dk;
    rr(ctx, -21, 26, 42, 8, 2); ctx.fill();
  }

  const b = BADGE[body];
  drawSticker(ctx, car.sticker, b.sticker[0], b.sticker[1], b.sticker[2]);
  const [nx, ny, nr] = b.num;
  ctx.fillStyle = '#fbfaf3';
  ctx.strokeStyle = '#1b2130';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(nx, ny, nr, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1b2130';
  ctx.font = `${nr * (String(car.number).length > 1 ? 1.05 : 1.35)}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(car.number), nx, ny + nr * 0.08);

  if (o.name && (body === 'racer' || body === 'formula')) {
    ctx.fillStyle = '#fbfaf3';
    ctx.font = `5.4px ${DISPLAY_FONT}`;
    ctx.fillText(o.name.slice(0, 8), 0, 30.3);
  }

  if (o.mud) {
    for (const m of o.mud) {
      if (m.a <= 0.02) continue;
      ctx.globalAlpha = Math.min(1, m.a);
      ctx.fillStyle = '#6b4a2b';
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = m.r * (0.75 + 0.35 * Math.sin(a * 3 + m.seed));
        ctx.lineTo(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#82603d';
      ctx.beginPath(); ctx.arc(m.x - m.r * 0.25, m.y - m.r * 0.25, m.r * 0.3, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function drawStar(ctx, x, y, r, rot, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot || 0);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = fill || '#ffd23f';
  ctx.fill();
  ctx.lineWidth = r * 0.14;
  ctx.strokeStyle = '#b8860b';
  ctx.stroke();
  ctx.restore();
}
