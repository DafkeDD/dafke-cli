/**
 * Azure DevOps helper utilities shared across wizard steps and commands.
 */

/** Extract Azure DevOps organization name from an org URL. */
export function extractOrgFromUrl(orgUrl: string): string | null {
  // https://dev.azure.com/dafkenv → dafkenv
  const match = orgUrl.match(/dev\.azure\.com\/([^/]+)/);
  return match?.[1] ?? null;
}
