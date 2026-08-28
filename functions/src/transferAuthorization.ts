export function isTransferSourceAuthorized(
  actualOwnerUserId: unknown,
  authenticatedSenderUserId: string,
): boolean {
  return typeof actualOwnerUserId === 'string'
    && actualOwnerUserId === authenticatedSenderUserId
}
