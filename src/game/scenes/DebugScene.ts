// ?debug=1 overlay: on-device telemetry summary per level, plus JSON export (copy / download). No network.
import * as K from '../art/keys';
import { getServices } from '../services';
import { STRINGS } from '../strings';
import { Button, addText } from '../ui/widgets';
import { Overlay, type OverlayData } from './Overlay';

const pct = (v: number) => `${Math.round(v)}%`;

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export class DebugScene extends Overlay<OverlayData> {
  static readonly KEY = 'Debug';
  private status = '';

  constructor() {
    super(DebugScene.KEY);
  }

  protected override onBackdrop(): void {
    this.close();
  }

  protected buildContent(): void {
    const tel = getServices().telemetry;
    const sum = tel.summary();
    const a = this.area();
    const u = this.unitFor(8.4, 12);
    const w = Math.min(a.w * 0.96, u * 8.4);
    const h = Math.min(a.h * 0.96, u * 12);
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const top = cy - h / 2;
    const p = this.panel(cx, cy, w, h, K.PANEL_DARK);
    p.setInteractive();
    this.text(cx, top + u * 0.6, STRINGS.debugTitle, u * 0.55);
    const t = sum.totals;
    const head = [
      STRINGS.debugTotals(sum.sessions, (sum.avgSessionMs / 60000).toFixed(1), sum.events),
      `Win ${pct(t.winRate * 100)} | bad taps ${pct(t.invalidTapPct)} | continues ${t.continues}`,
      `Powers used ${t.powersUsed}/${t.powersEarned} (${pct(t.powersEarned ? (t.powersUsed / t.powersEarned) * 100 : 0)})`,
      `Boons ${t.boons} | geodes ${t.geodes} | bonus relics ${t.bonusRelics} | tokens ${t.reforgeTokens}`,
    ].join('\n');
    const mono = Math.max(10, u * 0.34);
    const headT = addText(this, cx, top + u * 1.15, head, mono, { color: '#ffe9c2', stroke: false, weight: 'normal' }).setOrigin(0.5, 0);
    headT.setFontFamily('ui-monospace, Consolas, monospace');
    this.root.add(headT);

    const cols = STRINGS.debugHeader;
    const rows = [cols.map((c) => c.padEnd(8)).join('')];
    for (const l of sum.levels) {
      rows.push([
        String(l.level).padEnd(8),
        String(l.attempts).padEnd(8),
        pct(l.winRate * 100).padEnd(8),
        pct(l.invalidTapPct).padEnd(8),
        `${l.powersUsed}/${l.powersEarned}`.padEnd(8),
        String(l.boons).padEnd(8),
      ].join(''));
    }
    const maxRows = Math.max(3, Math.floor((h - u * 5.4) / (mono * 1.25)));
    if (rows.length > maxRows) rows.splice(maxRows, rows.length - maxRows, '...');
    const table = addText(this, cx, top + u * 3.0, rows.join('\n'), mono, { color: '#fff7e6', stroke: false, weight: 'normal', align: 'left' }).setOrigin(0.5, 0);
    table.setFontFamily('ui-monospace, Consolas, monospace');
    if (table.width > w * 0.92) table.setScale((w * 0.92) / table.width);
    this.root.add(table);

    const by = top + h - u * 1.75;
    const bw = (w - u * 1.2) / 2;
    const json = () => tel.exportJson();
    this.root.add(new Button(this, this.m, {
      x: cx - bw / 2 - u * 0.15, y: by, w: bw, h: u * 0.95, label: STRINGS.debugCopy, fontPx: this.f.body,
      onClick: () => void copyText(json()).then((ok) => {
        this.status = ok ? STRINGS.debugCopied : STRINGS.debugCopyFailed;
        this.build();
      }),
      id: 'debug.copy',
    }));
    this.root.add(new Button(this, this.m, {
      x: cx + bw / 2 + u * 0.15, y: by, w: bw, h: u * 0.95, label: STRINGS.debugDownload, fontPx: this.f.body,
      onClick: () => downloadText(`playtest-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, json()),
      id: 'debug.download',
    }));
    this.text(cx, by + u * 0.85, this.status || STRINGS.debugKeys, this.f.small, '#ffe9c2');
    this.root.add(new Button(this, this.m, { x: cx + w / 2 - u * 0.75, y: top + u * 0.7, w: u * 0.95, h: u * 0.95, icon: K.ICON_BACK, kind: 'icon', onClick: () => this.close(), id: 'debug.close' }));
  }
}
