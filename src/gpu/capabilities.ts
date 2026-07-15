export type Backend = 'webgpu' | 'webgl2';

/**
 * Presence of navigator.gpu does not guarantee a working adapter
 * (headless, blocklisted GPUs, corporate policies) — actually probe it,
 * with a timeout, and fall back to WebGL2 on any failure.
 */
export async function selectBackend(): Promise<Backend> {
  const forced = new URLSearchParams(location.search).get('backend');
  if (forced === 'webgl2' || forced === 'webgpu') return forced;
  if (!('gpu' in navigator) || !navigator.gpu) return 'webgl2';
  try {
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return adapter ? 'webgpu' : 'webgl2';
  } catch {
    return 'webgl2';
  }
}
