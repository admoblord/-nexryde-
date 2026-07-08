/** Module-level flag so driver-tabs layout can read offer state without prop drilling. */
let incomingOfferActive = false;

export function setDriverIncomingOfferActive(active: boolean): void {
  incomingOfferActive = active;
}

export function isDriverIncomingOfferActive(): boolean {
  return incomingOfferActive;
}
