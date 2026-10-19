import wgsl from './rayPolar.wgsl?raw';
import type { ExactFrame } from '../exactLight';

/**
 * The exact light's three polar passes on WebGPU (round 33) — the twin of
 * `webgl2/polarPasses.ts`; see that file and `rayPolar.wgsl` for the why.
 *
 * WebGPU core guarantees every format this needs (rgba8unorm, rgba32uint,
 * rgba16float renderable and filterable), so there is no fallback chain here.
 * Pipelines come from `createRenderPipelineAsync`: a WGSL error must REJECT —
 * the synchronous call never throws, and an invalid pipeline renders nothing,
 * which is the blank page this project promises never to show.
 */
export class GPUPolarPasses {
  builds = 0;
  private ubuf: GPUBuffer;
  private data = new Float32Array(8);
  private t1: GPUTexture | null = null;
  private t2: GPUTexture | null = null;
  private t3: GPUTexture | null = null;
  private v3: GPUTextureView | null = null;
  private groups: GPUBindGroup[] | null = null;
  private groupsFor: GPUTextureView | null = null;
  private dims = { nTheta: 0, nS: 0 };
  private lastKey = '';

  private constructor(
    private device: GPUDevice,
    private pipes: GPURenderPipeline[],
  ) {
    this.ubuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  static async create(device: GPUDevice): Promise<GPUPolarPasses | null> {
    try {
      const module = device.createShaderModule({ code: wgsl });
      const mk = (entryPoint: string, format: GPUTextureFormat) =>
        device.createRenderPipelineAsync({
          layout: 'auto',
          vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint, targets: [{ format }] },
          primitive: { topology: 'triangle-list' },
        });
      const pipes = await Promise.all([
        mk('fsBins', 'rgba8unorm'),
        mk('fsPrefix', 'rgba32uint'),
        mk('fsNormalize', 'rgba16float'),
      ]);
      return new GPUPolarPasses(device, pipes);
    } catch (err) {
      console.warn('[kresty] exact light: WebGPU polar passes unavailable', err);
      return null;
    }
  }

  /** the texture the final pass samples (rgba16float, repeat on θ) */
  get view(): GPUTextureView | null {
    return this.v3;
  }

  private alloc(nTheta: number, nS: number) {
    for (const t of [this.t1, this.t2, this.t3]) t?.destroy();
    const tex = (h: number, format: GPUTextureFormat) =>
      this.device.createTexture({
        size: [nTheta, h],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.t1 = tex(nS / 4, 'rgba8unorm');
    this.t2 = tex(nS / 16, 'rgba32uint');
    this.t3 = tex(nS, 'rgba16float');
    this.v3 = this.t3.createView();
    this.dims = { nTheta, nS };
    this.groups = null;
    this.lastKey = '';
  }

  /** forget the last key — the mask texture changed under the same numbers */
  invalidate() {
    this.lastKey = '';
    this.groups = null;
  }

  /**
   * Append the three passes to `enc`, unless nothing they depend on moved.
   * Returns true when it rebuilt.
   */
  encode(enc: GPUCommandEncoder, f: ExactFrame, mask: GPUTextureView, samp: GPUSampler, maskSize: number): boolean {
    if (f.key === this.lastKey && this.groupsFor === mask) return false;
    if (f.nTheta !== this.dims.nTheta || f.nS !== this.dims.nS) this.alloc(f.nTheta, f.nS);
    if (!this.groups || this.groupsFor !== mask) {
      const ub = { binding: 0, resource: { buffer: this.ubuf } };
      const [p1, p2, p3] = this.pipes;
      this.groups = [
        this.device.createBindGroup({
          layout: p1.getBindGroupLayout(0),
          entries: [ub, { binding: 1, resource: mask }, { binding: 2, resource: samp }],
        }),
        this.device.createBindGroup({
          layout: p2.getBindGroupLayout(0),
          entries: [ub, { binding: 3, resource: this.t1!.createView() }],
        }),
        this.device.createBindGroup({
          layout: p3.getBindGroupLayout(0),
          entries: [
            ub,
            { binding: 3, resource: this.t1!.createView() },
            { binding: 4, resource: this.t2!.createView() },
          ],
        }),
      ];
      this.groupsFor = mask;
    }
    const d = this.data;
    d[0] = f.c[0];
    d[1] = f.c[1];
    d[2] = f.nTheta;
    d[3] = f.ds;
    d[4] = maskSize;
    d[5] = f.lodFloor;
    d[6] = f.penLod;
    d[7] = f.edge;
    this.device.queue.writeBuffer(this.ubuf, 0, d);
    const targets = [this.t1!, this.t2!, this.t3!];
    for (let i = 0; i < 3; i++) {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view: targets[i].createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
        ],
      });
      pass.setPipeline(this.pipes[i]);
      pass.setBindGroup(0, this.groups[i]);
      pass.draw(3);
      pass.end();
    }
    this.lastKey = f.key;
    this.builds++;
    return true;
  }

  destroy() {
    for (const t of [this.t1, this.t2, this.t3]) t?.destroy();
    this.ubuf.destroy();
  }
}
