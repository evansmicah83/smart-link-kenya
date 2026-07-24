export interface ProvisioningTemplateConfig {
  companyName?: string | null;
  services?: string[];
  bridgePort?: string;
  subnet?: string;
}

export interface ProvisioningTemplate {
  tenantSlug: string;
  bridgeName: string;
  services: string[];
  bridgePort: string;
  subnet: string;
}

export function inferServiceTypeFromPackage(packageType?: string | null, fallback?: string | null): string {
  if (packageType === 'pppoe' || packageType === 'hotspot') return packageType;
  return fallback === 'hotspot' ? 'hotspot' : 'pppoe';
}

export function buildProvisioningTemplate(
  branding: { company_name?: string | null } | null | undefined,
  config: ProvisioningTemplateConfig | null | undefined,
): ProvisioningTemplate {
  const companyName = branding?.company_name ?? 'SmartLinkNet';
  const tenantSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'smartlinknet';
  const services = (config?.services ?? []).filter(Boolean);
  const bridgePort = config?.bridgePort && ['ether1', 'ether2'].includes(config.bridgePort) ? config.bridgePort : 'ether2';
  const subnet = config?.subnet && config.subnet.includes('/') ? config.subnet : '172.31.0.0/16';

  return {
    tenantSlug,
    bridgeName: `${tenantSlug}-bridge`,
    services: services.length ? services : ['pppoe'],
    bridgePort,
    subnet,
  };
}
