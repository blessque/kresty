import type { RayFieldRenderer, RayFieldState } from '../rayFieldTypes';
import wgsl from './rayField.wgsl?raw';

const FLOATS = 48; // 12 × vec4f = 192 bytes

export class WebGPURayFieldRenderer implements RayFieldRenderer {
  readonly backend = 'webgpu' as const;
  private device!: GPUDevice;
  private ctx!: GPUCanvasContext;
  private pipeline!: GPURenderPipeline;
  private ubuf!: GPUBuffer;
  private bind!: GPUBindGroup;
  private data = new Float32Array(FLOATS);
  private canvas!: HTMLCanvasElement;

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
    this.bind = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.ubuf } }],
    });
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
    d.set(s.beamHover, 16);
    d[20] = p.primaryK;
    d[21] = p.primaryIntensity;
    d[22] = p.falloffL;
    d[23] = p.coreRadius;
    d[24] = p.coreIntensity;
    d[25] = p.crossSize;
    d[26] = p.crossIntensity;
    d[27] = p.secCount;
    d[28] = p.secK;
    d[29] = p.secIntensity;
    d[30] = p.rotSpeed;
    d[31] = p.dustAmount;
    d[32] = p.dustScale;
    d[33] = p.moteAmount;
    d[34] = p.grain;
    d[35] = p.ca;
    d[36] = p.hazeBase;
    d[37] = p.channelDark;
    d[38] = p.parallax;
    d[39] = p.breathe;
    d[40] = p.hoverMode;
    d[41] = p.compositeMode;
    d[42] = s.bgMix;
    d[43] = s.layers;
    d[44] = s.octaves;
    d[45] = p.refraction;
    d[46] = p.shimmer;
    d[47] = s.sceneDim;
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
    this.ubuf?.destroy();
    this.device?.destroy();
  }
}
