/**
 * Ads behind a small interface. The MVP (CrazyGames Basic Launch) ships `noopAds()` only.
 *
 * A future CrazyGames implementation (Full Launch only, see CLAUDE.md "CrazyGames integration") must:
 * - show ads only at natural breaks (level end, between levels), never mid-move;
 * - pause the game and block input when an ad is requested;
 * - mute all audio on ad start; unmute and resume on finish or on error;
 * - grant a reward only on `adFinished`, never on error or skip;
 * - handle the error codes `adsDisabled`, `unfilled`, `adblock`, `adCooldown` and `other` by resolving
 *   'skipped' (never rejecting, never blocking progress);
 * - keep the game fully playable with an adblocker.
 * Callers treat `enabled === false` as "do not offer ad-based features at all" (e.g. hide a rewarded button).
 */
export interface Ads {
  readonly enabled: boolean;
  /** Interstitial at a natural break. Resolves when the game may continue; never rejects. */
  midgame(): Promise<'shown' | 'skipped'>;
  /** Rewarded ad. 'rewarded' only if the ad finished. Never rejects. */
  rewarded(): Promise<'rewarded' | 'skipped'>;
}

export function noopAds(): Ads {
  return {
    enabled: false,
    midgame: async () => 'skipped',
    rewarded: async () => 'skipped',
  };
}
