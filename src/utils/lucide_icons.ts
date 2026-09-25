import { icons, type IconNode } from "lucide";

/** Material-style names already used in the UI, mapped to Lucide icon keys. */
export const UI_ICON_MAP = {
  "123": "Binary",
  abc: "CaseSensitive",
  add: "Plus",
  // Lucide names the guide line, not the move axis. Vertical guide = left/center/right
  // (Illustrator Horizontal Align). Horizontal guide = top/middle/bottom (Vertical Align).
  align_horizontal_center: "AlignCenterVertical",
  align_horizontal_left: "AlignStartVertical",
  align_horizontal_right: "AlignEndVertical",
  align_vertical_bottom: "AlignEndHorizontal",
  align_vertical_center: "AlignCenterHorizontal",
  align_vertical_top: "AlignStartHorizontal",
  arrow_downward: "ArrowDown",
  arrow_forward: "ArrowRight",
  auto_fix_high: "WandSparkles",
  battery_0_bar: "Battery",
  battery_2_bar: "BatteryLow",
  battery_3_bar: "BatteryMedium",
  battery_5_bar: "BatteryMedium",
  battery_full: "BatteryFull",
  bluetooth: "Bluetooth",
  border_all: "Square",
  bug_report: "Bug",
  calendar_today: "Calendar",
  cancel_presentation: "SquareX",
  chevron_left: "ChevronLeft",
  chevron_right: "ChevronRight",
  close: "X",
  code: "Code",
  content_copy: "Copy",
  control_camera: "Move",
  crop_square: "Square",
  data_object: "Braces",
  dataset: "Table",
  delete: "Trash2",
  density_medium: "List",
  description: "FileText",
  download: "Download",
  drag_indicator: "GripVertical",
  edit: "Pencil",
  edit_note: "NotebookPen",
  emoji_emotions: "Smile",
  expand: "UnfoldHorizontal",
  expand_more: "ChevronDown",
  fit_screen: "Maximize",
  flip: "FlipHorizontal",
  flip_vertical: "FlipVertical",
  folder: "Folder",
  folder_open: "FolderOpen",
  folder_special: "Library",
  create_new_folder: "FolderPlus",
  cloud: "Cloud",
  format_align_center: "AlignCenter",
  format_align_justify: "AlignJustify",
  format_align_left: "AlignLeft",
  format_align_right: "AlignRight",
  format_bold: "Bold",
  format_color_fill: "PaintBucket",
  format_color_text: "Baseline",
  format_italic: "Italic",
  format_underlined: "Underline",
  format_shapes: "Shapes",
  format_size: "Type",
  grid_on: "Grid3x3",
  help: "CircleHelp",
  history: "History",
  home: "House",
  horizontal_distribute: "AlignHorizontalSpaceAround",
  horizontal_rule: "Minus",
  hourglass_top: "Hourglass",
  image: "Image",
  info: "Info",
  invert_colors: "Blend",
  more_horiz: "Ellipsis",
  line_weight: "Minus",
  lock: "Lock",
  lock_open: "LockOpen",
  logout: "LogOut",
  mail: "Mail",
  person: "User",
  picture_as_pdf: "FileCode",
  power: "Power",
  power_off: "PowerOff",
  print: "Printer",
  qr_code_2: "QrCode",
  radio_button_unchecked: "Circle",
  receipt_long: "ReceiptText",
  redo: "Redo2",
  refresh: "RefreshCw",
  remove: "Minus",
  rotate_left: "RotateCcw",
  rotate_right: "RotateCw",
  rounded_corner: "Radius",
  save: "Save",
  search: "Search",
  schedule: "Clock",
  sd_storage: "HardDrive",
  segment: "Layers",
  sentiment_very_dissatisfied: "Frown",
  settings: "Settings",
  settings_ethernet: "Cable",
  swap_horiz: "ArrowLeftRight",
  swap_vert: "ArrowUpDown",
  tag: "Tag",
  text_decrease: "AArrowDown",
  text_format: "CaseSensitive",
  text_increase: "AArrowUp",
  title: "Type",
  undo: "Undo2",
  upload: "Upload",
  unfold_more: "ChevronsUpDown",
  usb: "Usb",
  vertical_align_bottom: "AlignEndHorizontal",
  vertical_align_center: "AlignCenterHorizontal",
  vertical_align_top: "AlignStartHorizontal",
  vertical_distribute: "AlignVerticalSpaceAround",
  view_week: "Barcode",
  visibility: "Eye",
  warning: "TriangleAlert",
  widgets: "LayoutGrid",
  wrap_text: "WrapText",
  zoom_in: "ZoomIn",
  zoom_out: "ZoomOut",
} as const;

export type AppIconName = keyof typeof UI_ICON_MAP;

const isIconNode = (value: unknown): value is IconNode => Array.isArray(value);

const attrsToString = (attrs: Record<string, string | number | undefined>): string =>
  Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(" ");

export function lucideIconToSvg(name: string, stroke = "currentColor"): string {
  const node = icons[name as keyof typeof icons];
  if (!isIconNode(node)) {
    throw new Error(`Unknown Lucide icon: ${name}`);
  }

  const children = node.map(([tag, attrs]) => `<${tag} ${attrsToString(attrs)} />`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

export function uiIconToSvg(icon: AppIconName, stroke = "currentColor"): string {
  return lucideIconToSvg(UI_ICON_MAP[icon], stroke);
}

export function lucideSearchKey(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export function getLucidePackNames(): string[] {
  const seen = new Set<IconNode>();
  const names: string[] = [];

  for (const [name, node] of Object.entries(icons)) {
    if (!isIconNode(node) || seen.has(node) || name.startsWith("Lucide") || name.endsWith("Icon")) {
      continue;
    }
    seen.add(node);
    names.push(name);
  }

  return names.sort((a, b) => lucideSearchKey(a).localeCompare(lucideSearchKey(b)));
}
