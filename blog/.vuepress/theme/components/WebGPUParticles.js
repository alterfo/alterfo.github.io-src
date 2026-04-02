// WebGPU Particles System
// Shaders loaded from external .wgsl files

// Beautiful color palette
const COLORS = [
  [0.1, 0.8, 1.0],   // Cyan
  [1.0, 0.2, 0.5],   // Pink
  [0.5, 1.0, 0.3],   // Green
  [1.0, 0.6, 0.1],   // Orange
  [0.7, 0.3, 1.0],   // Purple
  [0.2, 1.0, 0.8],   // Teal
  [1.0, 0.9, 0.2],   // Gold
  [1.0, 0.3, 0.3],   // Red
];

// Shader sources loaded at init
let computeShaderCode = '';
let renderShaderCode = '';
let pointShaderCode = '';

async function loadShaders() {
  if (computeShaderCode) return; // Already loaded
  
  const [compute, render, point] = await Promise.all([
    fetch('/particles/compute.wgsl').then(r => r.text()),
    fetch('/particles/render.wgsl').then(r => r.text()),
    fetch('/particles/point.wgsl').then(r => r.text()),
  ]);
  
  computeShaderCode = compute;
  renderShaderCode = render;
  pointShaderCode = point;
}

export class WebGPUParticles {
  constructor(canvas) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.particlesBuffer = null;
    this.paramsBuffer = null;
    this.computePipeline = null;
    this.linePipeline = null;
    this.pointPipeline = null;
    this.computeBindGroup = null;
    this.lineBindGroup = null;
    this.pointBindGroup = null;
    this.particleCount = 0;
    this.maxConnections = 8;
    this.params = {
      width: 800,
      height: 400,
      deltaTime: 0.016,
      connectDistance: 120.0,
    };
    this.animationId = null;
    this.startTime = Date.now();
  }

  getRandomColor() {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return color;
  }

  async init(width, height) {
    if (!navigator.gpu) {
      console.warn('WebGPU not supported');
      return false;
    }

    // Load shaders from external files
    await loadShaders();

    this.params.width = width;
    this.params.height = height;

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.warn('Failed to get GPU adapter');
      return false;
    }

    this.device = await adapter.requestDevice();

    this.context = this.canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: format,
      alphaMode: 'premultiplied',
    });

    this.particleCount = Math.floor(height / 2.5);
    const bufferSize = this.particleCount * 32;

    const particleData = new Float32Array(this.particleCount * 8);
    for (let i = 0; i < this.particleCount; i++) {
      const offset = i * 8;
      const color = this.getRandomColor();
      
      particleData[offset] = Math.random() * width;
      particleData[offset + 1] = Math.random() * height;
      particleData[offset + 2] = 0.3 + Math.random() * 1.2;
      particleData[offset + 3] = Math.random() * 360;
      particleData[offset + 4] = color[0];
      particleData[offset + 5] = color[1];
      particleData[offset + 6] = color[2];
      particleData[offset + 7] = 0.4 + Math.random() * 0.5;
    }

    this.particlesBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.particlesBuffer.getMappedRange()).set(particleData);
    this.particlesBuffer.unmap();

    this.paramsBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Compute pipeline
    const computeModule = this.device.createShaderModule({ code: computeShaderCode });
    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'updateParticles' },
    });

    // Line render pipeline
    const renderModule = this.device.createShaderModule({ code: renderShaderCode });
    this.linePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: renderModule,
        entryPoint: 'vsLine',
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fsLine',
        targets: [{
          format: format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'src-alpha',
              dstFactor: 'one',
              operation: 'add',
            },
          },
        }],
      },
      primitive: {
        topology: 'line-list',
      },
    });

    // Point render pipeline
    const pointModule = this.device.createShaderModule({ code: pointShaderCode });
    this.pointPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: pointModule,
        entryPoint: 'vsPoint',
      },
      fragment: {
        module: pointModule,
        entryPoint: 'fsPoint',
        targets: [{
          format: format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'src-alpha',
              dstFactor: 'one',
              operation: 'add',
            },
          },
        }],
      },
      primitive: {
        topology: 'point-list',
      },
    });

    // Bind groups
    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particlesBuffer } },
        { binding: 1, resource: { buffer: this.paramsBuffer } },
      ],
    });

    this.lineBindGroup = this.device.createBindGroup({
      layout: this.linePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particlesBuffer } },
        { binding: 1, resource: { buffer: this.paramsBuffer } },
      ],
    });

    this.pointBindGroup = this.device.createBindGroup({
      layout: this.pointPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particlesBuffer } },
        { binding: 1, resource: { buffer: this.paramsBuffer } },
      ],
    });

    return true;
  }

  resize(width, height) {
    this.params.width = width;
    this.params.height = height;
    this.particleCount = Math.floor(height / 2.5);
  }

  render() {
    if (!this.device) return;

    const time = (Date.now() - this.startTime) / 1000;
    this.params.deltaTime = time;

    const commandEncoder = this.device.createCommandEncoder();

    const paramsData = new Float32Array([
      this.params.width,
      this.params.height,
      this.params.deltaTime,
      this.params.connectDistance,
    ]);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
    computePass.end();

    const textureView = this.context.getCurrentTexture().createView();
    
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.008, g: 0.008, b: 0.015, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    renderPass.setPipeline(this.linePipeline);
    renderPass.setBindGroup(0, this.lineBindGroup);
    renderPass.draw(2, this.particleCount * this.maxConnections);

    renderPass.setPipeline(this.pointPipeline);
    renderPass.setBindGroup(0, this.pointBindGroup);
    renderPass.draw(1, this.particleCount);

    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  start() {
    this.startTime = Date.now();
    const loop = () => {
      this.render();
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  destroy() {
    this.stop();
    if (this.particlesBuffer) this.particlesBuffer.destroy();
    if (this.paramsBuffer) this.paramsBuffer.destroy();
    if (this.context) this.context.unconfigure();
    this.device = null;
  }
}

export function isWebGPUSupported() {
  return !!navigator.gpu;
}
