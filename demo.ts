import { mountTweakPanel, type Control, type ControlKit } from "./panel";
import { ANIMAL_KEYS, ANIMALS, AnimalEngine, SHARED_CONTROLS, type AnimalKey, type KnobSpec, type Tuning } from "./src";
import { mountComposer, mountGreeting, mountShortcuts } from "./ui";

const STORE = "ascii-animals:";

const params = new URLSearchParams(location.search);
const count = Number(params.get("count")) || undefined;
const isAnimal = (key: string | null): key is AnimalKey => key !== null && key in ANIMALS;

let saved: string | null = null;
try {
  saved = localStorage.getItem(STORE + "animal");
} catch {}

let animal: AnimalKey = isAnimal(params.get("animal")) ? (params.get("animal") as AnimalKey) : isAnimal(saved) ? saved : "butterflies";

// Dark mode canvas engine
const engine = new AnimalEngine(document.querySelector("canvas")!, { animal, count, theme: "dark" });

const storageKey = (key: AnimalKey) => `${STORE}tweaks:${key}`;

function controlsFor(key: AnimalKey) {
  const a = ANIMALS[key];
  const hidden = new Set<string>(a.hide ?? []);
  return (kit: ControlKit<Tuning>): [string, Control[]][] => {
    const build = (spec: KnobSpec): Control => {
      if ("toggle" in spec) return kit.toggle(spec.key, spec.label, spec.hint);
      const knob = kit.knob(spec.key, spec.label, spec.min, spec.max, spec.step, spec.hint);
      const when = spec.disabledWhen;
      return when ? { ...knob, disabled: () => Boolean(engine.tuning[when]) } : knob;
    };
    const keep = (specs: KnobSpec[]) => specs.filter((s) => !hidden.has(s.key)).map(build);
    return [
      ["Movement", keep(SHARED_CONTROLS.movement)],
      ...a.controls.map(([title, specs]): [string, Control[]] => [title, specs.map(build)]),
      ["Look", keep(SHARED_CONTROLS.look)],
    ];
  };
}

const animalChoices = ANIMAL_KEYS.map((key) => ({
  key,
  label: ANIMALS[key].label,
  swatch: `rgb(${ANIMALS[key].swatch.join(",")})`,
}));

// Mount tweaks panel with integrated animal switcher and profile name input
const tweaks = mountTweakPanel(engine, ANIMALS[animal].defaults, controlsFor(animal), {
  storageKey: storageKey(animal),
  animals: animalChoices,
  currentAnimal: animal,
  onPickAnimal: (key) => {
    animal = key as AnimalKey;
    engine.setAnimal(animal);
    tweaks.updateAnimal(animal, ANIMALS[animal].defaults, controlsFor(animal), storageKey(animal));
    try {
      localStorage.setItem(STORE + "animal", animal);
    } catch {}
  },
});

window.addEventListener("storage", (e) => {
  if (e.key === storageKey(animal)) location.reload();
});

mountComposer();
mountShortcuts();
mountGreeting();
