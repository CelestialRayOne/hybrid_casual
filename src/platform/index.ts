// Platform layer entry point. `src/main.ts` composes these; game code depends only on the interfaces.

import { type Platform, crazyGamesPlatform, findCrazyGamesSdk, noopPlatform } from './crazygames';

export { type Ads, noopAds } from './ads';
export {
  type AudioService, type PlayOptions, type SoundId, POWER_SOUND_FOR_COLOR, SOUND_IDS, clearPitchForGroupSize, nullAudio,
  synthAudio, zzfxAudio,
} from './audio';
export {
  type CrazyGamesSdk, type DeviceType, type Platform, crazyGamesPlatform, noopPlatform,
} from './crazygames';
export { onVisibilityChange } from './lifecycle';
export { type SafeArea, readSafeArea } from './safearea';
export {
  type Migrations, type SaveStore, DEFAULT_SAVE_KEY, SAVE_VERSION, defaultProgress, kvSaveStore,
  localStorageSaveStore, memorySaveStore,
} from './save';
export { type KeyValue, safeLocalStorage } from './storage';

/** CrazyGames wrapper when the SDK script loaded (it no-ops itself on 'disabled' hosts), else a plain no-op. */
export function createPlatform(): Platform {
  return findCrazyGamesSdk() ? crazyGamesPlatform() : noopPlatform();
}
