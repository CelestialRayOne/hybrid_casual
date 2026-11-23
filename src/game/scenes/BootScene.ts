// Boot: load the save, set up the shared game context, then go straight into the current level
// (first run lands in Level 1 gameplay; there is no title screen).
import Phaser from 'phaser';
import { defaultProgress } from '../../platform';
import { currentLevel } from '../progress';
import { GameContext, getServices, setContext } from '../services';
import { PlayScene, type PlayData } from './PlayScene';

export class BootScene extends Phaser.Scene {
  static readonly KEY = 'Boot';

  constructor() {
    super(BootScene.KEY);
  }

  create(): void {
    const sv = getServices();
    void sv.save
      .load()
      .catch(() => defaultProgress())
      .then((progress) => {
        const c = new GameContext(sv, progress);
        setContext(c);
        sv.audio.setEnabled(progress.settings.sound);
        this.scene.start(PlayScene.KEY, { level: currentLevel(progress) } satisfies PlayData);
      });
  }
}
