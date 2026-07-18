package com.nexryde.app.driver

enum class OverlayPhase {
  HIDDEN,
  ONLINE,
  OFFER,
  COUNTDOWN,
  ACCEPTING,
  DECLINING,
  ON_TRIP
}

data class OverlayOffer(
  val tripId: String = "",
  val offerId: String = "",
  val riderName: String = "Rider",
  val pickup: String = "Pickup location",
  val fare: String = "--",
  val eta: String = "--",
  val distance: String = "--"
) {
  fun toMap(): Map<String, String> = mapOf(
    "tripId" to tripId,
    "offerId" to offerId,
    "riderName" to riderName,
    "pickup" to pickup,
    "fare" to fare,
    "eta" to eta,
    "distance" to distance
  )

  companion object {
    fun from(raw: Map<String, String>): OverlayOffer {
      return OverlayOffer(
        tripId = raw["tripId"].orEmpty(),
        offerId = raw["offerId"].orEmpty(),
        riderName = raw["riderName"]?.takeIf { it.isNotBlank() } ?: "Rider",
        pickup = raw["pickup"]?.takeIf { it.isNotBlank() } ?: "Pickup location",
        fare = raw["fare"]?.takeIf { it.isNotBlank() } ?: "--",
        eta = raw["eta"]?.takeIf { it.isNotBlank() } ?: "--",
        distance = raw["distance"]?.takeIf { it.isNotBlank() } ?: "--"
      )
    }
  }
}

data class OverlayState(
  val phase: OverlayPhase = OverlayPhase.HIDDEN,
  val offer: OverlayOffer? = null,
  val countdownSeconds: Int = 0,
  val message: String? = null
) {
  val isExpanded: Boolean
    get() = phase == OverlayPhase.OFFER ||
      phase == OverlayPhase.COUNTDOWN ||
      phase == OverlayPhase.ACCEPTING ||
      phase == OverlayPhase.DECLINING
}

class OverlayStateManager {
  var state: OverlayState = OverlayState()
    private set

  fun hide(): OverlayState = set(OverlayState(phase = OverlayPhase.HIDDEN))

  fun online(): OverlayState = set(OverlayState(phase = OverlayPhase.ONLINE))

  fun onTrip(): OverlayState = set(OverlayState(phase = OverlayPhase.ON_TRIP))

  fun offer(offer: OverlayOffer, countdownSeconds: Int): OverlayState =
    set(OverlayState(phase = OverlayPhase.OFFER, offer = offer, countdownSeconds = countdownSeconds))

  fun countdown(seconds: Int): OverlayState =
    set(state.copy(phase = OverlayPhase.COUNTDOWN, countdownSeconds = seconds))

  fun accepting(): OverlayState =
    set(state.copy(phase = OverlayPhase.ACCEPTING, message = "Securing ride..."))

  fun declining(): OverlayState =
    set(state.copy(phase = OverlayPhase.DECLINING, message = "Closing request..."))

  fun failed(message: String): OverlayState =
    set(state.copy(phase = OverlayPhase.OFFER, message = message))

  private fun set(next: OverlayState): OverlayState {
    state = next
    return next
  }
}
