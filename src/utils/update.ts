export interface UpdatePolicy {
  force: boolean;
  minimumVersionCode: number;
}

export function requiresForcedUpdate(installedVersionCode: number, policy: UpdatePolicy) {
  return policy.force
    && Number.isInteger(installedVersionCode)
    && Number.isInteger(policy.minimumVersionCode)
    && installedVersionCode < policy.minimumVersionCode;
}
