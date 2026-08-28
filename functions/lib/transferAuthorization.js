export function isTransferSourceAuthorized(actualOwnerUserId, authenticatedSenderUserId) {
    return typeof actualOwnerUserId === 'string'
        && actualOwnerUserId === authenticatedSenderUserId;
}
