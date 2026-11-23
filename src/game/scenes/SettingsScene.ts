// Settings: sound toggle, restart level, a small reset-progress button (with confirmation) and the credits line. No fullscreen, no links.
import * as K from '../art/keys';
import { defaultProgress } from '../../platform';
import { ctx, getServices } from '../services';
import { STRINGS } from '../strings';
import { Button } from '../ui/widgets';
import { Overlay, type OverlayData } from './Overlay';

export interface SettingsData extends OverlayData {
  onReset: () => void;
  /** Starts this level again (a new attempt). */
  onRestart: () => void;
}

export class SettingsScene extends Overlay<SettingsData> {
  static readonly KEY = 'Settings';
  private confirming = false;

  constructor() {
    super(SettingsScene.KEY);
  }

  override init(data: SettingsData): void {
    super.init(data);
    this.confirming = false;
  }

  protected override onBackdrop(): void {
    if (!this.confirming) this.close();
  }

  protected buildContent(): void {
    if (this.confirming) this.buildConfirm();
    else this.buildMain();
  }

  private buildMain(): void {
    const u = this.unitFor(8, 8.9);
    const a = this.area();
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const w = u * 6.8;
    const h = u * 6.6;
    const top = cy - h / 2;
    const p = this.panel(cx, cy, w, h);
    p.setInteractive();
    this.titlePlate(cx, top, w * 0.7, STRINGS.settingsTitle, u);
    this.root.add(new Button(this, this.m, { x: cx - w / 2 + u * 0.3, y: top + u * 0.05, w: u * 1.0, h: u * 1.0, icon: K.ICON_BACK, kind: 'icon', onClick: () => this.close(), id: 'settings.close' }));

    const sv = getServices();
    const c = ctx();
    const on = c.soundOn();
    const bw = u * 5.0;
    const bh = u * 1.15;
    const sound = new Button(this, this.m, {
      x: cx, y: top + u * 1.75, w: bw, h: bh,
      label: `${STRINGS.sound}: ${on ? STRINGS.on : STRINGS.off}`,
      icon: on ? K.ICON_SOUND_ON : K.ICON_SOUND_OFF,
      kind: on ? 'primary' : 'secondary',
      onClick: () => {
        c.setSound(!c.soundOn());
        sv.audio.play('ui_click');
        this.build();
      },
      id: 'settings.sound',
    });
    this.root.add(sound);
    if (sv.platform.isMutedByHost()) this.text(cx, top + u * 2.6, STRINGS.mutedByHost, this.f.small, '#8a5a34');

    const restart = new Button(this, this.m, {
      x: cx, y: top + u * 3.3, w: bw, h: bh, label: STRINGS.restartLevel, icon: K.ICON_RESTART, kind: 'secondary',
      onClick: () => this.d.onRestart(),
      id: 'settings.restart',
    });
    this.root.add(restart);
    this.text(cx, top + u * 4.12, STRINGS.restartNote, this.f.small, '#8a5a34');

    this.text(cx, top + u * 5.0, STRINGS.credits, this.f.small, '#8a5a34', w * 0.9);

    // Reset progress is deliberately small and tucked in the bottom corner (it still asks to confirm).
    const rs = u * 0.72;
    const rx = cx + w / 2 - u * 0.6;
    const ry = top + h - u * 0.62;
    const reset = new Button(this, this.m, {
      x: rx, y: ry, w: rs, h: rs, icon: K.ICON_BIN, kind: 'icon',
      onClick: () => {
        this.confirming = true;
        this.build();
      },
      id: 'settings.reset',
    });
    this.root.add(reset);
    this.text(rx - rs * 0.65, ry, STRINGS.resetProgress, this.f.small * 0.8, '#a0704a').setOrigin(1, 0.5);
  }

  private buildConfirm(): void {
    const u = this.unitFor(8, 7);
    const a = this.area();
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const w = u * 6.8;
    const h = u * 4.8;
    const top = cy - h / 2;
    const p = this.panel(cx, cy, w, h);
    p.setInteractive();
    this.text(cx, top + u * 0.9, STRINGS.resetConfirmTitle, u * 0.55, '#4a2a14', w * 0.9);
    this.text(cx, top + u * 1.85, STRINGS.resetConfirmBody, this.f.body, '#6b3d1c', w * 0.85);
    const bw = u * 2.7;
    const bh = u * 1.1;
    const yes = new Button(this, this.m, {
      x: cx - bw / 2 - u * 0.15, y: top + u * 3.5, w: bw, h: bh, label: STRINGS.resetYes, kind: 'danger',
      onClick: () => void this.doReset(),
      id: 'settings.resetYes',
    });
    const no = new Button(this, this.m, {
      x: cx + bw / 2 + u * 0.15, y: top + u * 3.5, w: bw, h: bh, label: STRINGS.cancel,
      onClick: () => {
        this.confirming = false;
        this.build();
      },
      id: 'settings.resetNo',
    });
    this.root.add([yes, no]);
  }

  private async doReset(): Promise<void> {
    const sv = getServices();
    const c = ctx();
    const sound = c.soundOn();
    try {
      await sv.save.reset();
    } catch {
      // The store falls back to memory; the in-memory reset below still applies.
    }
    c.perksOff = false;
    // Keep the player's sound preference: resetting progress is not resetting settings.
    c.setProgress({ ...defaultProgress(), settings: { sound } });
    sv.telemetry.log('progress_reset');
    this.d.onReset();
  }
}
