import type { LightMaskData } from '../rayFieldTypes';
import { HAZE_SIZE, hazeNoise } from '../hazeNoise';

/**
 * The exact light's textures and samplers on WebGPU (round 33) — the twin of
 * `webgl2/glTextures.ts`. `writeTexture` has no flip, so every upload here
 * carries rows that are ALREADY bottom-up (`shared/lightMask.ts` did it once,
 * for both backends): the twins receive identical bytes.
 */

export function gpuTexture(
  device: GPUDevice,
  size: [number, number],
  format: GPUTextureFormat,
  attach = false,
  mips = 1,
): GPUTexture {
  return device.createTexture({
    size,
    format,
    mipLevelCount: mips,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      (attach ? GPUTextureUsage.RENDER_ATTACHMENT : 0),
  });
}

export interface LightSamplers {
  /** mask + bloom: clamp, linear, linear between mips */
  mask: GPUSampler;
  /** the polar Nₙ texture: θ wraps, s clamps */
  polar: GPUSampler;
  /** the haze FBM tiles */
  haze: GPUSampler;
}

export function createSamplers(device: GPUDevice): LightSamplers {
  return {
    mask: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    }),
    polar: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'clamp-to-edge',
    }),
    haze: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    }),
  };
}

/** the emblem mask, every mip level: rgba8unorm, bottom-up rows */
export function uploadMask(device: GPUDevice, data: LightMaskData): GPUTexture {
  const tex = gpuTexture(device, [data.size, data.size], 'rgba8unorm', false, data.levels.length);
  data.levels.forEach((lv, k) => {
    const n = Math.max(1, data.size >> k);
    device.queue.writeTexture({ texture: tex, mipLevel: k }, lv, { bytesPerRow: n * 4 }, [n, n]);
  });
  return tex;
}

/** the baked bloom: rg16float straight from the halves `lightMask` produced */
export function uploadBloom(device: GPUDevice, bloom: LightMaskData['bloom']): GPUTexture {
  const tex = gpuTexture(device, [bloom.size, bloom.size], 'rg16float');
  device.queue.writeTexture({ texture: tex }, bloom.halves, { bytesPerRow: bloom.size * 4 }, [bloom.size, bloom.size]);
  return tex;
}

/** the haze's tiling FBM: r8unorm, box mips (repeated by its sampler) */
export function createHaze(device: GPUDevice): GPUTexture {
  const levels = hazeNoise();
  const tex = device.createTexture({
    size: [HAZE_SIZE, HAZE_SIZE],
    mipLevelCount: levels.length,
    format: 'r8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  levels.forEach((lv, k) => {
    const n = Math.max(1, HAZE_SIZE >> k);
    device.queue.writeTexture({ texture: tex, mipLevel: k }, lv, { bytesPerRow: n }, [n, n]);
  });
  return tex;
}
