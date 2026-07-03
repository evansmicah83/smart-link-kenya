import { describe, it, expect } from "vitest";
import { buildBrandingCssProperties } from "../../branding";

describe("buildBrandingCssProperties", () => {
  it("maps tenant branding and theme config to css variables", () => {
    const css = buildBrandingCssProperties({
      primary_color: "#0f172a",
      secondary_color: "#1d4ed8",
      accent_color: "#f59e0b",
      success_color: "#16a34a",
      warning_color: "#f59e0b",
      error_color: "#dc2626",
      brand_config: {
        light_theme_colors: {
          primary: "#111827",
          secondary: "#3b82f6",
          accent: "#14b8a6",
        },
        dark_theme_colors: {
          background: "#020617",
          card: "#0f172a",
        },
        typography: {
          font_family: "Inter, sans-serif",
        },
      },
    });

    expect(css["--primary"]).toBe("#0f172a");
    expect(css["--secondary"]).toBe("#1d4ed8");
    expect(css["--accent"]).toBe("#f59e0b");
    expect(css["--success"]).toBe("#16a34a");
    expect(css["--warning"]).toBe("#f59e0b");
    expect(css["--destructive"]).toBe("#dc2626");
    expect(css["--font-sans"]).toBe("Inter, sans-serif");
    expect(css["--background"]).toBe("#020617");
    expect(css["--card"]).toBe("#0f172a");
  });
});
