import { describe, expect, it } from "vitest";
import {
  computeTenantThemeVariables,
  parseColor,
  shiftLightness,
  withLightness,
  hsl,
} from "../../apps/web/src/lib/tenant-theme";
import { defaultTenantConfig, type TenantConfig } from "../../packages/shared/tenant-config";

function configWith(primaryColor: string, secondaryColor?: string): TenantConfig {
  return {
    ...defaultTenantConfig,
    theme: { ...defaultTenantConfig.theme, primaryColor, secondaryColor },
  };
}

describe("parsing des couleurs de charte", () => {
  it.each([
    ["#047857", { h: 160, s: 93, l: 24 }],
    ["#fff", { h: 0, s: 0, l: 100 }],
    ["rgb(4, 120, 87)", { h: 163, s: 94, l: 24 }],
    ["hsl(210, 100%, 45%)", { h: 210, s: 100, l: 45 }],
    ["hsla(210, 100%, 45%, 0.5)", { h: 210, s: 100, l: 45 }],
  ])("parse %s", (input, expected) => {
    const parsed = parseColor(input);
    expect(parsed).toBeDefined();
    expect(parsed!.h).toBeCloseTo(expected.h, -1);
    expect(parsed!.s).toBeCloseTo(expected.s, -1);
    expect(parsed!.l).toBeCloseTo(expected.l, -1);
  });

  it("rejette une couleur inexploitable sans casser la charte", () => {
    expect(parseColor("var(--oops)")).toBeUndefined();
    expect(parseColor("bleu-corporate")).toBeUndefined();
    expect(computeTenantThemeVariables(configWith("pas-une-couleur"))).toBeUndefined();
  });
});

describe("manipulation de luminosité", () => {
  it("borne la luminosité entre 0 et 100", () => {
    expect(withLightness({ h: 10, s: 50, l: 50 }, 120).l).toBe(100);
    expect(shiftLightness({ h: 10, s: 50, l: 5 }, -20).l).toBe(0);
  });

  it("sérialise en hsl()", () => {
    expect(hsl({ h: 210, s: 100, l: 45 })).toBe("hsl(210, 100%, 45%)");
  });
});

describe("charte graphique dérivée du branding tenant", () => {
  it("dérive les deux thèmes depuis la couleur primaire", () => {
    const variables = computeTenantThemeVariables(configWith("hsl(0, 80%, 40%)"));

    expect(variables).toBeDefined();
    expect(variables!.root["--accent-primary"]).toBe("hsl(0, 80%, 40%)");
    expect(variables!.root["--accent-primary-hover"]).toBe("hsl(0, 80%, 32%)");
    expect(variables!.root["--sidebar-text-active"]).toBe("hsl(0, 80%, 40%)");
    // Thème sombre : éclairci pour le contraste sur fond sombre
    expect(variables!.dark["--accent-primary"]).toBe("hsl(0, 80%, 60%)");
    expect(variables!.dark["--sidebar-item-active"]).toContain("hsla(0, 80%, 60%");
  });

  it("préserve une couleur déjà claire en thème sombre", () => {
    const variables = computeTenantThemeVariables(configWith("hsl(45, 90%, 70%)"));

    expect(variables!.dark["--accent-primary"]).toBe("hsl(45, 90%, 70%)");
  });

  it("dérive la couleur secondaire quand elle est définie", () => {
    const variables = computeTenantThemeVariables(
      configWith("hsl(210, 100%, 45%)", "hsl(30, 90%, 50%)"),
    );

    expect(variables!.root["--accent-secondary"]).toBe("hsl(30, 90%, 50%)");
    expect(variables!.dark["--accent-secondary"]).toBe("hsl(30, 90%, 60%)");
  });

  it("n'écrase pas les tokens sémantiques (statuts, danger, succès)", () => {
    const variables = computeTenantThemeVariables(configWith("hsl(210, 100%, 45%)"));
    const touched = [...Object.keys(variables!.root), ...Object.keys(variables!.dark)];

    for (const name of touched) {
      expect(name).not.toMatch(/danger|success|warning|info|status/);
    }
  });
});
