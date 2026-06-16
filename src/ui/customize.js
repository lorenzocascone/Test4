// ----------------------------------------------------------------------------
// Character customizer. Builds colour swatches + hat chips into the start screen
// and the in-game panel, and applies choices live to the Character instance.
// ----------------------------------------------------------------------------

import { CUSTOMIZE } from '../config.js';

const HAT_LABELS = { none: 'None', cap: 'Cap', cone: 'Wizard', crown: 'Crown', leaf: 'Leaf' };

export class Customizer {
  constructor(character, audio) {
    this.character = character;
    this.audio = audio;
    this.state = { body: CUSTOMIZE.body[0], accent: CUSTOMIZE.accent[0], hat: 'none' };

    // (containerId, kind) pairs — two of each so start screen & in-game stay synced.
    this._buildSwatches('swatches-body', 'body', CUSTOMIZE.body);
    this._buildSwatches('swatches-body-2', 'body', CUSTOMIZE.body);
    this._buildSwatches('swatches-accent', 'accent', CUSTOMIZE.accent);
    this._buildSwatches('swatches-accent-2', 'accent', CUSTOMIZE.accent);
    this._buildHats('hat-picker');
    this._buildHats('hat-picker-2');

    this.apply();
  }

  _buildSwatches(containerId, kind, colors) {
    const el = document.getElementById(containerId);
    if (!el) return;
    colors.forEach((hex) => {
      const sw = document.createElement('div');
      sw.className = 'swatch' + (this.state[kind] === hex ? ' selected' : '');
      sw.style.background = hex;
      sw.dataset.kind = kind;
      sw.dataset.value = hex;
      sw.addEventListener('click', () => this.select(kind, hex));
      el.appendChild(sw);
    });
  }

  _buildHats(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    CUSTOMIZE.hats.forEach((hat) => {
      const chip = document.createElement('div');
      chip.className = 'hat-chip' + (this.state.hat === hat ? ' selected' : '');
      chip.textContent = HAT_LABELS[hat] || hat;
      chip.dataset.kind = 'hat';
      chip.dataset.value = hat;
      chip.addEventListener('click', () => this.select('hat', hat));
      el.appendChild(chip);
    });
  }

  select(kind, value) {
    this.state[kind] = value;
    if (this.audio) this.audio.uiClick();
    // sync selected styling across all matching controls
    const selector = kind === 'hat' ? '.hat-chip' : '.swatch';
    document.querySelectorAll(selector).forEach((node) => {
      if (node.dataset.kind === kind) {
        node.classList.toggle('selected', node.dataset.value === value);
      }
    });
    this.apply();
  }

  apply() {
    this.character.setBodyColor(this.state.body);
    this.character.setAccentColor(this.state.accent);
    this.character.setHat(this.state.hat);
  }
}
