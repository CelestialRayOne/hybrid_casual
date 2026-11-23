# THIRD_PARTY.md

Third-party **code** that ships in the game build. (Assets are logged in `ASSETS.md`.) Licences verified from
`node_modules/<pkg>/package.json` and `LICENSE` files on 2026-11-20.

| Package | Version | Licence | Copyright | Source | How it is used |
|---|---|---|---|---|---|
| phaser | 4.2.1 | MIT | (c) 2026 Richard Davey, Phaser Studio Inc. | https://github.com/phaserjs/phaser (licence: `node_modules/phaser/LICENSE.md`) | npm dependency, bundled |

The CrazyGames SDK is loaded at runtime from `https://sdk.crazygames.com/crazygames-sdk-v3.js` and is not bundled.

## Sound synthesis (no third-party code)

All sound effects are synthesized by our own code in `src/platform/audio/dsp.ts` and `src/platform/sounds.ts`
(v2, 2026-11-20). It replaces the ZzFX port used in v1, which has been removed. The building blocks are textbook
public algorithms, written from scratch: a recursive modal oscillator, two-operator FM, a zero-delay-feedback
state-variable filter, and a Schroeder-style reverb (damped combs into allpasses; the allpass lengths follow the
public-domain Freeverb design). No third-party code is vendored.
