import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { FieldScene } from './scenes/FieldScene.js';
import { HudScene } from './scenes/HudScene.js';
import { PlayCallScene } from './scenes/PlayCallScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

const W = 800, H = 520;

const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  backgroundColor: '#0a0f1a',
  parent: document.body,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, FieldScene, HudScene, PlayCallScene, ResultScene, GameOverScene],
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  }
};

export const game = new Phaser.Game(config);
export { W, H };
