import { vi } from "vitest";

export const renderMikrotikRateLimit = vi.fn(() => "10M/10M");
export const adapterFactory = { get: vi.fn(), create: vi.fn() };
export const sessionService = {};
export const authService = {};
export const bandwidthService = {};
export const MikrotikRestAdapter = vi.fn();
export const MikrotikUserManagerAdapter = vi.fn();
