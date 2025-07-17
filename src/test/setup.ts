import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock WebAssembly
global.WebAssembly = {
  instantiate: vi.fn(),
  compile: vi.fn(),
  validate: vi.fn(),
  Module: vi.fn(),
  Instance: vi.fn(),
  Memory: vi.fn(),
  Table: vi.fn(),
  CompileError: Error,
  RuntimeError: Error,
  LinkError: Error,
} as any;

// Mock Pyodide
vi.mock('pyodide', () => ({
  loadPyodide: vi.fn(() => Promise.resolve({
    runPython: vi.fn(),
    loadPackage: vi.fn(() => Promise.resolve()),
  })),
}));

// Mock WASM modules
vi.mock('../../rust-formatter/pkg', () => ({
  default: vi.fn(() => Promise.resolve()),
  DocumentFormatter: vi.fn(() => ({
    set_config: vi.fn(),
    format_document: vi.fn(() => new Uint8Array([1, 2, 3])),
  })),
}));

// Mock File API
global.File = class File {
  name: string;
  size: number;
  type: string;
  lastModified: number;

  constructor(bits: any[], name: string, options: any = {}) {
    this.name = name;
    this.size = bits.reduce((acc, bit) => acc + (bit.length || 0), 0);
    this.type = options.type || '';
    this.lastModified = options.lastModified || Date.now();
  }

  arrayBuffer() {
    return Promise.resolve(new ArrayBuffer(this.size));
  }

  text() {
    return Promise.resolve('');
  }

  stream() {
    return new ReadableStream();
  }

  slice() {
    return new File([], this.name);
  }
} as any;

// Mock Blob
global.Blob = class Blob {
  size: number;
  type: string;

  constructor(parts: any[] = [], options: any = {}) {
    this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0);
    this.type = options.type || '';
  }

  arrayBuffer() {
    return Promise.resolve(new ArrayBuffer(this.size));
  }

  text() {
    return Promise.resolve('');
  }

  stream() {
    return new ReadableStream();
  }

  slice() {
    return new Blob();
  }
} as any;

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock Worker
global.Worker = class Worker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor(public url: string) {}

  postMessage(data: any) {
    // Mock worker response
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data: { type: 'ready' } }));
      }
    }, 0);
  }

  terminate() {}
} as any;