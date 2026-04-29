export function r2EndpointFromAccountId(
  accountId: string,
  jurisdiction?: string,
) {
  const normalizedJurisdiction = jurisdiction?.trim().toLowerCase();
  const jurisdictionSegment = normalizedJurisdiction
    ? `.${normalizedJurisdiction}`
    : "";
  return `https://${accountId}${jurisdictionSegment}.r2.cloudflarestorage.com`;
}
