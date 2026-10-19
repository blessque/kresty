import type { LightMaskData, RayFieldRenderer, RayFieldState, RaysMode } from '../rayFieldTypes';
import wgsl from './rayField.wgsl?raw';
import { GPUPolarPasses } from './polarPasses';
import { createHaze, createSamplers, gpuTexture, uploadBloom, uploadMask, type LightSamplers } from './gpuTextures';
import { RAYS_CODE, exactFrame, type MaskGeometry } from '../exactLight';

/**
 * 26 × vec4f = 416 bytes. Round 33 APPENDED p12–p18 (and used p10.w) — no slot
 * above moved; the WGSL `struct U` comments name every one, keep them in step.
 */
const FLOATS = 104;

export class WebGPURayFieldRenderer implements RayFieldRenderer {
  readonly backend = 'webgpu' as const;
  gpuName = '';
  exactAvailable = false;
  raysActive: RaysMode = 'march';
  private device!: GPUDevice;
  private ctx!: GPUCanvasContext;
  private pipeline!: GPURenderPipeline;
  private ubuf!: GPUBuffer;
  private bind!: GPUBindGroup;
  private bindDirty = true;
  private data = new Float32Array(FLOATS);
  private canvas!: HTMLCanvasElement;
  private samp!: LightSamplers;
  private signTex!: GPUTexture; // a 1×1 placeholder until the mask loads
  private signView!: GPUTextureView;
  private bloomTex!: GPUTexture;
  private hazeTex!: GPUTexture;
  private dummyPolar!: GPUTextureView;
  private boundPolar: GPUTextureView | null = null;
  private polar: GPUPolarPasses | null = null;
  private hasMask = 0;
  /** set by a mask that came with exact data; null = that mask can only be marched */
  private mask: (MaskGeometry & { bloom: LightMaskData['bloom'] }) | null = null;
  private frameNo = 0;
  private debug = { ditherAmp: 1, jitOffset: 0, frame: -1 };

  get polarBuilds(): number {
    return this.polar?.builds ?? 0;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    // `adapter.info` is recent (older engines have `requestAdapterInfo()` or
    // nothing), hence the loose read
    const info = (adapter as unknown as { info?: Record<string, string> }).info;
    this.gpuName = info
      ? [info.vendor, info.architecture, info.description].filter(Boolean).join(' ')
      : '';
    this.device = await adapter.requestDevice();
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('No webgpu context');
    this.ctx = ctx;
    const format = navigator.gpu.getPreferredCanvasFormat();
    // probes read the canvas back; nothing else needs COPY_SRC on the swapchain
    const probe = (globalThis as { __krestyProbe?: boolean }).__krestyProbe === true;
    ctx.configure({
      device: this.device,
      format,
      alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | (probe ? GPUTextureUsage.COPY_SRC : 0),
    });

    const module = this.device.createShaderModule({ code: wgsl });
    // ASYNC on purpose (round 33): a WGSL error must reject so the consumer can
    // fall back to WebGL2 — the synchronous call returns an invalid pipeline that
    // silently renders nothing, i.e. a blank light
    this.pipeline = await this.device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.ubuf = this.device.createBuffer({
      size: FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.samp = createSamplers(this.device);
    // placeholders so the bind group is valid before anything is uploaded
    this.signTex = gpuTexture(this.device, [1, 1], 'rgba8unorm', true);
    this.signView = this.signTex.createView();
    this.bloomTex = gpuTexture(this.device, [1, 1], 'rg16float');
    this.dummyPolar = gpuTexture(this.device, [1, 1], 'rgba16float').createView();
    this.hazeTex = createHaze(this.device);
    this.polar = await GPUPolarPasses.create(this.device);
    this.exactAvailable = this.polar !== null;
    this.rebuildBind();
  }

  private rebuildBind(): void {
    this.boundPolar = this.polar?.view ?? null;
    this.bind = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ubuf } },
        { binding: 1, resource: this.signView },
        { binding: 2, resource: this.samp.mask },
        { binding: 3, resource: this.boundPolar ?? this.dummyPolar },
        { binding: 4, resource: this.samp.polar },
        { binding: 5, resource: this.bloomTex.createView() },
        { binding: 6, resource: this.hazeTex.createView() },
        { binding: 7, resource: this.samp.haze },
      ],
    });
    this.bindDirty = false;
  }

  setSignMask(source: TexImageSource, data?: LightMaskData): void {
    this.signTex?.destroy();
    if (data) {
      // round 33: every mip level from JS bytes, rows already bottom-up
      this.signTex = uploadMask(this.device, data);
      this.bloomTex?.destroy();
      this.bloomTex = uploadBloom(this.device, data.bloom);
      this.mask = {
        size: data.size,
        inkBox: data.inkBox,
        revision: (this.mask?.revision ?? 0) + 1,
        bloom: data.bloom,
      };
      this.polar?.invalidate();
    } else {
      // the pre-round-33 upload, verbatim — a mask without exact data is marched
      const w = 'width' in source ? (source.width as number) : 0;
      const h = 'height' in source ? (source.height as number) : 0;
      if (!w || !h) return;
      this.signTex = gpuTexture(this.device, [w, h], 'rgba8unorm', true);
      this.device.queue.copyExternalImageToTexture(
        { source, flipY: true }, // top row -> v=0 (p.y is down), matches WebGL2
        { texture: this.signTex },
        [w, h],
      );
      this.mask = null;
    }
    this.signView = this.signTex.createView();
    this.bindDirty = true;
    this.hasMask = 1;
  }

  setDebug(d: { ditherAmp?: number; jitOffset?: number; frame?: number }): void {
    Object.assign(this.debug, d);
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
    // round 33: exact unless asked otherwise or unable — reported back truthfully
    const want: RaysMode = s.rays ?? 'exact';
    const exact = want !== 'march' && this.polar !== null && this.mask !== null && s.slitMix > 0.001;
    const mode: RaysMode = exact ? want : 'march';
    this.raysActive = mode;
    const f = exact ? exactFrame(s, this.mask!, mode, s.polarTheta ?? 2048) : null;

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
    d[68] = p.lightR;
    d[69] = p.lightG;
    d[70] = p.lightB;
    d[71] = this.debug.frame >= 0 ? this.debug.frame : this.frameNo; // p10.w: dither seed
    d[72] = s.hoverDir[0];
    d[73] = s.hoverDir[1];
    d[74] = s.hoverAmt;
    d[75] = s.raySteps; // p11.w
    // ---- round 33: p12–p18 --------------------------------------------------
    d[83] = RAYS_CODE[mode]; // p13.w
    d[87] = this.debug.ditherAmp * (s.dither ?? 1); // p14.w
    d[91] = this.debug.jitOffset; // p15.w
    d[96] = p.haze;
    d[97] = p.hazeScale;
    d[98] = p.hazeDrift;
    d[99] = p.hazeWind;
    d[102] = p.rayEdge;
    if (f) {
      const k = f.kernel;
      const b = this.mask!.bloom;
      d.set(k.kc, 76); // p12
      d[80] = f.c[0];
      d[81] = f.c[1];
      d[82] = f.sLast;
      d[84] = k.a;
      d[85] = k.wb;
      d[86] = f.maskLod;
      d[88] = f.nTheta;
      d[89] = f.nS;
      d[92] = b.pad;
      d[93] = b.dissolve;
      d[94] = 1 / (1 + 2 * b.pad);
      d[100] = k.lambda;
      d[101] = k.g;
    }
    this.device.queue.writeBuffer(this.ubuf, 0, d);

    const enc = this.device.createCommandEncoder();
    if (f) {
      this.polar!.encode(enc, f, this.signView, this.samp.mask, this.mask!.size);
      if (this.polar!.view !== this.boundPolar) this.bindDirty = true;
    }
    if (this.bindDirty) this.rebuildBind();
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
    if (s.scissorPx) {
      // must lie inside the target, in whole pixels, or validation fails the pass
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const x = Math.max(0, Math.min(cw, Math.floor(s.scissorPx[0])));
      const y = Math.max(0, Math.min(ch, Math.floor(s.scissorPx[1])));
      const w = Math.max(0, Math.min(cw - x, Math.ceil(s.scissorPx[2])));
      const h = Math.max(0, Math.min(ch - y, Math.ceil(s.scissorPx[3])));
      pass.setScissorRect(x, y, w, h);
    }
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.frameNo = (this.frameNo + 1) & 0xffff;
  }

  destroy(): void {
    this.signTex?.destroy();
    this.bloomTex?.destroy();
    this.hazeTex?.destroy();
    this.polar?.destroy();
    this.ubuf?.destroy();
    this.device?.destroy();
  }
}
