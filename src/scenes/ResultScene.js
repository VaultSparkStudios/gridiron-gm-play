// ResultScene: brief flash scene — currently handled inline by HudScene text.
// Reserved for expanded play-result cards in a future polish pass.
import { state } from '../data/gameState.js';

export class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }
  create() { this.scene.stop(); } // no-op placeholder
}
