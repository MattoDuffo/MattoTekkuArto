// Procedurally drawn built-in textures (all 256x256, power of two so that
// REPEAT wrapping and mipmaps work in WebGL1).
// Use them in shader specs: textures: { uTex: 'checker' } or
// textures: { uTex: { name: 'letterF', filter: 'nearest', wrap: 'repeat' } }

const S = 256;
const cache = {};

function mk(draw, size = S) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  return c;
}

const makers = {
  // 8x8 checkerboard
  checker: () => mk((g) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#e8e8e8' : '#303030';
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  }),
  // UV debug grid: red increases to the right (U), green increases upward (V)
  uvgrid: () => mk((g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      img.data[i] = (x / (S - 1)) * 255;
      img.data[i + 1] = (1 - y / (S - 1)) * 255;
      img.data[i + 2] = 40;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let k = 0; k <= 8; k++) {
      g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32, S); g.stroke();
      g.beginPath(); g.moveTo(0, k * 32); g.lineTo(S, k * 32); g.stroke();
    }
  }),
  // Asymmetric letter F — shows flips and rotations clearly
  letterF: () => mk((g) => {
    g.fillStyle = '#2a6cff'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#ffd23f';
    g.fillRect(70, 40, 40, 176);
    g.fillRect(70, 40, 120, 38);
    g.fillRect(70, 112, 90, 34);
    g.fillStyle = '#ff4f6d';
    g.beginPath(); g.arc(205, 210, 22, 0, Math.PI * 2); g.fill();
  }),
  brick: () => mk((g) => {
    g.fillStyle = '#d9d2c5'; g.fillRect(0, 0, S, S);
    const bh = 32, bw = 64;
    for (let r = 0; r < 8; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c < 5; c++) {
        const shade = 150 + ((r * 7 + c * 13) % 5) * 12;
        g.fillStyle = `rgb(${shade + 20},${shade / 2.2},${shade / 3})`;
        g.fillRect(c * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
      }
    }
  }),
  // A little landscape "photo"
  photo: () => mk((g) => {
    const sky = g.createLinearGradient(0, 0, 0, S);
    sky.addColorStop(0, '#2b5fd9'); sky.addColorStop(0.6, '#ffb36b'); sky.addColorStop(1, '#ff7a59');
    g.fillStyle = sky; g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(180, 120, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2f5b';
    g.beginPath(); g.moveTo(0, 190); g.lineTo(70, 120); g.lineTo(140, 200); g.lineTo(210, 140); g.lineTo(256, 180); g.lineTo(256, 256); g.lineTo(0, 256); g.fill();
    g.fillStyle = '#1f6b4f'; g.fillRect(0, 215, S, 41);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(30 + i * 9, 40 + (i % 2) * 4, 9, 0, Math.PI * 2); g.fill(); }
  }),
  smiley: () => mk((g) => {
    g.fillStyle = '#5b3cc4'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(92, 100, 14, 0, Math.PI * 2); g.arc(164, 100, 14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 12; g.beginPath(); g.arc(128, 135, 55, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  }),
  // Smooth tileable value noise (grayscale)
  noise: () => mk((g) => {
    const img = g.createImageData(S, S);
    const N = 16, grid = [];
    let seed = 1234;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N * N; i++) grid.push(rnd());
    const at = (x, y) => grid[((y + N) % N) * N + ((x + N) % N)];
    const sm = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0, amp = 0.5, freq = 1;
      for (let o = 0; o < 3; o++) {
        const gx = (x / S) * N * freq, gy = (y / S) * N * freq;
        const ix = Math.floor(gx), iy = Math.floor(gy), fx = sm(gx - ix), fy = sm(gy - iy);
        const m = (a, b, t) => a + (b - a) * t;
        const nn = m(m(at(ix, iy), at(ix + 1, iy), fx), m(at(ix, iy + 1), at(ix + 1, iy + 1), fx), fy);
        v += nn * amp; amp *= 0.5; freq *= 2;
      }
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 290);
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }),
  // Horizontal black → white ramp
  gradient: () => mk((g) => {
    const gr = g.createLinearGradient(0, 0, S, 0);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }),
  // Toon ramp: 3 hard bands (dark → mid → light), left to right
  toonramp: () => mk((g) => {
    g.fillStyle = '#2a2350'; g.fillRect(0, 0, 90, S);
    g.fillStyle = '#7a5cd6'; g.fillRect(90, 0, 90, S);
    g.fillStyle = '#e8dcff'; g.fillRect(180, 0, 76, S);
  }),
  // Rainbow gradient map / palette (left to right)
  palette: () => mk((g) => {
    const gr = g.createLinearGradient(0, 0, S, 0);
    ['#120a2e', '#5a1a8c', '#d6336c', '#ff922b', '#ffe066', '#ffffff'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }),
  // 4x4 flipbook: numbered frames 1..16, reading left→right, top→bottom
  flipbook: () => mk((g) => {
    for (let i = 0; i < 16; i++) {
      const cx = (i % 4) * 64, cy = Math.floor(i / 4) * 64;
      g.fillStyle = `hsl(${i * 22}, 70%, 45%)`; g.fillRect(cx, cy, 64, 64);
      g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), cx + 32, cy + 34);
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.strokeRect(cx + 1, cy + 1, 62, 62);
    }
  }),
  // Tangent-space normal map with round bumps (bluish)
  normalmap: () => mk((g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = ((x / S) * 4) % 1 - 0.5, vv = ((1 - y / S) * 4) % 1 - 0.5;
      const r2 = u * u + vv * vv;
      let nx = 0, ny = 0, nz = 1;
      if (r2 < 0.16) { const h = Math.sqrt(0.16 - r2); nx = u / 0.4; ny = vv / 0.4; nz = h / 0.4; }
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }),
  // Channel-packed mask: R = circles, G = stripes, B = vertical gradient
  packed: () => mk((g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, vv = 1 - y / S;
      const cu = (u * 3) % 1 - 0.5, cv = (vv * 3) % 1 - 0.5;
      const i = (y * S + x) * 4;
      img.data[i] = cu * cu + cv * cv < 0.09 ? 255 : 0;
      img.data[i + 1] = Math.floor(u * 8) % 2 ? 255 : 0;
      img.data[i + 2] = vv * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }),
  // Flow map: encodes a swirling direction in RG (0.5 = no motion)
  flowmap: () => mk((g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S - 0.5, vv = (1 - y / S) - 0.5;
      let dx = -vv, dy = u; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const i = (y * S + x) * 4;
      img.data[i] = (dx * 0.5 + 0.5) * 255; img.data[i + 1] = (dy * 0.5 + 0.5) * 255; img.data[i + 2] = 0; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }),
  // White soft particle sprite with alpha falloff (alpha channel used)
  particle: () => mk((g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }),
  // Fine stripes with high frequency — good for showing aliasing/mipmaps
  stripes: () => mk((g) => {
    for (let x = 0; x < S; x += 4) { g.fillStyle = (x / 4) % 2 ? '#fff' : '#000'; g.fillRect(x, 0, 4, S); }
  }),
};

export const TEXTURE_NAMES = Object.keys(makers);

/** Returns a canvas for a built-in texture name */
export function textureCanvas(name) {
  if (!cache[name]) {
    const m = makers[name];
    if (!m) throw new Error('Unknown texture: ' + name);
    cache[name] = m();
  }
  return cache[name];
}
