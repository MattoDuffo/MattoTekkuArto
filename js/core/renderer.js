// One shared WebGL context renders every shader in the app; results are
// copied into ordinary 2D canvases. (Mobile Safari only allows a handful of
// live WebGL contexts, so this keeps us safe with dozens of previews.)
//
// ---------------------------------------------------------------------------
// SHADER SPEC FORMAT (used everywhere in content):
// {
//   frag: 'col = vec3(uv.x);',   // fragment BODY. Inside main() you have:
//                                //   vec2 uv   (0..1, origin bottom-left)
//                                //   vec3 col  (output colour, starts black)
//                                //   float alpha (output alpha, starts 1)
//                                //   vec3 N, vec3 P (normal / world pos for 3D meshes)
//                                // If frag contains "void main" it is used as a full shader body.
//   defs: 'float f(float x){...}' // optional helper functions (top level)
//   vert: 'pos.y += sin(pos.x);', // optional vertex BODY. You can edit
//                                //   vec3 pos, vec3 normal, vec2 uv (object space)
//   mesh: 'quad' | 'sphere' | 'plane' | 'cube' | 'torus'   (default 'quad')
//   uniforms: { uFreq: 3, uColor: [1,0,0] }  // auto-declared: number→float, [2]→vec2 ...
//   textures: { uTex: 'checker' } or { uTex: { name, filter:'nearest'|'linear'|'mipmap', wrap:'repeat'|'clamp'|'mirror' } }
//   camera: { yaw, pitch, dist, spin }   // for 3D meshes (radians, spin = rad/sec)
//   blend: 'alpha' | 'add' | 'multiply' | 'premult'  (draws over a checker background)
//   bg: [r,g,b]  background colour for 3D meshes / blending
//   wire: true   // draw mesh as wireframe lines
// }
// Always available uniforms: uTime (seconds), uRes (pixels), uMouse (0..1)
// Prelude helpers: PI, TAU, hash(vec2), hash2(vec2), vnoise(vec2), gnoise(vec2),
//   fbm(vec2), voronoi(vec2), rot(float)->mat2, sdCircle(p,r), sdBox(p,b),
//   sdSegment(p,a,b), sphereNormal(uv) (vec4: xyz normal, w mask), hsv2rgb(vec3),
//   luma(vec3), checker(uv, n), remap(x,a,b,c,d), saturate(x)
// ---------------------------------------------------------------------------

import { textureCanvas } from './textures.js';

export const PRELUDE = `
#define PI 3.14159265359
#define TAU 6.28318530718
float saturate(float x){ return clamp(x, 0.0, 1.0); }
vec2 saturate(vec2 x){ return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x){ return clamp(x, 0.0, 1.0); }
float remap(float x, float a, float b, float c, float d){ return c + (x - a) * (d - c) / (b - a); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2 hash2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
}
vec2 grad2(vec2 p){ float a = hash(p) * TAU; return vec2(cos(a), sin(a)); }
float gnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  float a = dot(grad2(i), f);
  float b = dot(grad2(i+vec2(1.0,0.0)), f-vec2(1.0,0.0));
  float c = dot(grad2(i+vec2(0.0,1.0)), f-vec2(0.0,1.0));
  float d = dot(grad2(i+vec2(1.0,1.0)), f-vec2(1.0,1.0));
  return 0.5 + 0.7 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}
float voronoi(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); float md = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash2(i + g);
    md = min(md, length(g + o - f));
  }
  return md;
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdCircle(vec2 p, float r){ return length(p) - r; }
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSegment(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec4 sphereNormal(vec2 uv){
  vec2 p = uv * 2.0 - 1.0; float r2 = dot(p, p);
  float m = step(r2, 1.0);
  return vec4(normalize(vec3(p, sqrt(max(0.0, 1.0 - r2)))), m);
}
vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float checker(vec2 uv, float n){ vec2 c = floor(uv * n); return mod(c.x + c.y, 2.0); }
`;

const PRELUDE_LINES = PRELUDE.split('\n').length;

// ------------------------------------------------------------------ meshes
function quadMesh() {
  return { pos: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uv: [0, 0, 1, 0, 0, 1, 1, 1], idx: [0, 1, 2, 2, 1, 3] };
}
function sphereMesh(seg = 48, rings = 32) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings, th = v * Math.PI;
    for (let s = 0; s <= seg; s++) {
      const u = s / seg, ph = u * Math.PI * 2;
      const x = -Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      pos.push(x, y, z); nrm.push(x, y, z); uv.push(u, 1 - v);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = r * (seg + 1) + s, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos, nrm, uv, idx };
}
function planeMesh(n = 64) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = i / n, v = j / n;
    pos.push(u * 2 - 1, 0, -(v * 2 - 1)); nrm.push(0, 1, 0); uv.push(u, v);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + n + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return { pos, nrm, uv, idx };
}
function cubeMesh() {
  const pos = [], nrm = [], uv = [], idx = [];
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  faces.forEach(([n, u, v], f) => {
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const su = a * 2 - 1, sv = b * 2 - 1;
      pos.push(n[0] + u[0] * su + v[0] * sv, n[1] + u[1] * su + v[1] * sv, n[2] + u[2] * su + v[2] * sv);
      nrm.push(...n); uv.push(a, b);
    }
    const o = f * 4; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  });
  return { pos: pos.map((x) => x * 0.7), nrm, uv, idx };
}
function torusMesh(seg = 64, ring = 24, R = 0.7, r = 0.3) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= ring; j++) for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2, v = (j / ring) * Math.PI * 2;
    const cx = Math.cos(u), cz = Math.sin(u);
    pos.push((R + r * Math.cos(v)) * cx, r * Math.sin(v), (R + r * Math.cos(v)) * cz);
    nrm.push(Math.cos(v) * cx, Math.sin(v), Math.cos(v) * cz);
    uv.push(i / seg, j / ring);
  }
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos, nrm, uv, idx };
}
const MESH_MAKERS = { quad: quadMesh, sphere: sphereMesh, plane: planeMesh, cube: cubeMesh, torus: torusMesh };

// ------------------------------------------------------------------ matrices
const M = {
  persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; },
  mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; },
  ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
};
export const mat4 = M;

// ------------------------------------------------------------------ renderer
class Renderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 512;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this._init(); });
    this._init();
    this.time0 = performance.now();
    this.mouse = [0.5, 0.5];
  }
  _init() {
    const gl = (this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true, premultipliedAlpha: false, alpha: false }));
    if (!gl) { this.failed = true; return; }
    this.programs = new Map();
    this.meshes = {};
    this.textures = {};
    this.lineIdx = {};
    gl.getExtension('OES_standard_derivatives');
    this.uintExt = gl.getExtension('OES_element_index_uint');
    // background checker program for blending demos
    this.bgProg = null;
  }
  get time() { return (performance.now() - this.time0) / 1000; }

  _mesh(name) {
    const gl = this.gl;
    if (this.meshes[name]) return this.meshes[name];
    const m = (MESH_MAKERS[name] || quadMesh)();
    const mk = (data, type = gl.ARRAY_BUFFER, Arr = Float32Array) => { const b = gl.createBuffer(); gl.bindBuffer(type, b); gl.bufferData(type, new Arr(data), gl.STATIC_DRAW); return b; };
    const big = m.pos.length / 3 > 65535;
    const IdxArr = big ? Uint32Array : Uint16Array;
    // wireframe index list
    const lines = [];
    for (let i = 0; i < m.idx.length; i += 3) { const [a, b, c] = [m.idx[i], m.idx[i + 1], m.idx[i + 2]]; lines.push(a, b, b, c, c, a); }
    const mesh = {
      pos: mk(m.pos), nrm: mk(m.nrm), uv: mk(m.uv),
      idx: mk(m.idx, gl.ELEMENT_ARRAY_BUFFER, IdxArr), count: m.idx.length,
      lineIdx: mk(lines, gl.ELEMENT_ARRAY_BUFFER, IdxArr), lineCount: lines.length,
      idxType: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      is3D: name !== 'quad',
    };
    this.meshes[name] = mesh;
    return mesh;
  }

  _uniformDecls(uniforms = {}, textures = {}) {
    let s = '';
    for (const [k, v] of Object.entries(uniforms)) {
      if (Array.isArray(v)) {
        if (v.length === 16) s += `uniform mat4 ${k};\n`;
        else if (v.length === 9) s += `uniform mat3 ${k};\n`;
        else s += `uniform vec${v.length} ${k};\n`;
      } else if (typeof v === 'boolean') s += `uniform bool ${k};\n`;
      else s += `uniform float ${k};\n`;
    }
    for (const k of Object.keys(textures)) s += `uniform sampler2D ${k};\n`;
    return s;
  }

  /** Build final GLSL sources from a spec */
  buildSources(spec) {
    const decl = this._uniformDecls(spec.uniforms, spec.textures);
    const common = `uniform float uTime;\nuniform vec2 uRes;\nuniform vec2 uMouse;\nuniform vec3 uCamPos;\n${decl}`;
    const varyings = `varying vec2 vUv;\nvarying vec3 vNormal;\nvarying vec3 vWorld;\n`;
    const meshName = spec.mesh || 'quad';
    const is3D = meshName !== 'quad';
    const vsrc = `precision highp float;
attribute vec3 aPos; attribute vec3 aNormal; attribute vec2 aUv;
uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj;
${common}${varyings}${PRELUDE}
${spec.vdefs || ''}
void main(){
  vec3 pos = aPos; vec3 normal = aNormal; vec2 uv = aUv;
  ${spec.vert || ''}
  vUv = uv;
  vec4 _w = uModel * vec4(pos, 1.0);
  vWorld = _w.xyz;
  vNormal = (uModel * vec4(normal, 0.0)).xyz;
  ${is3D ? 'gl_Position = uProj * uView * _w;' : 'gl_Position = vec4(pos.xy, 0.0, 1.0);'}
}`;
    let body = spec.frag || 'col = vec3(uv, 0.5);';
    const fullMain = /void\s+main\s*\(/.test(body);
    const head = `#extension GL_OES_standard_derivatives : enable\nprecision highp float;\n${common}${varyings}`;
    const defs = spec.defs || '';
    const fsrc = fullMain
      ? `${head}${PRELUDE}\n${defs}\n${body}`
      : `${head}${PRELUDE}\n${defs}\nvoid main(){\n  vec2 uv = vUv;\n  vec3 N = normalize(vNormal);\n  vec3 P = vWorld;\n  vec3 col = vec3(0.0);\n  float alpha = 1.0;\n${body}\n  gl_FragColor = vec4(col, alpha);\n}`;
    return { vsrc, fsrc };
  }

  /** Compile (cached). Returns {prog, error} */
  compile(spec) {
    if (this.failed) return { error: 'WebGL is not available on this device.' };
    const { vsrc, fsrc } = this.buildSources(spec);
    const key = vsrc + '\n//--\n' + fsrc;
    if (this.programs.has(key)) return this.programs.get(key);
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) || 'compile error';
        gl.deleteShader(s);
        throw new Error(cleanLog(log, src, type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'));
      }
      return s;
    };
    let result;
    try {
      const vs = sh(gl.VERTEX_SHADER, vsrc), fs = sh(gl.FRAGMENT_SHADER, fsrc);
      const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNormal'); gl.bindAttribLocation(p, 2, 'aUv');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(p));
      result = { prog: p, locs: {} };
    } catch (e) {
      result = { error: e.message };
    }
    if (this.programs.size > 160) { // simple cache trim
      const first = this.programs.keys().next().value;
      const old = this.programs.get(first); if (old.prog) gl.deleteProgram(old.prog);
      this.programs.delete(first);
    }
    this.programs.set(key, result);
    return result;
  }

  _loc(c, name) {
    if (!(name in c.locs)) c.locs[name] = this.gl.getUniformLocation(c.prog, name);
    return c.locs[name];
  }

  _texture(desc) {
    const gl = this.gl;
    const d = typeof desc === 'string' ? { name: desc } : desc;
    let t = this.textures[d.name];
    if (!t) {
      t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas(d.name));
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.textures[d.name] = t;
    }
    gl.bindTexture(gl.TEXTURE_2D, t);
    const filt = d.filter || 'linear';
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt === 'nearest' ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt === 'nearest' ? gl.NEAREST : filt === 'mipmap' ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    const wrap = { repeat: gl.REPEAT, clamp: gl.CLAMP_TO_EDGE, mirror: gl.MIRRORED_REPEAT }[d.wrap || 'repeat'];
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  _drawBg(w, h, spec) {
    // checkerboard background so transparency is visible
    if (!this.bgProg) this.bgProg = this.compile({ frag: 'col = mix(vec3(0.16), vec3(0.28), checker(gl_FragCoord.xy / 16.0, 1.0));' });
    this._drawWith(this.bgProg, this._mesh('quad'), { uniforms: {} }, w, h, 0);
  }

  _drawWith(c, mesh, spec, w, h, t) {
    const gl = this.gl;
    gl.useProgram(c.prog);
    const bind = (buf, loc, size) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    bind(mesh.pos, 0, 3); bind(mesh.nrm, 1, 3); bind(mesh.uv, 2, 2);
    gl.uniform1f(this._loc(c, 'uTime'), t);
    gl.uniform2f(this._loc(c, 'uRes'), w, h);
    gl.uniform2f(this._loc(c, 'uMouse'), this.mouse[0], this.mouse[1]);
    // camera
    const cam = spec.camera || {};
    const yaw = (cam.yaw ?? 0.6) + (cam.spin ?? 0) * t, pitch = cam.pitch ?? 0.45, dist = cam.dist ?? 3.2;
    const model = M.ident();
    const view = M.mul(M.trans(0, 0, -dist), M.mul(M.rotX(pitch), M.rotY(yaw)));
    const proj = M.persp(0.8, w / h, 0.1, 50);
    // camera position in world = inverse(view) * origin
    const cp = [-Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist];
    gl.uniformMatrix4fv(this._loc(c, 'uModel'), false, new Float32Array(spec.model || model));
    gl.uniformMatrix4fv(this._loc(c, 'uView'), false, new Float32Array(spec.view || view));
    gl.uniformMatrix4fv(this._loc(c, 'uProj'), false, new Float32Array(spec.proj || proj));
    gl.uniform3f(this._loc(c, 'uCamPos'), cp[0], cp[1], cp[2]);
    for (const [k, v] of Object.entries(spec.uniforms || {})) {
      const L = this._loc(c, k); if (!L) continue;
      if (Array.isArray(v)) {
        if (v.length === 16) gl.uniformMatrix4fv(L, false, new Float32Array(v));
        else if (v.length === 9) gl.uniformMatrix3fv(L, false, new Float32Array(v));
        else gl['uniform' + v.length + 'fv'](L, new Float32Array(v));
      } else if (typeof v === 'boolean') gl.uniform1i(L, v ? 1 : 0);
      else gl.uniform1f(L, +v);
    }
    let unit = 0;
    for (const [k, d] of Object.entries(spec.textures || {})) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      this._texture(d);
      gl.uniform1i(this._loc(c, k), unit);
      unit++;
    }
    if (spec.wire) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.lineIdx);
      gl.drawElements(gl.LINES, mesh.lineCount, mesh.idxType, 0);
    } else {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.idxType, 0);
    }
  }

  /**
   * Render a spec into the shared canvas at w×h. Returns {error} or {ok:true}.
   * Result occupies the bottom-left w×h region of this.canvas.
   */
  render(spec, w, h, t = this.time) {
    if (this.failed || this.lost) return { error: 'WebGL unavailable' };
    const gl = this.gl;
    w = Math.max(1, Math.min(512, Math.round(w))); h = Math.max(1, Math.min(512, Math.round(h)));
    const c = this.compile(spec);
    if (c.error) return c;
    const mesh = this._mesh(spec.mesh || 'quad');
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const bg = spec.bg || [0.08, 0.085, 0.11];
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (spec.blend) {
      this._drawBg(w, h, spec);
      gl.enable(gl.BLEND);
      if (spec.blend === 'add') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      else if (spec.blend === 'multiply') gl.blendFunc(gl.DST_COLOR, gl.ZERO);
      else if (spec.blend === 'premult') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    if (mesh.is3D) { gl.enable(gl.DEPTH_TEST); if (spec.cull) gl.enable(gl.CULL_FACE); }
    this._drawWith(c, mesh, spec, w, h, t);
    return { ok: true };
  }

  /** Render and copy into a 2D canvas context (fills whole target canvas). */
  renderTo(ctx2d, spec, t) {
    const cw = ctx2d.canvas.width, ch = ctx2d.canvas.height;
    const r = this.render(spec, cw, ch, t);
    if (r.error) return r;
    const w = Math.min(512, cw), h = Math.min(512, ch);
    ctx2d.drawImage(this.canvas, 0, this.canvas.height - h, w, h, 0, 0, cw, ch);
    return r;
  }

  /** Render at small size and return RGBA pixels (for comparing images). */
  pixels(spec, size = 48, t = 0) {
    const r = this.render(spec, size, size, t);
    if (r.error) return null;
    const out = new Uint8Array(size * size * 4);
    this.gl.readPixels(0, 0, size, size, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out);
    return out;
  }

  /** Mean absolute difference between two specs' images in 0..1 (0 = identical). */
  diff(specA, specB, size = 48, t = 0) {
    const a = this.pixels(specA, size, t), b = this.pixels(specB, size, t);
    if (!a || !b) return 1;
    let s = 0;
    for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    return s / ((a.length / 4) * 3 * 255);
  }

  /** Read the colour of one point (u,v in 0..1) of a spec. Returns [r,g,b] 0..1 */
  sample(spec, u, v, size = 64, t = 0) {
    const px = this.pixels(spec, size, t);
    if (!px) return [0, 0, 0];
    const x = Math.min(size - 1, Math.floor(u * size)), y = Math.min(size - 1, Math.floor(v * size));
    const i = (y * size + x) * 4;
    return [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
  }
}

function cleanLog(log, src, kind) {
  const lines = src.split('\n');
  return log.split('\n').filter(Boolean).map((l) => {
    const m = l.match(/ERROR:\s*\d+:(\d+):\s*(.*)/);
    if (!m) return l;
    const ln = +m[1];
    const code = (lines[ln - 1] || '').trim();
    return `${kind} error: ${m[2]}\n  → ${code}`;
  }).join('\n');
}

let instance = null;
export function renderer() {
  if (!instance) instance = new Renderer();
  return instance;
}
export { PRELUDE_LINES };
