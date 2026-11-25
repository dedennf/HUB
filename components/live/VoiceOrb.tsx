'use client';
import { useEffect, useRef } from 'react';

export type OrbMode = 'idle' | 'connecting' | 'listening' | 'speaking' | 'muted';

/**
 * Bola suara mode Live: beberapa lapis gumpalan yang bergelombang mengikuti volume.
 * Saat pengguna bicara mengikuti mikrofon, saat Ra bicara mengikuti suara Ra.
 * Digambar di canvas dengan requestAnimationFrame dan membaca level lewat fungsi, bukan state,
 * supaya tidak memicu render React tiap frame.
 */
export function VoiceOrb({ mode, level, size = 168 }: { mode: OrbMode; level: () => number; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const levelRef = useRef(level);
  useEffect(() => { modeRef.current = mode; levelRef.current = level; }, [mode, level]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr;
    el.height = size * dpr;
    ctx.scale(dpr, dpr);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const css = getComputedStyle(el);
    // token tema DESIGN.md, jadi ikut terang/gelap
    const strong = css.getPropertyValue('--accent-fill').trim() || '#0E7C6B';
    const mid = css.getPropertyValue('--accent').trim() || '#0E7C6B';
    const soft = '#4ADE9A';
    const grey = css.getPropertyValue('--border').trim() || '#C4C9D1';

    let amp = 0;
    let raf = 0;
    const c = size / 2;
    // jari-jari terbesar (lapis luar, volume penuh) tetap di bawah setengah kanvas
    const base = size * 0.2;

    const blob = (r: number, wobble: number, t: number, k: number) => {
      ctx.beginPath();
      const n = 72;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = Math.sin(a * 3 + t * (1.1 + k * 0.35) + k * 2) * 0.6 + Math.cos(a * 2 - t * (0.8 + k * 0.2)) * 0.4;
        const rr = r * (1 + wobble * w);
        const x = c + Math.cos(a) * rr;
        const y = c + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const frame = (now: number) => {
      const m = modeRef.current;
      const live = m === 'listening' || m === 'speaking';
      const target = live ? Math.min(1, levelRef.current()) : 0;
      // naik cepat, turun pelan, seperti meter suara
      amp += (target - amp) * (target > amp ? 0.35 : 0.08);
      const t = reduce ? 0 : now / 1000;
      const breathe = reduce ? 0 : Math.sin(t * (m === 'connecting' ? 3 : 1.4)) * 0.03;
      const off = m === 'muted' || m === 'idle';

      ctx.clearRect(0, 0, size, size);
      const colors = off ? [grey, grey, grey] : m === 'speaking' ? [soft, mid, strong] : [mid, soft, strong];
      const wob = reduce ? 0 : 0.02 + amp * 0.1;
      // tiga lapis: luar paling tipis dan paling bergelombang
      for (let k = 2; k >= 0; k--) {
        const r = base * (1 + breathe + amp * (0.22 + k * 0.08)) * (1 + k * 0.14);
        blob(r, wob * (1 + k * 0.4), t, k);
        const g = ctx.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.1, c, c, r);
        g.addColorStop(0, colors[k]);
        g.addColorStop(1, k === 0 ? colors[2] : colors[k]);
        ctx.fillStyle = g;
        ctx.globalAlpha = k === 0 ? 1 : k === 1 ? 0.35 : 0.18;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // kilau kecil di kiri atas supaya bola terasa bervolume
      ctx.beginPath();
      ctx.ellipse(c - base * 0.32, c - base * 0.38, base * 0.28, base * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{ width: size, height: size }}
    />
  );
}
