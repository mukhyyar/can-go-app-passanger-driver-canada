/** Allowed limited-time offer durations (seconds). */
export const OFFER_VALIDITY_OPTIONS_SECONDS = [
  30 * 60,
  60 * 60,
  2 * 60 * 60,
  8 * 60 * 60,
  12 * 60 * 60,
  24 * 60 * 60,
  2 * 24 * 60 * 60,
  4 * 24 * 60 * 60,
  6 * 24 * 60 * 60,
] as const;

export type OfferValiditySeconds =
  (typeof OFFER_VALIDITY_OPTIONS_SECONDS)[number];

export const OFFER_OPTION_KEYS = [
  'wifi',
  'charger',
  'water',
  'wheelchair',
  'name_sign',
  'child_seat',
  'booster_seat',
  'extra_luggage',
  'flight_tracking',
  'meet_greet',
  'pet_friendly',
  'air_conditioner',
] as const;

export type OfferOptionKey = (typeof OFFER_OPTION_KEYS)[number];

export function isAllowedOfferValidity(seconds: number): boolean {
  return (OFFER_VALIDITY_OPTIONS_SECONDS as readonly number[]).includes(
    seconds,
  );
}
