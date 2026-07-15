import { describe, it, expect } from 'vitest';
import {
  buildSparklineGeometry,
  trendDirection,
  trendVariant,
  metricSeries,
} from '../../apps/web/src/components/kpi/kpi-trends-utils';

describe('Trends — buildSparklineGeometry', () => {
  it('normalise les valeurs sur la hauteur (min en bas, max en haut)', () => {
    const geo = buildSparklineGeometry([0, 10], 100, 40, 2);
    expect(geo).not.toBeNull();
    const [first, last] = geo!.points.split(' ').map((p) => p.split(',').map(Number));
    expect(first[1]).toBe(38); // min → bas (height - padding)
    expect(last[1]).toBe(2);   // max → haut (padding)
    expect(geo!.last).toEqual({ x: 98, y: 2 });
  });

  it('trace une série plate à mi-hauteur', () => {
    const geo = buildSparklineGeometry([5, 5, 5], 100, 40, 2);
    const ys = geo!.points.split(' ').map((p) => Number(p.split(',')[1]));
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(20); // padding + 0.5 × (40 - 4) = 2 + 18
  });

  it('répartit les X uniformément', () => {
    const geo = buildSparklineGeometry([1, 2, 3], 102, 40, 1);
    const xs = geo!.points.split(' ').map((p) => Number(p.split(',')[0]));
    expect(xs).toEqual([1, 51, 101]);
  });

  it('retourne null sous 2 points', () => {
    expect(buildSparklineGeometry([], 100, 40)).toBeNull();
    expect(buildSparklineGeometry([7], 100, 40)).toBeNull();
  });
});

describe('Trends — trendDirection et trendVariant', () => {
  it('détecte hausse, baisse et stabilité entre extrémités', () => {
    expect(trendDirection([1, 5, 3])).toBe('up');
    expect(trendDirection([5, 8, 2])).toBe('down');
    expect(trendDirection([4, 9, 4])).toBe('flat');
    expect(trendDirection([4])).toBe('flat');
  });

  it('inverse la sémantique pour les indicateurs défavorables (PAR)', () => {
    expect(trendVariant('up')).toBe('success');
    expect(trendVariant('up', true)).toBe('danger');
    expect(trendVariant('down', true)).toBe('success');
    expect(trendVariant('flat', true)).toBe('neutral');
  });
});

describe('Trends — metricSeries', () => {
  it('extrait la série d’une métrique en ignorant les points sans valeur', () => {
    const points: Array<{ periodKey: string; metrics: Record<string, number> }> = [
      { periodKey: '2026-05', metrics: { 'risque.par30': 4.1 } },
      { periodKey: '2026-06', metrics: {} },
      { periodKey: '2026-07', metrics: { 'risque.par30': 3.8 } },
    ];
    expect(metricSeries(points, 'risque.par30')).toEqual([4.1, 3.8]);
    expect(metricSeries(points, 'inconnu')).toEqual([]);
  });
});
