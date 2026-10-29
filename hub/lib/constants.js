// Paletas fixas — precisam bater com o que o CLAUDE.md instrui o Claude Code
// a usar ao criar boards/labels. Mudar os nomes aqui exige atualizar o
// CLAUDE.md também.

// Board backgrounds are subtle diagonal gradients rather than flat fills —
// reads as more premium. Solid swatch versions (for the picker UI) live in
// BOARD_SWATCH_COLORS below; keep both in sync when adding a color.
export const BOARD_COLORS = {
  blue: "linear-gradient(135deg, #2b7fff 0%, #0b3d91 100%)",
  green: "linear-gradient(135deg, #2fa571 0%, #0d3d29 100%)",
  orange: "linear-gradient(135deg, #e8791a 0%, #6b2c00 100%)",
  red: "linear-gradient(135deg, #e05347 0%, #6e1a14 100%)",
  purple: "linear-gradient(135deg, #8b7af0 0%, #3a2e73 100%)",
  pink: "linear-gradient(135deg, #ef7fc0 0%, #7d2f5f 100%)",
  teal: "linear-gradient(135deg, #2fa8cf 0%, #0e3f4d 100%)",
  dark: "linear-gradient(135deg, #44576b 0%, #0f1720 100%)",
};

// Flat solid version of each board color, for the small picker swatches
// (a gradient reads poorly at 36px, a solid chip reads instantly).
export const BOARD_SWATCH_COLORS = {
  blue: "#2b7fff",
  green: "#2fa571",
  orange: "#e8791a",
  red: "#e05347",
  purple: "#8b7af0",
  pink: "#ef7fc0",
  teal: "#2fa8cf",
  dark: "#44576b",
};

// Pastel fills for a whole list column (not the vivid LABEL_COLORS — those
// are for small chips and read as too loud spread across an entire list
// background). Same color names as LABEL_COLORS so "red" means the same
// hue everywhere, just a soft tint here.
export const LIST_PASTEL_COLORS = {
  green: "#dcf5e7",
  yellow: "#fdf1cf",
  orange: "#fce3cc",
  red: "#fbe0dd",
  purple: "#e9e3fb",
  blue: "#dde9fd",
  sky: "#ddf3fa",
  lime: "#ecf6d8",
  pink: "#fce1ef",
  black: "#e7e9ec",
  grey: "#eef0f2",
};

export const LABEL_COLORS = {
  green: "#4bce97",
  yellow: "#e2b203",
  orange: "#faa53d",
  red: "#f87462",
  purple: "#9f8fef",
  blue: "#579dff",
  sky: "#6cc3e0",
  lime: "#94c748",
  pink: "#e774bb",
  black: "#8590a2",
  grey: "#b3bac5",
};

export const RECURRENCE_LABELS = {
  none: null,
  daily: "Todo dia",
  weekly: "Toda semana",
  weekdays: "Dias úteis",
  custom: "Personalizado",
};

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
