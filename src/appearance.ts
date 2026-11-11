export type KitAppearance = {
  /** Defaults to `dark` (the kit's built-in pages). */
  colorScheme?: "dark" | "light";
  /** CSS custom properties merged into `:root` on login, approve, and cards. */
  cssVariables?: Record<string, string>;
  extraCss?: string;
  extraHeadHtml?: string;
};

export const DEFAULT_APPEARANCE_VARS: Record<string, string> = {
  "--bg": "#0e1116",
  "--panel": "#171b22",
  "--ink": "#e8edf5",
  "--muted": "#9aa6b8",
  "--line": "#2a3140",
  "--accent": "#7ae0c3",
  "--danger": "#f08a8a",
  "--accent-ink": "#08221a",
};

export function resolvedAppearanceVars(appearance?: KitAppearance): Record<string, string> {
  return { ...DEFAULT_APPEARANCE_VARS, ...(appearance?.cssVariables ?? {}) };
}

export function appearanceStyleBlock(appearance?: KitAppearance): string {
  const vars = resolvedAppearanceVars(appearance);
  const declarations = Object.entries(vars)
    .map(([name, value]) => `      ${escapeCssIdent(name)}: ${escapeCssValue(value)};`)
    .join("\n");
  const scheme = appearance?.colorScheme ?? "dark";
  const extra = appearance?.extraCss ? `\n    ${appearance.extraCss}` : "";
  return `
    :root {
      color-scheme: ${scheme};
${declarations}
    }${extra}
`;
}

function escapeCssIdent(value: string): string {
  if (!/^--[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid CSS variable name: ${value}`);
  }
  return value;
}

function escapeCssValue(value: string): string {
  return value.replaceAll(/[;{}]/g, "").trim();
}
