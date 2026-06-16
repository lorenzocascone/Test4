// ----------------------------------------------------------------------------
// In-game HUD: gem counter, time-of-day indicator, toast popups, hint, mute.
// ----------------------------------------------------------------------------

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.gemCount = document.getElementById('gem-count');
    this.gemCounter = this.el.querySelector('.gem-counter');
    this.todLabel = document.getElementById('tod-label');
    this.todIcon = document.getElementById('tod-icon');
    this.toast = document.getElementById('toast');
    this.hint = document.getElementById('hint');
    this.muteBtn = document.getElementById('mute-btn');
    this.count = 0;
    this._hintHidden = false;
  }

  show() { this.el.classList.remove('hidden'); }

  setGems(n) {
    this.count = n;
    this.gemCount.textContent = n;
    this.gemCounter.classList.remove('bump');
    void this.gemCounter.offsetWidth; // restart animation
    this.gemCounter.classList.add('bump');
    if (!this._hintHidden) { this.hint.classList.add('fade'); this._hintHidden = true; }
  }

  setTime(label, dayCount) {
    const icons = { Night: '🌙', Dawn: '🌅', Morning: '🌤️', Noon: '☀️', Afternoon: '🌤️', Dusk: '🌇', Evening: '🌆' };
    this.todIcon.textContent = icons[label] || '☀️';
    this.todLabel.textContent = `Day ${dayCount} · ${label}`;
  }

  showToast(text, ms = 1400) {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toast.classList.remove('show');
      setTimeout(() => this.toast.classList.add('hidden'), 400);
    }, ms);
  }

  setMuted(m) { this.muteBtn.textContent = m ? '🔇' : '🔊'; }
}
