// Candidate looks, one at a time and full page, for picking one.
// compare.html?animal=manta picks the set (the sets live in src/animals/candidates.ts) and
// &idea=2 the option; the bars at the top switch between them, and so do the arrow and number keys.
import { AnimalEngine } from "./src";
import { CANDIDATES, getStoredCandidate, setStoredCandidate } from "./src/animals/candidates";
import { mountChoices } from "./ui";

const sets = Object.keys(CANDIDATES);
const params = new URLSearchParams(location.search);
let set = params.get("animal") ?? "";
if (!(set in CANDIDATES)) set = sets[0];
let idea = Number(params.get("idea")) || 0;

const canvas = document.querySelector("canvas")!;
const note = document.querySelector<HTMLElement>(".note")!;
const ideasBar = document.querySelector<HTMLElement>(".ideas")!;
const selectBtn = document.querySelector<HTMLButtonElement>("#btn-select-active")!;
const letter = (i: number) => String.fromCharCode(65 + i);
const swatchOf = (rgb: [number, number, number]) => `rgb(${rgb.join(" ")})`;

if (!set) {
  note.textContent = "Nothing to compare right now: add a set in src/animals/candidates.ts.";
} else {
  const engine = new AnimalEngine(canvas, { animal: CANDIDATES[set][0].animal, theme: "dark" });

  const remember = () => {
    const url = new URL(location.href);
    url.searchParams.set("animal", set);
    url.searchParams.set("idea", String(idea));
    history.replaceState(null, "", url);
  };

  const updateSelectButton = () => {
    const currentStored = getStoredCandidate(set, 0);
    const isCurrentActive = currentStored === idea;
    if (isCurrentActive) {
      selectBtn.classList.add("active");
      selectBtn.innerHTML = `<span>✓ Option ${letter(idea)} is Active for New Tab</span>`;
    } else {
      selectBtn.classList.remove("active");
      selectBtn.innerHTML = `<span>Set Option ${letter(idea)} as New Tab Default</span>`;
    }
  };

  selectBtn.addEventListener("click", () => {
    setStoredCandidate(set, idea);
    updateSelectButton();
  });

  const show = () => {
    const list = CANDIDATES[set];
    idea = Math.min(Math.max(0, idea), list.length - 1);
    const { animal, note: text } = list[idea];
    engine.setAnimal(animal);
    note.innerHTML = `<b>Option ${letter(idea)} · ${animal.label}</b>: ${text} <kbd>← → or 1–4 to switch</kbd>`;
    updateSelectButton();
    remember();
  };

  // The ideas bar is rebuilt for each set.
  let pickIdea: (i: number) => void = () => {};
  const mountIdeas = () => {
    ideasBar.replaceChildren();
    const list = CANDIDATES[set];
    mountChoices(
      ideasBar,
      list.map((c, i) => ({ value: String(i), label: `<b>${letter(i)}</b>${c.animal.label}`, swatch: swatchOf(c.animal.swatch) })),
      String(idea),
      (v) => {
        idea = Number(v);
        show();
      },
    );
    pickIdea = (i) => {
      const n = list.length;
      ideasBar.querySelector<HTMLButtonElement>(`button[data-value="${((i % n) + n) % n}"]`)?.click();
    };
  };

  mountChoices(
    document.querySelector<HTMLElement>(".sets")!,
    sets.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), swatch: swatchOf(CANDIDATES[s][0].animal.swatch) })),
    set,
    (v) => {
      set = v;
      idea = getStoredCandidate(set, 0);
      mountIdeas();
      show();
    },
  );
  mountIdeas();
  show();

  // Arrow keys and 1–9 switch ideas from anywhere (the bars handle arrows themselves when focused).
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest?.(".choices") || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") pickIdea(idea + 1);
    else if (e.key === "ArrowLeft") pickIdea(idea - 1);
    else if (/^[1-4]$/.test(e.key) && Number(e.key) <= CANDIDATES[set].length) pickIdea(Number(e.key) - 1);
    else if (e.key === "Enter" || e.key === " ") {
      setStoredCandidate(set, idea);
      updateSelectButton();
    }
  });
}
