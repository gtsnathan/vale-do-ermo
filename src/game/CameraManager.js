// Arrastar, zoom com a roda e pinça. Mantém a câmera dentro do mapa.
export class CameraManager {
  constructor(scene) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    this.min = 0.5; this.max = 3;
  }
  bounds(w, h) { this.wTiles = w; this.hTiles = h; }
  clamp() {
    const c = this.cam;
    const W = this.wTiles * 32, H = this.hTiles * 32;
    const cx = c.midPoint.x, cy = c.midPoint.y;
    const nx = Math.max(-this.hTiles * 32, Math.min(this.wTiles * 32, cx));
    const ny = Math.max(0, Math.min(H, cy));
    if (nx !== cx || ny !== cy) c.centerOn(nx, ny);
    void W;
  }
  panBy(dxScreen, dyScreen) {
    const c = this.cam;
    c.scrollX -= dxScreen / c.zoom;
    c.scrollY -= dyScreen / c.zoom;
    c.preRender(); this.clamp();
  }
  zoomAt(factor, sx, sy) {
    const c = this.cam;
    const before = c.getWorldPoint(sx, sy);
    const z = Math.max(this.min, Math.min(this.max, c.zoom * factor));
    c.setZoom(z); c.preRender();
    const after = c.getWorldPoint(sx, sy);
    c.scrollX += before.x - after.x;
    c.scrollY += before.y - after.y;
    c.preRender(); this.clamp();
  }
  centerTile(x, y) {
    this.cam.centerOn((x - y) * 32, (x + y) * 16);
    this.cam.preRender();
  }
}
