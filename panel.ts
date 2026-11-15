/**
 * Tweak panel: scene engine knobs, profile name input, animal switcher, and chat glass.
 * Rebuilt for the New Tab extension:
 *   - No permanent tweaks button cluttering the screen.
 *   - Hovering cursor at left or right edge for 1 second reveals the panel with smooth glass slide.
 *   - Profile greeting name input at the top.
 *   - Integrated animal switcher with swatches.
 */
import { getGreetingName, setGreetingName } from "./ui";

const GLASS_DEFAULTS = {
  blur: 3.5,
  refraction: 40,
  ripple: 0.007,
  tint: 0,
  edge: 0.55,
  radius: 24,
  width: 720,
};

type Glass = typeof GLASS_DEFAULTS;

interface Range {
  kind: "range";
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  def: number;
  get(): number;
  set(v: number): void;
  disabled?(): boolean;
}

interface Toggle {
  kind: "toggle";
  label: string;
  hint?: string;
  def: boolean;
  get(): boolean;
  set(v: boolean): void;
}

export type Control = Range | Toggle;

type Knobs = Record<string, number | boolean>;

export interface Tunable<T extends Knobs> {
  readonly tuning: T;
  set<K extends keyof T>(key: K, value: T[K]): void;
}

export interface ControlKit<T extends Knobs> {
  knob(key: keyof T, label: string, min: number, max: number, step: number, hint?: string): Range;
  toggle(key: keyof T, label: string, hint?: string): Toggle;
}

export interface AnimalChoice {
  key: string;
  label: string;
  swatch: string;
}

const OPEN_KEY = "ascii-animals:tweaks-open";

function load<T>(storageKey: string): { tuning?: Partial<T>; glass?: Partial<Glass> } {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  } catch {
    return {};
  }
}

function changed<T extends object>(values: T, defaults: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    if (values[key] !== defaults[key]) out[key] = values[key];
  }
  return out;
}

function applyGlass(g: Glass) {
  const composer = document.querySelector<HTMLElement>(".composer")!;
  if (composer) {
    composer.style.setProperty("--blur", `${g.blur}px`);
    composer.style.borderRadius = `${g.radius}px`;
    composer.style.width = `min(${g.width}px, calc(100vw - 32px))`;
  }
  document.documentElement.style.setProperty("--tint", String(g.tint));
  document.documentElement.style.setProperty("--edge", String(g.edge));
  document.querySelector("#liquid-glass feDisplacementMap")?.setAttribute("scale", String(g.refraction));
  document.querySelector("#liquid-glass feTurbulence")?.setAttribute("baseFrequency", `${g.ripple} ${g.ripple * 1.5}`);
}

const decimals = (step: number) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step))));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function mountTweakPanel<T extends Knobs>(
  engine: Tunable<T>,
  defaults: T,
  groups: (kit: ControlKit<T>) => [string, Control[]][],
  {
    storageKey = "tweaks",
    onChange,
    animals = [],
    currentAnimal = "",
    onPickAnimal,
  }: {
    storageKey?: string;
    onChange?: () => void;
    animals?: AnimalChoice[];
    currentAnimal?: string;
    onPickAnimal?: (key: string) => void;
  } = {},
) {
  let activeStorageKey = storageKey;
  let activeDefaults = defaults;
  let activeGroups = groups;
  let activeAnimal = currentAnimal;

  const t = engine.tuning;
  const saved = load<T>(activeStorageKey);
  const glass: Glass = { ...GLASS_DEFAULTS, ...saved.glass };
  for (const [key, value] of Object.entries(saved.tuning ?? {})) {
    if (key in activeDefaults) engine.set(key as keyof T, value as never);
  }
  applyGlass(glass);

  const save = () => {
    try {
      localStorage.setItem(activeStorageKey, JSON.stringify({ tuning: changed(t, activeDefaults), glass: changed(glass, GLASS_DEFAULTS) }));
    } catch {}
    onChange?.();
  };

  const kit: ControlKit<T> = {
    knob: (key, label, min, max, step, hint) => ({
      kind: "range", label, min, max, step, hint,
      def: activeDefaults[key] as number,
      get: () => t[key] as number,
      set: (v) => engine.set(key, v as T[typeof key]),
    }),
    toggle: (key, label, hint) => ({
      kind: "toggle", label, hint,
      def: activeDefaults[key] as boolean,
      get: () => t[key] as boolean,
      set: (v) => engine.set(key, v as T[typeof key]),
    }),
  };

  const pane = <K extends keyof Glass>(key: K, label: string, min: number, max: number, step: number, hint: string): Range => ({
    kind: "range", label, min, max, step, hint,
    def: GLASS_DEFAULTS[key],
    get: () => glass[key],
    set: (v) => {
      glass[key] = v;
      applyGlass(glass);
    },
  });

  // ── DOM STRUCTURE ──
  const panel = el("aside", "tweaks glass");
  panel.setAttribute("aria-label", "Tweaks");

  const header = el("header", "tweaks-head");
  const title = el("h2", "", "Tweaks & Settings");
  const copy = el("button", "tweaks-action", "Copy");
  const reset = el("button", "tweaks-action", "Reset");
  const close = el("button", "tweaks-close");
  close.setAttribute("aria-label", "Close tweaks");
  close.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
  header.append(title, copy, reset, close);

  const body = el("div", "tweaks-body");
  panel.append(header, body);

  // Tip box
  const tip = el("div", "tweaks-tip");
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  const showTip = (row: HTMLElement, hint?: string) => {
    if (!hint) return;
    tip.innerHTML = "";
    tip.append(el("span", "", hint), el("small", "", "Double-click the name to reset it."));
    tip.hidden = false;
    const r = row.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    tip.style.right = `${window.innerWidth - p.left + 10}px`;
    tip.style.top = `${Math.max(8, Math.min(window.innerHeight - tip.offsetHeight - 8, r.top + r.height / 2 - tip.offsetHeight / 2))}px`;
  };
  const hideTip = () => (tip.hidden = true);

  // Edge hotzones: hover at left or right edge for 1s to reveal
  const hotzoneRight = el("div", "edge-hotzone right");
  const hotzoneLeft = el("div", "edge-hotzone left");

  let hoverTimer: number | null = null;
  let closeTimer: number | null = null;

  const startHoverTimer = (hz: HTMLElement) => {
    if (panel.classList.contains("open")) return;
    hz.classList.add("priming");
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      hz.classList.remove("priming");
      setOpen(true);
    }, 1000);
  };

  const cancelHoverTimer = (hz: HTMLElement) => {
    hz.classList.remove("priming");
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  };

  hotzoneRight.addEventListener("mouseenter", () => startHoverTimer(hotzoneRight));
  hotzoneRight.addEventListener("mouseleave", () => cancelHoverTimer(hotzoneRight));
  hotzoneLeft.addEventListener("mouseenter", () => startHoverTimer(hotzoneLeft));
  hotzoneLeft.addEventListener("mouseleave", () => cancelHoverTimer(hotzoneLeft));

  panel.addEventListener("mouseenter", () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  });

  panel.addEventListener("mouseleave", () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      setOpen(false);
    }, 1200);
  });

  let refreshers: (() => void)[] = [];

  function buildBody() {
    body.replaceChildren();
    refreshers = [];

    // 1. Profile / Greeting Name
    const profileSection = el("section", "tweaks-group tweaks-profile-group");
    profileSection.append(el("h3", "", "Profile"));
    const nameRow = el("div", "tweaks-name-row");
    const nameLabel = el("label", "tweaks-name-label", "Greeting Name");
    const nameInput = el("input", "tweaks-name-input");
    nameInput.type = "text";
    nameInput.value = getGreetingName();
    nameInput.placeholder = "Stephen";
    nameInput.addEventListener("input", () => {
      setGreetingName(nameInput.value);
    });
    nameRow.append(nameLabel, nameInput);
    profileSection.append(nameRow);
    body.append(profileSection);

    // 2. Animal Selector Grid
    if (animals.length > 0) {
      const animalSection = el("section", "tweaks-group tweaks-animals-group");
      animalSection.append(el("h3", "", "Animals"));
      const grid = el("div", "tweaks-animal-grid");

      for (const a of animals) {
        const btn = el("button", "tweaks-animal-btn");
        btn.type = "button";
        if (a.key === activeAnimal) btn.classList.add("active");

        const dot = el("span", "dot");
        dot.style.setProperty("--swatch", a.swatch);
        const nameSpan = el("span", "", a.label);

        btn.append(dot, nameSpan);
        btn.addEventListener("click", () => {
          if (a.key === activeAnimal) return;
          activeAnimal = a.key;
          grid.querySelectorAll(".tweaks-animal-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          onPickAnimal?.(a.key);
        });
        grid.append(btn);
      }
      animalSection.append(grid);
      body.append(animalSection);
    }

    // 3. Movement, Animal specific, Look, and Glass Knobs
    const sections: [string, Control[]][] = [
      ...activeGroups(kit),
      ["Chat glass", [
        pane("blur", "Blur (px)", 0, 30, 0.5, "How frosted the chat box is."),
        pane("refraction", "Refraction", 0, 150, 1, "How strongly the glass bends what's behind it."),
        pane("ripple", "Ripple", 0.001, 0.04, 0.001, "Size of the refraction ripples."),
        pane("tint", "Tint", 0, 3, 0.05, "How milky the glass is."),
        pane("edge", "Edge", 0, 2, 0.05, "Strength of the glass rims and borders."),
        pane("radius", "Corner radius", 0, 48, 1, "Rounding of the chat box corners."),
        pane("width", "Width", 320, 960, 10, "Width of the chat box."),
      ]],
    ];

    for (const [name, controls] of sections) {
      const section = el("section", "tweaks-group");
      section.append(el("h3", "", name));
      for (const c of controls) {
        const row = el("label", `tweaks-row ${c.kind}`);
        const label = el("span", "tweaks-label", c.label);
        row.addEventListener("pointerenter", () => showTip(row, c.hint));
        row.addEventListener("pointerleave", hideTip);
        row.addEventListener("focusin", () => showTip(row, c.hint));
        row.addEventListener("focusout", hideTip);

        if (c.kind === "toggle") {
          const box = el("input");
          box.type = "checkbox";
          box.addEventListener("change", () => {
            c.set(box.checked);
            refreshAll();
            save();
          });
          refreshers.push(() => (box.checked = c.get()));
          label.addEventListener("dblclick", (e) => {
            e.preventDefault();
            c.set(c.def);
            refreshAll();
            save();
          });
          row.append(label, box);
        } else {
          const out = el("output", "tweaks-value");
          const input = el("input");
          input.type = "range";
          input.min = String(c.min);
          input.max = String(c.max);
          input.step = String(c.step);
          const show = () => {
            const v = c.get();
            input.value = String(v);
            out.textContent = v.toFixed(decimals(c.step));
            input.style.setProperty("--fill", `${((v - c.min) / (c.max - c.min)) * 100}%`);
            const off = c.disabled?.() ?? false;
            input.disabled = off;
            row.classList.toggle("off", off);
          };
          input.addEventListener("input", () => {
            c.set(Number(input.value));
            show();
            save();
          });
          label.addEventListener("dblclick", (e) => {
            e.preventDefault();
            c.set(c.def);
            show();
            save();
          });
          refreshers.push(show);
          row.append(label, out, input);
        }
        section.append(row);
      }
      body.append(section);
    }

    refreshAll();
  }

  const refreshAll = () => refreshers.forEach((r) => r());

  buildBody();

  // Header copy/reset
  copy.addEventListener("click", async () => {
    const json = JSON.stringify({ tuning: changed(t, activeDefaults), glass: changed(glass, GLASS_DEFAULTS) }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "In console";
      console.log(json);
    }
    setTimeout(() => (copy.textContent = "Copy"), 1400);
  });

  let armed = 0;
  const disarm = () => {
    clearTimeout(armed);
    armed = 0;
    reset.textContent = "Reset";
    reset.classList.remove("confirm");
  };
  reset.addEventListener("click", () => {
    if (!armed) {
      reset.textContent = "Reset all?";
      reset.classList.add("confirm");
      armed = window.setTimeout(disarm, 3000);
      return;
    }
    disarm();
    for (const key of Object.keys(activeDefaults) as (keyof T)[]) engine.set(key, activeDefaults[key]);
    Object.assign(glass, GLASS_DEFAULTS);
    applyGlass(glass);
    refreshAll();
    try {
      localStorage.removeItem(activeStorageKey);
    } catch {}
    onChange?.();
  });

  const setOpen = (open: boolean) => {
    panel.classList.toggle("open", open);
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {}
  };

  close.addEventListener("click", () => {
    hideTip();
    setOpen(false);
  });

  // Global keybindings: Esc closes, T toggles
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "Escape" && panel.classList.contains("open")) {
      setOpen(false);
    } else if (e.key.toLowerCase() === "t") {
      setOpen(!panel.classList.contains("open"));
    }
  };
  window.addEventListener("keydown", onKey);

  document.body.append(hotzoneLeft, hotzoneRight, panel, tip);

  return {
    sync() {
      refreshAll();
      save();
    },
    updateAnimal(newKey: string, newDefaults: T, newGroups: (kit: ControlKit<T>) => [string, Control[]][], newStorageKey: string) {
      activeAnimal = newKey;
      activeDefaults = newDefaults;
      activeGroups = newGroups;
      activeStorageKey = newStorageKey;

      const newSaved = load<T>(activeStorageKey);
      for (const [k, val] of Object.entries(newSaved.tuning ?? {})) {
        if (k in activeDefaults) engine.set(k as keyof T, val as never);
      }
      buildBody();
    },
    destroy() {
      window.removeEventListener("keydown", onKey);
      panel.remove();
      hotzoneLeft.remove();
      hotzoneRight.remove();
      tip.remove();
    },
  };
}
