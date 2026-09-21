<script lang="ts">
  import * as fabric from "fabric";
  import { onDestroy, onMount, tick } from "svelte";
  import { appConfig, automation, connectionState, csvData, loadedFonts } from "$/stores";
  import {
    ExportedLabelTemplateSchema,
    type ExportedLabelTemplate,
    type FabricJson,
    type LabelProps,
    type MoveDirection,
    type OjectType,
  } from "$/types";
  import { FileUtils } from "$/utils/file_utils";
  import { tr } from "$/utils/i18n";
  import { LabelDesignerObjectHelper } from "$/utils/label_designer_object_helper";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import { Toasts } from "$/utils/toasts";
  import { UndoRedo, type UndoState } from "$/utils/undo_redo";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import CustomScroll from "$/components/basic/CustomScroll.svelte";
  import PrintPreview from "$/components/PrintPreview.svelte";
  import { DEFAULT_LABEL_PROPS, GRID_SIZE, OBJECT_DEFAULTS } from "$/defaults";
  import { LabelDesignerUtils } from "$/utils/label_designer_utils";
  import { CustomCanvas } from "$/fabric-object/custom_canvas";
  import { CanvasUtils } from "$/utils/canvas_utils";
  import ElementPalette from "$/components/workspace/ElementPalette.svelte";
  import LayersPanel from "$/components/workspace/LayersPanel.svelte";
  import InspectorPanel from "$/components/workspace/InspectorPanel.svelte";
  import LabelSettingsPanel from "$/components/workspace/LabelSettingsPanel.svelte";
  import ObjectSettingsPanel from "$/components/workspace/ObjectSettingsPanel.svelte";
  import CanvasRulers from "$/components/workspace/CanvasRulers.svelte";
  import { DEFAULT_DPMM, rotateLabelProps } from "$/utils/label_geometry";
  import { cloneLabelTemplate, normalizeLabelPrintDirection } from "$/utils/label_template";
  import { Button, IconButton, Menu, MenuItem } from "$/components/ui";
  import RenameLabelDialog from "$/components/workspace/RenameLabelDialog.svelte";
  import LabelPropertiesDialog from "$/components/workspace/LabelPropertiesDialog.svelte";
  import CsvPageStrip from "$/components/workspace/CsvPageStrip.svelte";
  import CsvControl from "$/components/designer-controls/CsvControl.svelte";
  import { CSV_FIELD_MIME, csvVariableToken, parseCsvTable } from "$/utils/csv_source";
  import { applyCsvPreview, cloneFabricJson, getCsvSource, serializeCanvasJson, setBoundText } from "$/utils/csv_preview";
  import { applyCanvasLayerOrder, listCanvasLayers, moveLayer } from "$/utils/canvas_layers";
  import { extractFormFieldsFromCanvas } from "$/utils/form_fields";
  import { isPublishedForm, publishForm } from "$/utils/form_store";

  interface Props {
    autoLoad?: boolean;
    onSaved?: () => void;
    fileRenamed?: (title: string) => void;
    onUrlLoaded?: (label: ExportedLabelTemplate) => void;
    onDeleted?: () => void;
    onBeforeUnmount?: () => void;
    onOpenForm?: (sourceId: string) => void;
  }

  let { autoLoad = true, onSaved, fileRenamed, onUrlLoaded, onDeleted, onBeforeUnmount, onOpenForm }: Props = $props();

  let htmlCanvas: HTMLCanvasElement;
  let canvasStage: HTMLDivElement | undefined = $state();
  let canvasHost: HTMLDivElement | undefined = $state();

  let fabricCanvas = $state.raw<CustomCanvas | undefined>();
  let labelProps = $state<LabelProps>(DEFAULT_LABEL_PROPS);
  let previewOpened = $state<boolean>(false);
  let selectedObject = $state.raw<fabric.FabricObject | undefined>(undefined);
  let selectedCount = $state<number>(0);
  let editRevision = $state<number>(0);
  let layerRevision = $state<number>(0);
  let printNow = $state<boolean>(false);
  let csvEnabled = $state<boolean>(false);
  let csvPage = $state(0);
  let pageCanvases = $state<FabricJson[]>([]);
  let csvPreviewRevision = $state(0);
  let windowWidth = $state<number>(0);
  let undoState = $state<UndoState>({ undoDisabled: false, redoDisabled: false });
  let zoomRatio = $state(1);
  let zoomInput = $state("100");
  let zoomFocused = $state(false);
  let rulerRevision = $state(0);
  let labelOrigin = $state({ x: 0, y: 0 });
  let labelTitle = $state<string>("");
  let savedId = $state<string | undefined>(undefined);
  let pendingLabel = $state<ExportedLabelTemplate | undefined>(undefined);
  let pendingCsvEnabled = $state<boolean | undefined>(undefined);
  let renameOpen = $state(false);
  let propertiesOpen = $state(false);
  let ignoreNextPasteEvent = false;

  const undo = new UndoRedo();

  const discardSelection = () => {
    fabricCanvas!.discardActiveObject();
    fabricCanvas!.requestRenderAll();
    selectedObject = undefined;
    selectedCount = 0;
    editRevision = 0;
  };

  const loadLabelData = async (data: ExportedLabelTemplate) => {
    undo.paused = true;
    onUpdateLabelProps(normalizeLabelPrintDirection(data.label));
    if (data.csv) {
      $csvData = data.csv;
      csvEnabled = true;
      csvPage = data.csv.page ?? 0;
      pageCanvases = (data.csv.pageCanvases ?? []).map((json) => cloneFabricJson(json));
    }
    try {
      await FileUtils.loadCanvasState(fabricCanvas!, data.canvas);
      if (csvEnabled) {
        alignPageCanvases(data.canvas);
      }
      refreshCsvPreview();
    } catch (error) {
      Toasts.error(error);
    }
    layerRevision++;
    undo.paused = false;
  };

  undo.onLabelUpdate = loadLabelData;
  undo.onStateUpdate = (state: UndoState) => {
    undoState = state;
  };
  undo.capture = () => (csvEnabled ? { csv: csvSnapshot() } : {});

  const csvTable = $derived(parseCsvTable($csvData.data));
  const csvColumns = $derived(csvEnabled ? csvTable.columns : []);
  const csvRows = $derived(csvEnabled ? csvTable.rows : []);
  const csvVariables = $derived(csvRows[csvPage] ?? {});
  const designerLayers = $derived.by(() => {
    layerRevision;
    editRevision;
    return listCanvasLayers(fabricCanvas);
  });

  const refreshCsvPreview = () => {
    if (!fabricCanvas) {
      return;
    }
    applyCsvPreview(fabricCanvas, csvEnabled ? csvVariables : undefined);
    csvPreviewRevision++;
  };

  const commitCurrentPage = () => {
    if (!fabricCanvas || !csvEnabled || csvRows.length === 0) {
      return;
    }
    const index = Math.max(0, Math.min(csvRows.length - 1, csvPage));
    const next = pageCanvases.slice();
    next[index] = serializeCanvasJson(fabricCanvas);
    pageCanvases = next;
  };

  const alignPageCanvases = (template?: FabricJson) => {
    if (!csvEnabled || csvRows.length === 0) {
      pageCanvases = [];
      return;
    }
    const source = template ?? (fabricCanvas ? serializeCanvasJson(fabricCanvas) : pageCanvases[0]);
    if (!source) {
      pageCanvases = [];
      return;
    }
    pageCanvases = csvRows.map((_, index) => cloneFabricJson(pageCanvases[index] ?? source));
    csvPage = Math.max(0, Math.min(pageCanvases.length - 1, csvPage));
    pageCanvases[csvPage] = cloneFabricJson(source);
  };

  const csvSnapshot = (): ExportedLabelTemplate["csv"] => {
    commitCurrentPage();
    return {
      ...$csvData,
      page: csvPage,
      pageCanvases: pageCanvases.map((json) => cloneFabricJson(json)),
    };
  };

  const loadPageCanvas = async (index: number) => {
    const json = pageCanvases[index];
    if (!fabricCanvas || !json) {
      refreshCsvPreview();
      return;
    }
    await FileUtils.loadCanvasState(fabricCanvas, json);
    discardSelection();
    refreshCsvPreview();
  };

  const setCsvPage = (next: number) => {
    if (csvRows.length === 0) {
      csvPage = 0;
      return;
    }
    const clamped = Math.max(0, Math.min(csvRows.length - 1, next));
    if (clamped === csvPage) {
      refreshCsvPreview();
      return;
    }
    commitCurrentPage();
    csvPage = clamped;
    void loadPageCanvas(csvPage);
  };

  const onCsvImported = () => {
    commitCurrentPage();
    alignPageCanvases();
    csvPage = 0;
    void loadPageCanvas(0);
    editRevision++;
  };

  const onCsvCleared = () => {
    csvPage = 0;
    pageCanvases = [];
    refreshCsvPreview();
    editRevision++;
  };

  const deleteSelected = () => {
    LabelDesignerUtils.deleteSelection(fabricCanvas!);
    discardSelection();
  };

  const cloneSelected = () => {
    LabelDesignerUtils.cloneSelection(fabricCanvas!).then(() => undo.push(fabricCanvas!, labelProps));
  };

  const moveSelected = (direction: MoveDirection, ctrl?: boolean) => {
    LabelDesignerUtils.moveSelection(fabricCanvas!, direction, ctrl);
    undo.push(fabricCanvas!, labelProps);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const key: string = e.key.toLowerCase();
    // windows and linux users are used to ctrl, mac users use cmd
    const cmdOrCtrl = e.metaKey || e.ctrlKey;

    // Esc
    if (key === "escape") {
      discardSelection();
      return;
    }

    if (LabelDesignerUtils.isAnyInputFocused(fabricCanvas!)) {
      return;
    }

    // Arrows
    if (key.startsWith("arrow")) {
      moveSelected(key.slice("arrow".length) as MoveDirection, cmdOrCtrl);
      return;
    }

    if (e.repeat) {
      return;
    }

    // Ctrl + D
    if (cmdOrCtrl && key === "d") {
      e.preventDefault();
      cloneSelected();
      return;
    }

    // Ctrl + Y, Ctrl + Shift + Z
    if ((cmdOrCtrl && key === "y") || (cmdOrCtrl && e.shiftKey && key === "z")) {
      e.preventDefault();
      if (!undoState.redoDisabled) {
        undo.redo();
      }
      return;
    }

    // Ctrl + Z
    if (cmdOrCtrl && key === "z") {
      e.preventDefault();
      if (!undoState.undoDisabled) {
        undo.undo();
      }
      return;
    }

    // Del
    if (key === "delete" || key === "backspace") {
      deleteSelected();
      return;
    }

    // Ctrl + C
    if (cmdOrCtrl && key === "c") {
      if (copySelectionToClipboard()) {
        e.preventDefault();
      }
      return;
    }

    // Ctrl + X
    if (cmdOrCtrl && key === "x") {
      if (copySelectionToClipboard()) {
        e.preventDefault();
        deleteSelected();
        undo.push(fabricCanvas!, labelProps);
      }
      return;
    }

    // Ctrl + V — keep working after a page click, when the paste event is empty
    if (cmdOrCtrl && key === "v") {
      const objects = LabelDesignerUtils.peekClipboardObjects();
      if (objects && shouldHandleDesignerClipboard()) {
        e.preventDefault();
        ignoreNextPasteEvent = true;
        void pasteDesignerObjects(objects).finally(() => {
          queueMicrotask(() => {
            ignoreNextPasteEvent = false;
          });
        });
      }
    }
  };

  const shouldHandleDesignerClipboard = () => {
    if (!fabricCanvas || previewOpened || renameOpen) {
      return false;
    }
    if (LabelDesignerUtils.isAnyInputFocused(fabricCanvas)) {
      return false;
    }
    return document.querySelectorAll("[role='menu']").length === 0;
  };

  const copySelectionToClipboard = (data?: DataTransfer | null) => {
    if (!fabricCanvas || !shouldHandleDesignerClipboard()) {
      return false;
    }
    const objects = LabelDesignerUtils.serializeSelection(fabricCanvas);
    if (!objects) {
      return false;
    }
    LabelDesignerUtils.writeClipboardPayload(objects, data);
    return true;
  };

  const onCopy = (event: ClipboardEvent) => {
    if (!shouldHandleDesignerClipboard() || fabricCanvas!.getActiveObjects().length === 0) {
      return;
    }
    event.preventDefault();
    copySelectionToClipboard(event.clipboardData);
  };

  const onCut = (event: ClipboardEvent) => {
    if (!shouldHandleDesignerClipboard() || fabricCanvas!.getActiveObjects().length === 0) {
      return;
    }
    event.preventDefault();
    if (copySelectionToClipboard(event.clipboardData)) {
      deleteSelected();
      undo.push(fabricCanvas!, labelProps);
    }
  };

  const onUpdateLabelProps = (newProps: LabelProps) => {
    labelProps = newProps;
    fabricCanvas!.setDimensions(labelProps.size);
    fabricCanvas!.virtualZoom(fabricCanvas!.getVirtualZoom());
    requestAnimationFrame(centerArtboard);
    try {
      LocalStoragePersistence.saveLastLabelProps(labelProps);
      undo.push(fabricCanvas!, labelProps);
    } catch (e) {
      Toasts.zodErrors(e, "Label parameters save error:");
    }
  };

  const exportCurrentLabel = (): ExportedLabelTemplate => {
    if (csvEnabled) {
      $csvData = csvSnapshot() ?? $csvData;
    }
    const label = FileUtils.makeExportedLabel(fabricCanvas!, normalizeLabelPrintDirection(labelProps), csvEnabled);
    label.title = labelTitle || label.title;
    if (savedId) {
      label.id = savedId;
    }
    return label;
  };

  export function getSnapshot(): ExportedLabelTemplate {
    return exportCurrentLabel();
  }

  export function getCsvEnabled(): boolean {
    return csvEnabled;
  }

  export function setLabelTitle(title: string) {
    labelTitle = title;
  }

  export async function applyLabel(data: ExportedLabelTemplate, enableCsv?: boolean) {
    if (!fabricCanvas) {
      pendingLabel = data;
      pendingCsvEnabled = enableCsv;
      return;
    }
    labelTitle = data.title ?? "";
    savedId = data.id?.startsWith("saved_label") ? data.id : undefined;
    csvEnabled = enableCsv ?? !!data.csv;
    await loadLabelData(data);
    undo.push(fabricCanvas!, labelProps);
  }

  const onLoadRequested = (label: ExportedLabelTemplate) => {
    loadLabelData(label).then(() => undo.push(fabricCanvas!, labelProps));
  };

  const zplImageReady = async (img: Blob) => {
    await LabelDesignerObjectHelper.addImageBlob(fabricCanvas!, img);
    undo.push(fabricCanvas!, labelProps);
  };

  const pdfImageReady = async (el: HTMLCanvasElement) => {
    const img = new fabric.FabricImage(el, {
      ...OBJECT_DEFAULTS,
      left: 0,
      top: 0,
    });

    fabricCanvas!.add(img);
    fabricCanvas!.setActiveObject(img);
    undo.push(fabricCanvas!, labelProps);
  };

  const onObjectPicked = (objectType: OjectType) => {
    const obj = LabelDesignerObjectHelper.addObject(fabricCanvas!, objectType);
    if (obj !== undefined) {
      obj.set({ dirty: true });
      obj.setCoords();
      fabricCanvas!.setActiveObject(obj);
      refreshCsvPreview();
      undo.push(fabricCanvas!, labelProps);
    }
  };

  const onSvgIconPicked = (i: string) => {
    LabelDesignerObjectHelper.addSvg(fabricCanvas!, i);
    undo.push(fabricCanvas!, labelProps);
  };

  const selectLayer = (obj: fabric.FabricObject) => {
    if (!fabricCanvas) {
      return;
    }
    LabelDesignerUtils.selectObjects(fabricCanvas, [obj]);
    selectedObject = obj;
    selectedCount = 1;
    editRevision++;
  };

  const reorderLayers = (fromIndex: number, insertBefore: number) => {
    if (!fabricCanvas) {
      return;
    }
    const current = listCanvasLayers(fabricCanvas).map((layer) => layer.object);
    const next = moveLayer(current, fromIndex, insertBefore);
    if (next === current) {
      return;
    }
    applyCanvasLayerOrder(fabricCanvas, next);
    undo.push(fabricCanvas, labelProps);
    layerRevision++;
  };

  const cloneLayer = (obj: fabric.FabricObject) => {
    selectLayer(obj);
    cloneSelected();
  };

  const deleteLayer = (obj: fabric.FabricObject) => {
    if (!fabricCanvas) {
      return;
    }
    const wasSelected = fabricCanvas.getActiveObjects().includes(obj);
    fabricCanvas.remove(obj);
    if (wasSelected) {
      discardSelection();
    }
  };

  const bringLayerToFront = (obj: fabric.FabricObject) => {
    if (!fabricCanvas) {
      return;
    }
    fabricCanvas.bringObjectToFront(obj);
    fabricCanvas.requestRenderAll();
    undo.push(fabricCanvas, labelProps);
    layerRevision++;
  };

  const sendLayerToBack = (obj: fabric.FabricObject) => {
    if (!fabricCanvas) {
      return;
    }
    fabricCanvas.sendObjectToBack(obj);
    fabricCanvas.requestRenderAll();
    undo.push(fabricCanvas, labelProps);
    layerRevision++;
  };

  export const openPreview = () => {
    printNow = false;
    previewOpened = true;
  };

  export function exportPng() {
    if (!fabricCanvas) {
      return;
    }
    FileUtils.saveCanvasAsPng(fabricCanvas);
  }

  const openPreviewAndPrint = () => {
    printNow = true;
    previewOpened = true;
  };

  const controlValueUpdated = () => {
    if (selectedObject) {
      selectedObject.setCoords();
      selectedObject.dirty = true;
      undo.push(fabricCanvas!, labelProps);
    }
    applyCsvPreview(fabricCanvas!, csvEnabled ? csvVariables : undefined);
    fabricCanvas!.requestRenderAll();

    // trigger reactivity for controls
    editRevision++;
  };

  const getCanvasForPreview = (page?: number): FabricJson => {
    if (page == null || page === csvPage || !pageCanvases[page]) {
      return serializeCanvasJson(fabricCanvas!);
    }
    return cloneFabricJson(pageCanvases[page]);
  };

  const addCsvField = (name: string, pos?: { x: number; y: number }) => {
    const token = csvVariableToken(name);
    const obj = LabelDesignerObjectHelper.addText(fabricCanvas!, token, {
      textAlign: "left",
      originX: "left",
      originY: "top",
      ...(pos ? { left: pos.x, top: pos.y } : {}),
    });
    setBoundText(obj, token, csvVariables);
    if ($csvData.printColumnNames) {
      LabelDesignerObjectHelper.addStaticText(fabricCanvas!, name, {
        left: obj.left,
        top: (obj.top ?? 0) - 4,
        originX: "left",
        originY: "bottom",
        fontSize: 10,
        textAlign: "left",
      });
    }
    fabricCanvas!.setActiveObject(obj);
    refreshCsvPreview();
    undo.push(fabricCanvas!, labelProps);
  };

  const pasteDesignerObjects = async (objects: Record<string, unknown>[]) => {
    if (!fabricCanvas) {
      return false;
    }
    const pasted = await LabelDesignerUtils.pasteObjects(fabricCanvas, objects);
    if (pasted) {
      refreshCsvPreview();
      undo.push(fabricCanvas, labelProps);
      return true;
    }
    return false;
  };

  const onPaste = async (event: ClipboardEvent) => {
    if (ignoreNextPasteEvent) {
      event.preventDefault();
      return;
    }
    if (!shouldHandleDesignerClipboard()) {
      return;
    }

    if (event.clipboardData != null) {
      const objects = LabelDesignerUtils.readClipboardObjects(event.clipboardData);
      if (objects) {
        event.preventDefault();
        await pasteDesignerObjects(objects);
        return;
      }

      event.preventDefault();
      const obj = await LabelDesignerObjectHelper.addObjectFromClipboard(fabricCanvas!, event.clipboardData);

      if (obj !== undefined) {
        fabricCanvas!.setActiveObject(obj);
        refreshCsvPreview();
        undo.push(fabricCanvas!, labelProps);
      }
    }
  };

  const clearCanvas = () => {
    if (!confirm($tr("editor.clear.confirm"))) {
      return;
    }
    undo.push(fabricCanvas!, labelProps);
    fabricCanvas!.clear();
  };

  const renameCurrentLabel = (title: string) => {
    labelTitle = title;
    if (savedId && !LocalStoragePersistence.renameLabel(savedId, title)) {
      Toasts.error("Label rename error");
    }
    try {
      onSaved?.();
    } finally {
      fileRenamed?.(title);
    }
  };

  const duplicateCurrentLabel = () => {
    if (!onUrlLoaded) {
      return;
    }
    const copy = cloneLabelTemplate(exportCurrentLabel());
    copy.id = undefined;
    copy.timestamp = FileUtils.timestamp();
    copy.title = `${copy.title || $tr("editor.untitled")} copy`;
    onUrlLoaded(copy);
  };

  const deleteCurrentLabel = () => {
    if (!confirm($tr("editor.delete.confirm"))) {
      return;
    }
    if (savedId) {
      const next = LocalStoragePersistence.loadLabels().filter((item) => item.id !== savedId);
      LocalStoragePersistence.saveLabels(next);
      savedId = undefined;
      onSaved?.();
    }
    if (onDeleted) {
      onDeleted();
      return;
    }
    fabricCanvas?.clear();
  };

  const exportCurrentFile = () => {
    try {
      FileUtils.saveLabelAsJson(exportCurrentLabel());
    } catch (error) {
      Toasts.zodErrors(error, "Label export error:");
    }
  };

  const importElementsFromFile = async () => {
    if (!fabricCanvas) {
      return;
    }
    try {
      const contents = await FileUtils.pickAndReadSingleTextFile("json");
      const label = ExportedLabelTemplateSchema.parse(JSON.parse(contents));
      const source = label.canvas;
      if (!source?.objects?.length) {
        return;
      }

      const temp = new CustomCanvas(undefined, {
        width: label.label.size.width,
        height: label.label.size.height,
        enableRetinaScaling: false,
      });
      await FileUtils.loadCanvasState(temp, source);
      const imported = [...temp.getObjects()];
      for (const obj of imported) {
        temp.remove(obj);
        fabricCanvas.add(obj);
      }
      temp.dispose();
      fabricCanvas.requestRenderAll();
      undo.push(fabricCanvas, labelProps);
      Toasts.message($tr("editor.import.done"));
    } catch (error) {
      Toasts.zodErrors(error, "Label import error:");
    }
  };

  const toggleGrid = () => {
    const newVal = !$appConfig.gridEnabled;
    appConfig.update((cfg) => ({ ...cfg, gridEnabled: newVal }));
    fabricCanvas?.setGridEnabled(newVal);
  };

  const loadLabelFromUrl = async () => {
    try {
      const urlTemplate = await FileUtils.readLabelFromUrl();

      if (urlTemplate !== null && confirm($tr("params.saved_labels.load.url.warn"))) {
        if (onUrlLoaded) {
          onUrlLoaded(urlTemplate);
        } else {
          onLoadRequested(urlTemplate);
        }
        Toasts.message($tr("params.saved_labels.load.url.loaded"));
        return true;
      }
    } catch (e) {
      Toasts.error(e);
    }
    return false;
  }

  const loadDefaultLabel = async () => {
    const urlLoaded = await loadLabelFromUrl();

    if (urlLoaded) {
      return;
    }

    if (!autoLoad) {
      return;
    }

    try {
      const defaultTemplate = LocalStoragePersistence.loadDefaultTemplate();

      if (defaultTemplate !== null) {
        onLoadRequested(defaultTemplate);
        return;
      }
    } catch (e) {
      Toasts.error(e);
    }

    LabelDesignerObjectHelper.addText(fabricCanvas!, $tr("editor.default_text"));
  };

  const saveCurrentLabel = () => {
    const label = exportCurrentLabel();
    label.title = labelTitle.trim() || $tr("editor.untitled");
    const saved = LocalStoragePersistence.loadLabels();
    const index = saved.findIndex((item) => item.id === savedId);
    if (index >= 0) {
      saved[index] = label;
    } else {
      saved.push(label);
    }
    const { zodErrors, otherErrors } = LocalStoragePersistence.saveLabels(saved);
    zodErrors.forEach((e) => Toasts.zodErrors(e, "Label save error"));
    otherErrors.forEach((e) => Toasts.error(e));
    if (zodErrors.length === 0 && otherErrors.length === 0) {
      const reloaded = LocalStoragePersistence.loadLabels();
      const match =
        reloaded.find((item) => item.title === label.title && item.timestamp === label.timestamp) ??
        reloaded[reloaded.length - 1];
      savedId = match?.id;
      labelTitle = label.title;
      Toasts.message($tr("editor.save.done"));
      onSaved?.();
      return savedId;
    }
    return undefined;
  };

  const formFields = $derived.by(() => {
    void editRevision;
    void layerRevision;
    void csvPreviewRevision;
    return extractFormFieldsFromCanvas(fabricCanvas);
  });

  const saveAsForm = () => {
    const id = saveCurrentLabel();
    if (!id) {
      return;
    }
    if (formFields.length === 0) {
      Toasts.message($tr("forms.save.need_fields"));
      return;
    }
    publishForm(id);
    Toasts.message($tr("forms.save.done"));
    onSaved?.();
  };

  const rotatePaper = () => {
    onUpdateLabelProps(rotateLabelProps(labelProps));
  };

  const centerArtboard = () => {
    const stage = canvasStage;
    if (!stage) {
      return;
    }
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
    rulerRevision++;
  };

  const panArtboard = (dx: number, dy: number) => {
    if (!canvasStage) {
      return;
    }
    canvasStage.scrollLeft -= dx;
    canvasStage.scrollTop -= dy;
    rulerRevision++;
  };

  const artboardWheel = (node: HTMLElement) => {
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.deltaY > 0) {
          fabricCanvas?.virtualZoomOut();
        } else if (event.deltaY < 0) {
          fabricCanvas?.virtualZoomIn();
        }
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return {
      destroy() {
        node.removeEventListener("wheel", onWheel, true);
      },
    };
  };

  const applyTypedZoom = () => {
    const parsed = Number.parseFloat(zoomInput.replace("%", "").trim());
    if (!Number.isFinite(parsed)) {
      zoomInput = String(Math.round(zoomRatio * 100));
      return;
    }
    fabricCanvas?.virtualZoom(parsed / 100);
    zoomInput = String(Math.round((fabricCanvas?.getVirtualZoom() ?? parsed / 100) * 100));
  };

  const renderOnFontsChanged = () => {
    fabricCanvas?.forEachObject((o) => {
      if (o instanceof fabric.Textbox) {
        o.dirty = true;
      }
    });
    fabricCanvas?.requestRenderAll();
  };

  onMount(async () => {
    try {
      const savedLabelProps = LocalStoragePersistence.loadLastLabelProps();
      if (savedLabelProps !== null) {
        labelProps = normalizeLabelPrintDirection(savedLabelProps);
      }
    } catch (e) {
      Toasts.zodErrors(e, "Label parameters load error:");
    }

    const canvas = new CustomCanvas(htmlCanvas, {
      width: labelProps.size.width,
      height: labelProps.size.height,
    });
    fabricCanvas = canvas;
    canvas.setLabelProps(labelProps);
    canvas.onZoomChange = (z) => {
      zoomRatio = z;
      if (!zoomFocused) {
        zoomInput = String(Math.round(z * 100));
      }
      labelOrigin = canvas.getLabelOriginScreen();
      requestAnimationFrame(centerArtboard);
    };
    canvas.onPan = panArtboard;
    canvas.onArtboardFrame = (next, prev, shift) => {
      labelOrigin = { x: next.originX * next.zoom, y: next.originY * next.zoom };
      if (prev.zoom === next.zoom && canvasStage && (shift.x !== 0 || shift.y !== 0)) {
        canvasStage.scrollLeft += shift.x;
        canvasStage.scrollTop += shift.y;
      }
      rulerRevision++;
    };
    canvas.setGridEnabled(!!$appConfig.gridEnabled);

    if (pendingLabel) {
      const queued = pendingLabel;
      const queuedCsv = pendingCsvEnabled;
      pendingLabel = undefined;
      pendingCsvEnabled = undefined;
      await applyLabel(queued, queuedCsv);
    } else {
      await loadDefaultLabel();
    }

    window.addEventListener("hashchange", loadLabelFromUrl);

    undo.push(canvas, labelProps);
    requestAnimationFrame(centerArtboard);

    canvas.on("object:moving", (e): void => {
      if (e.target && e.target.left !== undefined && e.target.top !== undefined) {
        e.target.set({
          left: Math.round(e.target.left / GRID_SIZE) * GRID_SIZE,
          top: Math.round(e.target.top / GRID_SIZE) * GRID_SIZE,
        });
      }
    });

    canvas.on("object:modified", (e): void => {
      if (e.target) {
        CanvasUtils.bakeTextObjectScale(e.target);
      }
      undo.push(canvas, labelProps);
    });

    canvas.on("text:changed", () => {
      editRevision++;
    });

    canvas.on("object:removed", (): void => {
      undo.push(canvas, labelProps);
      layerRevision++;
    });

    const syncSelection = (selected?: fabric.FabricObject[]) => {
      const active = canvas.getActiveObject();
      selectedCount = selected?.length ?? 0;
      selectedObject = active ?? (selected && selected.length > 0 ? selected[0] : undefined);
      editRevision++;
    };

    canvas.on("selection:created", (e): void => {
      syncSelection(e.selected);
    });

    canvas.on("selection:updated", (e): void => {
      syncSelection(e.selected);
    });

    canvas.on("selection:cleared", (): void => {
      selectedObject = undefined;
      selectedCount = 0;
      editRevision++;
    });

    canvas.on("dragover", (e): void => {
      e.e.preventDefault();
    });

    canvas.on("drop:after", async (e): Promise<void> => {
      const dragEvt = e.e as DragEvent;
      dragEvt.preventDefault();

      const field = dragEvt.dataTransfer?.getData(CSV_FIELD_MIME);
      if (field) {
        const point = canvas.getScenePoint(dragEvt);
        addCsvField(field, { x: point.x, y: point.y });
        return;
      }

      let dropped = false;

      if (dragEvt.dataTransfer?.files) {
        for (const file of dragEvt.dataTransfer.files) {
          try {
            await LabelDesignerObjectHelper.addImageFile(canvas, file);
            dropped = true;
          } catch (e) {
            Toasts.error(e);
          }
        }

        if (dropped) {
          undo.push(canvas, labelProps);
        }
      }
    });

    const boundEditors = new WeakSet<fabric.FabricObject>();
    const bindCsvEditing = (obj?: fabric.FabricObject) => {
      if (!obj || !(obj instanceof fabric.IText) || boundEditors.has(obj)) {
        return;
      }
      boundEditors.add(obj);
      obj.on("editing:entered", () => {
        const source = getCsvSource(obj);
        if (!source) {
          return;
        }
        obj.set({ text: source });
        const end = obj.text?.length ?? 0;
        obj.selectionStart = end;
        obj.selectionEnd = end;
      });
      obj.on("editing:exited", () => {
        const source = obj.text ?? "";
        setBoundText(obj, source, csvVariables);
        refreshCsvPreview();
        undo.push(canvas, labelProps);
      });
    };

    canvas.on("object:added", (e) => {
      bindCsvEditing(e.target);
      layerRevision++;
    });
    canvas.getObjects().forEach((obj) => bindCsvEditing(obj));

    canvas.on("object:scaling", (e): void => {
      if (!e.target) {
        return;
      }

      CanvasUtils.fixFabricObjectScale(e.target);
    });

    // userFonts.subscribe((e) => {console.log(e); renderOnFontsChanged();});

    if ($automation !== undefined) {
      if ($automation.startPrint !== undefined) {
        if ($automation.startPrint === "immediately") {
          openPreview();
        } else if ($automation.startPrint === "after_connect") {
          const unsubscribe = connectionState.subscribe((st) => {
            if (st === "connected") {
              tick().then(() => unsubscribe());
              openPreviewAndPrint();
            }
          });
        }
      }
    }
  });

  onDestroy(() => {
    try {
      onBeforeUnmount?.();
    } catch (error) {
      console.error(error);
    }
    fabricCanvas?.dispose();
    window.removeEventListener("hashchange", loadLabelFromUrl);
  });

  $effect(() => {
    const stage = canvasStage;
    if (!stage) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (stage.clientWidth > 0 && stage.scrollWidth > stage.clientWidth) {
        if (stage.scrollLeft === 0 && stage.scrollTop === 0) {
          centerArtboard();
        }
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  });

  $effect(() => {
    fabricCanvas?.setLabelProps(labelProps);
  });

  $effect(() => {
    fabricCanvas?.setGridEnabled(!!$appConfig.gridEnabled);
  });

  $effect(() => {
    if (!previewOpened) {
      printNow = false;
    }
  });

  $effect(() => {
    if ($loadedFonts) {
      renderOnFontsChanged();
    }
  });

  $effect(() => {
    if (csvRows.length === 0) {
      if (csvPage !== 0) {
        csvPage = 0;
      }
      return;
    }
    if (csvPage > csvRows.length - 1) {
      setCsvPage(csvRows.length - 1);
    }
  });

  $effect(() => {
    csvEnabled;
    csvVariables;
    if (!fabricCanvas) {
      return;
    }
    applyCsvPreview(fabricCanvas, csvEnabled ? csvVariables : undefined);
  });
</script>

<svelte:window bind:innerWidth={windowWidth} onkeydown={onKeyDown} oncopy={onCopy} oncut={onCut} onpaste={onPaste} />

<div class="image-editor designer-root">
  <div class="designer-workspace">
    <aside class="designer-side designer-left">
      <section class="file-name-header">
        <h3 class="file-name-header__title">{labelTitle.trim() || $tr("editor.untitled")}</h3>
        <Menu>
          {#snippet trigger({ toggle })}
            <IconButton title={$tr("editor.more")} aria-label={$tr("editor.more")} onclick={toggle}>
              <MdIcon icon="more_horiz" />
            </IconButton>
          {/snippet}
          <MenuItem disabled={undoState.undoDisabled} onclick={() => undo.undo()}>
            <MdIcon icon="undo" />
            {$tr("editor.undo")}
          </MenuItem>
          <MenuItem disabled={undoState.redoDisabled} onclick={() => undo.redo()}>
            <MdIcon icon="redo" />
            {$tr("editor.redo")}
          </MenuItem>
          <div class="my-1 h-px bg-line"></div>
          <MenuItem onclick={clearCanvas}>
            <MdIcon icon="cancel_presentation" />
            {$tr("editor.clear")}
          </MenuItem>
          <MenuItem onclick={() => (renameOpen = true)}>
            <MdIcon icon="edit" />
            {$tr("editor.rename")}
          </MenuItem>
          <MenuItem onclick={() => (propertiesOpen = true)}>
            <MdIcon icon="settings" />
            {$tr("params.label.menu_title")}
          </MenuItem>
          <MenuItem disabled={formFields.length === 0} onclick={saveAsForm}>
            <MdIcon icon="assignment" />
            {$tr("forms.save")}
          </MenuItem>
          {#if savedId && isPublishedForm(savedId) && onOpenForm}
            <MenuItem onclick={() => onOpenForm(savedId!)}>
              <MdIcon icon="assignment" />
              {$tr("forms.open")}
            </MenuItem>
          {/if}
          <MenuItem onclick={duplicateCurrentLabel}>
            <MdIcon icon="content_copy" />
            {$tr("editor.duplicate")}
          </MenuItem>
          <MenuItem onclick={deleteCurrentLabel}>
            <MdIcon icon="delete" />
            {$tr("editor.delete")}
          </MenuItem>
          <div class="my-1 h-px bg-line"></div>
          <MenuItem onclick={exportCurrentFile}>
            <MdIcon icon="download" />
            {$tr("editor.export")}
          </MenuItem>
          <MenuItem onclick={() => void importElementsFromFile()}>
            <MdIcon icon="upload" />
            {$tr("editor.import")}
          </MenuItem>
        </Menu>
      </section>
      <div class="palette-block palette-block--elements">
        <ElementPalette
          {labelProps}
          onPick={onObjectPicked}
          {onSvgIconPicked}
          {zplImageReady}
          {pdfImageReady} />
      </div>
      <LayersPanel
        layers={designerLayers}
        onSelect={selectLayer}
        onReorder={reorderLayers}
        onClone={cloneLayer}
        onDelete={deleteLayer}
        onBringToFront={bringLayerToFront}
        onSendToBack={sendLayerToBack} />
    </aside>

    <div class="designer-canvas-pane" class:has-page-strip={csvEnabled && csvRows.length > 0} use:artboardWheel>
      <div class="designer-canvas-main">
      <CanvasRulers
        container={canvasStage}
        target={canvasHost}
        originX={labelOrigin.x}
        originY={labelOrigin.y}
        dpmm={DEFAULT_DPMM}
        zoom={zoomRatio}
        printDirection={labelProps.printDirection}
        revision={rulerRevision} />
      <CustomScroll class="designer-canvas-stage" axis="both" bind:view={canvasStage}>
        <div class="designer-canvas-world">
          <div class="canvas-wrapper print-start-{labelProps.printDirection}" bind:this={canvasHost}>
            <canvas bind:this={htmlCanvas}></canvas>
          </div>
        </div>
      </CustomScroll>
      <div class="designer-canvas-footer">
        <div class="designer-canvas-footer__start">
          <div class="zoom-control">
            <button
              type="button"
              title={$tr("editor.zoom.out")}
              disabled={zoomRatio <= 0.25}
              onclick={() => fabricCanvas?.virtualZoomOut()}>
              <MdIcon icon="zoom_out" />
            </button>
            <input
              type="text"
              inputmode="decimal"
              aria-label={$tr("editor.zoom")}
              value={zoomInput}
              onfocus={() => (zoomFocused = true)}
              oninput={(e) => (zoomInput = e.currentTarget.value)}
              onblur={() => {
                zoomFocused = false;
                applyTypedZoom();
              }}
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }} />
            <span class="zoom-control__suffix">%</span>
            <button
              type="button"
              title={$tr("editor.zoom.in")}
              disabled={zoomRatio >= 4}
              onclick={() => fabricCanvas?.virtualZoomIn()}>
              <MdIcon icon="zoom_in" />
            </button>
          </div>
        </div>
        <div class="designer-canvas-footer__cluster">
        <Button onclick={rotatePaper}>
          <MdIcon icon="rotate_right" />
          {$tr("editor.rotate")}
        </Button>
        </div>
        <div class="designer-canvas-footer__end">
          <CsvControl bind:enabled={csvEnabled} onImported={onCsvImported} onCleared={onCsvCleared} />
        </div>
      </div>
      </div>
      {#if csvEnabled && csvRows.length > 0}
        <CsvPageStrip
          rows={csvRows}
          page={csvPage}
          {labelProps}
          revision={csvPreviewRevision}
          getTemplate={getCanvasForPreview}
          onSelect={setCsvPage} />
      {/if}
    </div>

    <InspectorPanel {selectedCount}>
      {#snippet actions()}
        <Button class="flex-1 justify-center px-3 text-[13px]" onclick={openPreview}>
          <MdIcon icon="visibility" />
          {$tr("editor.preview")}
        </Button>
        <Button class="flex-1 justify-center px-3 text-[13px]" onclick={saveCurrentLabel}>
          <MdIcon icon="save" />
          {$tr("editor.save")}
        </Button>
        <Button variant="soft" class="flex-1 justify-center px-3 text-[13px]" onclick={openPreview} disabled={$connectionState !== "connected"}>
          <MdIcon icon="print" />
          {$tr("editor.print")}
        </Button>
      {/snippet}
      {#snippet label()}
        <LabelSettingsPanel {labelProps} bind:title={labelTitle} {formFields} onChange={onUpdateLabelProps} onTitleChange={(value) => (labelTitle = value)} onSaveAsForm={saveAsForm} />
      {/snippet}
      {#snippet object()}
        <ObjectSettingsPanel
          {selectedObject}
          {selectedCount}
          {editRevision}
          {csvColumns}
          {csvVariables}
          onDelete={deleteSelected}
          onClone={cloneSelected}
          onValueUpdated={controlValueUpdated} />
      {/snippet}
    </InspectorPanel>
  </div>

  {#if previewOpened}
    <PrintPreview
      bind:show={previewOpened}
      canvasCallback={getCanvasForPreview}
      {labelProps}
      {printNow}
      {csvEnabled}
      csvData={$csvData.data}
      labelTitle={labelTitle}
      sourceId={savedId} />
  {/if}

  <RenameLabelDialog bind:show={renameOpen} value={labelTitle.trim() || $tr("editor.untitled")} onRename={renameCurrentLabel} />
  <LabelPropertiesDialog bind:show={propertiesOpen} {labelProps} onChange={onUpdateLabelProps} />
</div>

<style>
  .designer-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    flex: 1;
  }

  .canvas-wrapper {
    border: 0;
    background-color: transparent;
    overflow: visible;
  }
  .canvas-wrapper canvas {
    display: block;
  }
</style>
