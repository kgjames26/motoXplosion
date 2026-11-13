/**
 * v2.51: speeds shown to the player. The game world is a little small for its bikes, so the raw
 * m/s → km/h figure read low against what the riding feels like (and against real motocross).
 * Every displayed speed goes through this; the physics is unchanged.
 */
export const SPEED_DISPLAY = 1.35;
/** m/s → displayed km/h. */
export const KMH = 3.6 * SPEED_DISPLAY;
