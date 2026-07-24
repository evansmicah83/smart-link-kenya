import { describe, expect, it } from 'vitest';
import { buildProvisioningTemplate, inferServiceTypeFromPackage } from './templates';

describe('provisioning templates', () => {
  it('maps billing packages to PPPoE or Hotspot services', () => {
    expect(inferServiceTypeFromPackage('pppoe', 'hotspot')).toBe('pppoe');
    expect(inferServiceTypeFromPackage('hotspot', 'pppoe')).toBe('hotspot');
    expect(inferServiceTypeFromPackage(undefined, 'pppoe')).toBe('pppoe');
  });

  it('builds tenant-aware provisioning settings from branding and router config', () => {
    const template = buildProvisioningTemplate(
      { company_name: 'Netrunner ISP' },
      { services: ['pppoe', 'hotspot'], bridgePort: 'ether2', subnet: '192.168.10.0/24' },
    );

    expect(template.tenantSlug).toBe('netrunner-isp');
    expect(template.bridgeName).toBe('netrunner-isp-bridge');
    expect(template.services).toEqual(['pppoe', 'hotspot']);
    expect(template.bridgePort).toBe('ether2');
    expect(template.subnet).toBe('192.168.10.0/24');
  });
});
