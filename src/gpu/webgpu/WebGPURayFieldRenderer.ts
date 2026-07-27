import type { RayFieldRenderer, RayFieldState } from '../rayFieldTypes';
import wgsl from './rayField.wgsl?raw';

const FLOATS = 72; // 18 × vec4f = 288 bytes

export class WebGPURayFieldRenderer implements RayFieldRenderer {
  readonly backend = 'webgpu' as const;
  private device!: GPUDevice;
  private ctx!: GPUCanvasContext;
  private pipeline!: GPURenderPipeline;
  private ubuf!: GPUBuffer;
  private bind!: GPUBindGroup;
  private data = new Float32Array(FLOATS);
  private canvas!: HTMLCanvasElement;
  private sampler!: GPUSampler;
  private signTex!: GPUTexture; // starts as a 1×1 placeholder until the mask loads
  private hasMask = 0;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    this.device = await adapter.requestDevice();
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('No webgpu context');
    this.ctx = ctx;
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: this.device, format, alphaMode: 'opaque' });

    const module = this.device.createShaderModule({ code: wgsl });
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.ubuf = this.device.createBuffer({
      size: FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    // placeholder so the bind group is valid before the mask is uploaded
    this.signTex = this.device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.rebuildBind();
  }

  private rebuildBind(): void {
    this.bind = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ubuf } },
        { binding: 1, resource: this.signTex.createView() },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  setSignMask(source: TexImageSource): void {
    const w = 'width' in source ? (source.width as number) : 0;
    const h = 'height' in source ? (source.height as number) : 0;
    if (!w || !h) return;
    this.signTex?.destroy();
    this.signTex = this.device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture(
      { source, flipY: true }, // top row -> v=0 (p.y is down), matches WebGL2
      { texture: this.signTex },
      [w, h],
    );
    this.rebuildBind();
    this.hasMask = 1;
  }

  resize(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(s: RayFieldState): void {
    const d = this.data;
    const p = s.params;
    d[0] = this.canvas.width;
    d[1] = this.canvas.height;
    d[2] = s.centerPx[0];
    d[3] = s.centerPx[1];
    d[4] = s.pointerPx[0];
    d[5] = s.pointerPx[1];
    d[6] = s.timeSec;
    d[7] = s.scale;
    d.set(s.beamAngles, 8);
    d.set(s.linkAngles, 12);
    d.set(s.linkDist, 16);
    d.set(s.linkHalfAng, 20);
    d.set(s.beamHover, 24);
    d[28] = p.primaryK;
    d[29] = p.primaryIntensity;
    d[30] = p.falloffL;
    d[31] = p.coreRadius;
    d[32] = p.coreIntensity;
    d[33] = p.crossSize;
    d[34] = p.crossIntensity;
    d[35] = p.secCount;
    d[36] = p.secK;
    d[37] = p.secIntensity;
    d[38] = p.rotSpeed;
    d[39] = p.dustAmount;
    d[40] = p.dustScale;
    d[41] = p.moteAmount;
    d[42] = p.grain;
    d[43] = p.ca;
    d[44] = p.hazeBase;
    d[45] = p.channelDark;
    d[46] = p.parallax;
    d[47] = p.breathe;
    d[48] = p.hoverMode;
    d[49] = p.compositeMode;
    d[50] = s.bgMix;
    d[51] = s.layers;
    d[52] = s.octaves;
    d[53] = p.refraction;
    d[54] = p.shimmer;
    d[55] = s.sceneDim;
    d[56] = p.fiberDrift;
    d[57] = p.angleWarp;
    d[58] = p.ghosting;
    d[59] = p.shadow;
    d[60] = s.modeMix;
    d[61] = s.slitMix;
    d[62] = this.hasMask;
    d[63] = p.signSize;
    d[64] = p.godrays;
    d[65] = p.bloom;
    d[66] = p.dissolve;
    d[67] = s.signRot;
    this.device.queue.writeBuffer(this.ubuf, 0, d);

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bind);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  destroy(): void {
    this.signTex?.destroy();
    this.ubuf?.destroy();
    this.device?.destroy();
  }
}
