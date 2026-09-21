<script lang="ts">
  import { onMount } from "svelte";
  import { derived } from "svelte/store";
  import { connectionState, printerClient, printerMeta, refreshRfidInfo } from "$/stores";
  import * as effects from "$/utils/post_process";
  import {
    type EncodedImage,
    ImageEncoder,
    LabelType,
    printTaskNames,
    type PrintTaskName,
    AbstractPrintTask,
    PrintError,
    PrinterErrorCode,
    Utils,
  } from "@mmote/niimbluelib";
  import type { LabelProps, PostProcessType, FabricJson, PreviewProps, PreviewPropsOffset } from "$/types";
  import ParamLockButton from "$/components/basic/ParamLockButton.svelte";
  import { tr, type TranslationKey } from "$/utils/i18n";
  import { canvasPreprocess } from "$/utils/canvas_preprocess";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Toasts } from "$/utils/toasts";
  import { CustomCanvas } from "$/fabric-object/custom_canvas";
  import { FileUtils } from "$/utils/file_utils";
  import AppModal from "$/components/basic/AppModal.svelte";
  import { Button, InputAddon, InputGroup, SelectField, TextField } from "$/components/ui";
  import AdvancedPrintModal from "$/components/AdvancedPrintModal.svelte";
  import { normalizeLabelPrintDirection } from "$/utils/label_template";
  import { fitPrintCanvas, printerScale } from "$/utils/print_raster";
  import {
    csvRowRepeatCount,
    expandCsvPrintRows,
    parseCopyCount,
    parseCsvTable,
    type AdvancedPrintPlan,
    type CsvRow,
    type PrintQtyMode,
  } from "$/utils/csv_source";

  interface Props {
    labelProps: LabelProps;
    canvasCallback: (page?: number) => FabricJson;
    printNow?: boolean;
    csvData: string;
    csvEnabled: boolean;
    show: boolean;
    labelTitle?: string;
    sourceId?: string;
    variables?: { [key: string]: string };
    initialQuantity?: number;
  }

  let {
    labelProps,
    canvasCallback,
    printNow = false,
    csvData,
    csvEnabled,
    show = $bindable(),
    labelTitle = "",
    sourceId,
    variables: formVariables = {},
    initialQuantity,
  }: Props = $props();

  let previewCanvas: HTMLCanvasElement;
  let printState = $state<"idle" | "sending" | "printing">("idle");
  let printProgress = $state<number>(0); // todo: more progress data
  let density = $state<number>($printerMeta?.densityDefault ?? 3);
  let speed = $state<0 | 1>(1);
  let quantity = $state<number>(1);
  let postProcessType = $state<PostProcessType>("threshold");
  let postProcessInvert = $state<boolean>(false);
  let postProcessMirror = $state<boolean>(false);
  let thresholdValue = $state<number>(140);
  let strengthValue = $state<number>(1);
  let serpentineValue = $state<boolean>(true);
  let originalImage: ImageData;
  let previewContext: CanvasRenderingContext2D;
  let printTaskName = $state<PrintTaskName>("B1");
  let labelType = $state<LabelType>(LabelType.WithGaps);
  // eslint-disable-next-line no-undef
  let statusTimer: NodeJS.Timeout | undefined = undefined;
  let error = $state<string>("");
  let detectedPrintTaskName: PrintTaskName | undefined = $printerClient?.getPrintTaskType();
  const csvTable = $derived(csvEnabled ? parseCsvTable(csvData) : { columns: [] as string[], rows: [] as CsvRow[] });
  let csvParsed: CsvRow[] = [];
  let pageCopies = $state<number[]>([]);
  let advancedOpen = $state(false);
  let advancedSelected = $state<number[]>([]);
  let advancedQuantities = $state<number[]>([]);
  let advancedMode = $state<PrintQtyMode>("same");
  let advancedColumn = $state<string | undefined>(undefined);
  let page = $state<number>(0);
  let pagesTotal = $state<number>(1);
  let offset = $state<PreviewPropsOffset>({ x: 0, y: 0, offsetType: "inner" });
  let offsetWarning = $state<string>("");
  let currentPrintTask: AbstractPrintTask | undefined;
  let previewChain: Promise<void> = Promise.resolve();

  let savedProps = $state<PreviewProps>({});

  let modalRef: AppModal;

  const disconnected = derived(connectionState, ($connectionState) => $connectionState !== "connected");

  const labelTypeTranslationKey = (labelType: string): TranslationKey =>
    `preview.label_type.${labelType}` as TranslationKey;

  const endPrint = async () => {
    clearInterval(statusTimer);

    if (!$disconnected && printState !== "idle") {
      try {
        if (currentPrintTask !== undefined) {
          await currentPrintTask.printEnd();
        } else {
          console.warn("Print task undefined, falling back to PrintEnd command");
          await $printerClient.abstraction.printEnd();
        }
      } catch (e) {
        console.warn("PrintEnd failed", e);
      }

      refreshRfidInfo();

      $printerClient.startHeartbeat();
    }

    currentPrintTask = undefined;
    printState = "idle";
    printProgress = 0;
  };

  const formatPrintError = (cause: unknown): string => {
    const reasonId = cause instanceof PrintError ? cause.reasonId : undefined;
    const reasonName = reasonId != null ? (PrinterErrorCode[reasonId] ?? "unknown") : undefined;
    const message = reasonId != null ? `Print error ${reasonId}: ${reasonName}` : `${cause}`;
    if (reasonId === PrinterErrorCode.DataError || message.includes("DataError")) {
      return `${message} ${$tr("preview.error.data")}`;
    }
    if (
      reasonId === PrinterErrorCode.LackPaper ||
      reasonId === PrinterErrorCode.PaperOutException ||
      reasonId === PrinterErrorCode.ECheckPaper ||
      reasonId === PrinterErrorCode.B3sAbnormalPaperOutput
    ) {
      return `${message} ${$tr("preview.error.feed")}`;
    }
    return message;
  };

  const isPercent = (value: number): boolean => value >= 0 && value <= 100;

  const isTransientPrintStatus = (cause: unknown): boolean =>
    cause instanceof PrintError && cause.reasonId === PrinterErrorCode.PrinterBusy;

  const waitUntilPagesPrinted = async (totalPages: number): Promise<void> => {
    const deadline = Date.now() + Math.max(12_000, totalPages * 8_000);
    let sawInProgress = false;

    while (Date.now() < deadline) {
      try {
        const status = await $printerClient.abstraction.getPrintStatus(2);
        const printDone = !isPercent(status.pagePrintProgress) || status.pagePrintProgress >= 100;
        const inProgress =
          status.page < totalPages || (isPercent(status.pagePrintProgress) && status.pagePrintProgress < 100);
        printProgress = Math.floor((Math.max(status.page, 1) / totalPages) * (isPercent(status.pagePrintProgress) ? status.pagePrintProgress : 100));
        if (inProgress) {
          sawInProgress = true;
        }
        if (sawInProgress && status.page >= totalPages && printDone) {
          // Last label still has to leave the head; PrintEnd too early causes a feed error.
          await Utils.sleep(600);
          return;
        }
      } catch (cause) {
        if (!isTransientPrintStatus(cause)) {
          throw cause;
        }
      }
      await Utils.sleep(150);
    }

    throw new Error("Timed out waiting for the printer to finish");
  };

  const copiesForPage = (index: number): number => {
    const copies = pageCopies[index];
    if (copies != null && copies > 0) {
      return copies;
    }
    return Math.max(1, quantity);
  };

  const totalPrintCopies = (): number => {
    if (pagesTotal <= 0) {
      return 0;
    }
    let total = 0;
    for (let index = 0; index < pagesTotal; index++) {
      total += copiesForPage(index);
    }
    return total;
  };

  const onPrintOnSystemPrinter = async () => {
    const sources: string[] = [];

    for (let curPage = 0; curPage < pagesTotal; curPage++) {
      page = curPage;
      await generatePreviewData(page);
      const copies = copiesForPage(curPage);
      for (let copy = 0; copy < copies; copy++) {
        sources.push(previewCanvas.toDataURL("image/png"));
      }
    }

    FileUtils.printImageUrls(sources);
  };

  const encodeCurrentPreview = (): EncodedImage => {
    if (previewCanvas.width < 8 || previewCanvas.height < 1) {
      throw new Error($tr("preview.error.empty_image"));
    }
    const encoded = ImageEncoder.encodeCanvas(
      previewCanvas,
      normalizeLabelPrintDirection(labelProps).printDirection,
    );
    if (encoded.rows < 1 || encoded.cols < 8 || encoded.cols % 8 !== 0) {
      throw new Error($tr("preview.error.empty_image"));
    }
    return encoded;
  };

  const preparePrintPages = async (): Promise<{ encoded: EncodedImage; copies: number }[]> => {
    const prepared: { encoded: EncodedImage; copies: number }[] = [];
    for (let curPage = 0; curPage < pagesTotal; curPage++) {
      page = curPage;
      await generatePreviewData(page);
      prepared.push({ encoded: encodeCurrentPreview(), copies: copiesForPage(curPage) });
    }
    return prepared;
  };

  const onPrint = async () => {
    printState = "sending";
    error = "";
    const jobCopies = totalPrintCopies();
    if (jobCopies <= 0 || pagesTotal <= 0) {
      printState = "idle";
      return;
    }

    $printerClient.stopHeartbeat();

    try {
      const prepared = await preparePrintPages();
      currentPrintTask = $printerClient.abstraction.newPrintTask(printTaskName, {
        totalPages: jobCopies,
        density,
        speed,
        labelType,
        statusPollIntervalMs: 200,
        statusTimeoutMs: Math.max(12_000, jobCopies * 8_000),
      });

      await currentPrintTask.printInit();
      for (const [index, item] of prepared.entries()) {
        console.log("Printing page", index, "x", item.copies);
        await currentPrintTask.printPage(item.encoded, item.copies);
        printState = "printing";
      }
      await waitUntilPagesPrinted(jobCopies);
    } catch (e) {
      error = formatPrintError(e);
      console.error(e);
    }

    await Utils.sleep(400);
    await endPrint();

    printState = "idle";
    if (!$disconnected) {
      $printerClient.startHeartbeat();
    }

    if (!error) {
      try {
        LocalStoragePersistence.addPrintHistory({
          id: `print_${FileUtils.timestamp()}_${Math.random().toString(36).slice(2, 7)}`,
          title: labelTitle || "Untitled",
          timestamp: FileUtils.timestamp(),
          copies: jobCopies,
          pages: pagesTotal,
          thumbnailBase64: previewCanvas ? FileUtils.makeLabelThumbnail(previewCanvas) : undefined,
          sourceId,
          size: labelProps.size,
        });
        if (sourceId) {
          LocalStoragePersistence.incrementPrintCount(sourceId, jobCopies);
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (printNow && !error) {
      modalRef.hide();
    }
  };

  const updatePreview = () => {
    let iData: ImageData = effects.copyImageData(originalImage);

    if (postProcessType === "threshold") {
      iData = effects.threshold(iData, thresholdValue);
    } else if (postProcessType === "dither") {
      iData = effects.atkinson(iData, { threshold: thresholdValue, strength: strengthValue, serpentine: serpentineValue });
    } else if (postProcessType === "bayer2") {
      iData = effects.bayer(iData, 2);
    } else if (postProcessType === "bayer4") {
      iData = effects.bayer(iData, 4);
    } else if (postProcessType === "bayer8") {
      iData = effects.bayer(iData, 8);
    } else if (postProcessType === "floyd_steinberg") {
      iData = effects.floydSteinberg(iData, { threshold: thresholdValue, strength: strengthValue, serpentine: serpentineValue });
    } else if (postProcessType === "jjn") {
      iData = effects.jarvisJudiceNinke(iData, { threshold: thresholdValue, strength: strengthValue, serpentine: serpentineValue });
    } else if (postProcessType === "stucki") {
      iData = effects.stucki(iData, { threshold: thresholdValue, strength: strengthValue, serpentine: serpentineValue });
    }

    if (postProcessInvert) {
      iData = effects.invert(iData);
    }

    if (postProcessMirror) {
      iData = effects.mirror(iData);
    }

    offsetWarning = "";

    if (offset.offsetType === "inner") {
      previewCanvas.width = originalImage.width;
      previewCanvas.height = originalImage.height;
      previewContext.fillStyle = "white";
      previewContext.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewContext.putImageData(iData, offset.x, offset.y);
    } else {
      previewCanvas.width = originalImage.width + Math.abs(offset.x);
      previewCanvas.height = originalImage.height + Math.abs(offset.y);
      previewContext.fillStyle = "white";
      previewContext.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewContext.putImageData(iData, Math.max(offset.x, 0), Math.max(offset.y, 0));
    }

    if ($printerMeta !== undefined) {
      const printDirection = normalizeLabelPrintDirection(labelProps).printDirection;
      const headSize = printDirection == "left" ? previewCanvas.height : previewCanvas.width;
      if (headSize > $printerMeta.printheadPixels) {
        offsetWarning += $tr("params.label.warning.width") + " ";
        offsetWarning += `(${headSize} > ${$printerMeta.printheadPixels})`;
        offsetWarning += "\n";
      }
    }
  };

  const toggleSavedProp = (key: string, value: any) => {
    const keyObj = key as keyof typeof savedProps;
    savedProps[keyObj] = savedProps[keyObj] === undefined ? value : undefined;
    try {
      LocalStoragePersistence.savePreviewProps(savedProps);
    } catch (e) {
      Toasts.zodErrors(e, "Preview parameters save error:");
    }
  };

  const updateSavedProp = (key: string, value: any, refreshPreview: boolean = false) => {
    const keyObj = key as keyof typeof savedProps;

    if (savedProps[keyObj] !== undefined) {
      savedProps[keyObj] = value;
      try {
        LocalStoragePersistence.savePreviewProps(savedProps);
      } catch (e) {
        Toasts.zodErrors(e, "Preview parameters save error:");
      }
    }

    if (refreshPreview) {
      updatePreview();
    }
  };

  const loadProps = () => {
    try {
      const saved = LocalStoragePersistence.loadSavedPreviewProps();
      if (saved === null) {
        return;
      }
      savedProps = saved;
      if (saved.postProcess !== undefined) postProcessType = saved.postProcess;
      if (saved.postProcessInvert !== undefined) postProcessInvert = saved.postProcessInvert;
      if (saved.threshold !== undefined) thresholdValue = saved.threshold;
      if (saved.strength !== undefined) strengthValue = saved.strength;
      if (saved.serpentine !== undefined) serpentineValue = saved.serpentine;
      if (saved.quantity !== undefined) quantity = saved.quantity;
      if (saved.density !== undefined) density = saved.density;
      if (saved.speed !== undefined) speed = saved.speed;
      if (saved.labelType !== undefined) labelType = saved.labelType;
      if (saved.printTaskName !== undefined) printTaskName = saved.printTaskName;
      if (saved.offset !== undefined) offset = saved.offset;
    } catch (e) {
      Toasts.zodErrors(e, "Preview parameters load error:");
    }
  };

  const pageDown = () => {
    if (!csvEnabled) {
      page = 0;
      return;
    }
    page = Math.max(0, Math.min(Math.max(csvParsed.length - 1, 0), page - 1));
    generatePreviewData(page);
  };

  const pageUp = () => {
    if (!csvEnabled) {
      page = 0;
      return;
    }
    page = Math.min(Math.max(csvParsed.length - 1, 0), page + 1);
    generatePreviewData(page);
  };

  const generatePreviewDataNow = async (page: number): Promise<void> => {
    const printDirection = normalizeLabelPrintDirection(labelProps).printDirection;
    const fabricTempCanvas = new CustomCanvas(undefined, {
      width: labelProps.size.width,
      height: labelProps.size.height,
      enableRetinaScaling: false,
    });

    try {
      fabricTempCanvas.setCustomBackground(false);
      fabricTempCanvas.setHighlightMirror(false);

      fabricTempCanvas.setLabelProps(labelProps);

      await fabricTempCanvas.loadFromJSON(canvasCallback(page));
      fabricTempCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      fabricTempCanvas.setDimensions({
        width: labelProps.size.width,
        height: labelProps.size.height,
      });

      let variables = { ...formVariables };

      if (csvEnabled) {
        if (page >= 0 && page < csvParsed.length) {
          variables = { ...formVariables, ...csvParsed[page] };
        } else {
          console.warn(`Page ${page} is out of csv bounds (csv length is ${csvParsed.length})`);
        }
      }

      console.log("Page variables:", variables);

      canvasPreprocess(fabricTempCanvas, variables);

      await fabricTempCanvas.createMirroredObjects();

      fabricTempCanvas.requestRenderAll();

      const scale = printerScale($printerMeta?.dpi);
      const preRenderedCanvas = fitPrintCanvas(fabricTempCanvas.toCanvasElement(scale), printDirection);
      const ctx = preRenderedCanvas.getContext("2d")!;
      previewCanvas.width = preRenderedCanvas.width;
      previewCanvas.height = preRenderedCanvas.height;
      previewContext = previewCanvas.getContext("2d")!;
      originalImage = ctx.getImageData(0, 0, preRenderedCanvas.width, preRenderedCanvas.height);

      updatePreview();
    } finally {
      fabricTempCanvas.dispose();
    }
  };

  const generatePreviewData = (page: number): Promise<void> => {
    const next = previewChain.then(() => generatePreviewDataNow(page));
    previewChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const onModalClose = () => {
    endPrint();
  };

  const copiesVary = $derived(
    csvEnabled && pageCopies.length > 1 && pageCopies.some((copies) => copies !== pageCopies[0]),
  );

  const applyAdvancedPlan = async (plan: AdvancedPrintPlan) => {
    const rows = plan.selected
      .map((index) => csvTable.rows[index])
      .filter((row): row is CsvRow => row != null);
    csvParsed = rows;
    pageCopies = plan.quantities.slice(0, rows.length).map((copies) => Math.max(1, parseCopyCount(copies, 1)));
    pagesTotal = Math.max(rows.length, 1);
    page = 0;
    advancedSelected = plan.selected;
    advancedQuantities = csvTable.rows.map((_, index) => {
      const selectedAt = plan.selected.indexOf(index);
      if (selectedAt >= 0) {
        return Math.max(1, parseCopyCount(plan.quantities[selectedAt], 1));
      }
      return advancedQuantities[index] ?? Math.max(1, quantity);
    });
    advancedMode = plan.mode;
    advancedColumn = plan.column;
    if (pageCopies.length > 0 && pageCopies.every((copies) => copies === pageCopies[0])) {
      quantity = pageCopies[0];
    }
    advancedOpen = false;
    await generatePreviewData(page);
  };

  const closeAdvancedPrint = () => {
    advancedOpen = false;
  };

  const onCopiesChanged = () => {
    const next = Math.max(1, parseCopyCount(quantity, 1));
    quantity = next;
    updateSavedProp("quantity", next);
    if (pageCopies.length === pagesTotal && (advancedMode === "same" || pageCopies.every((copies) => copies === pageCopies[0]))) {
      pageCopies = pageCopies.map(() => next);
      advancedQuantities = csvTable.rows.map((_, index) =>
        advancedSelected.includes(index) ? next : (advancedQuantities[index] ?? next),
      );
    }
  };

  onMount(async () => {
    if (csvEnabled) {
      csvParsed = expandCsvPrintRows(csvTable.rows);
      pagesTotal = csvParsed.length;
      advancedSelected = csvTable.rows.map((_, index) => index);
      advancedQuantities = csvTable.rows.map((row) => Math.max(1, csvRowRepeatCount(row)));
    }

    if (detectedPrintTaskName !== undefined) {
      console.log(`Detected print task version: ${detectedPrintTaskName}`);
      printTaskName = detectedPrintTaskName;
    }

    loadProps();
    if (initialQuantity != null) {
      quantity = Math.max(1, parseCopyCount(initialQuantity, 1));
    }

    await generatePreviewData(page);

    // Only automation sets printNow; the Print button opens this modal for confirmation.
    if (printNow && !$disconnected && printState === "idle") {
      onPrint();
    }
  });
</script>

<AppModal title={$tr("preview.title")} onClose={onModalClose} bind:show bind:this={modalRef}>
  <div class="flex justify-center">
    {#if pagesTotal > 1}
      <Button class="w-full text-4xl" disabled={printState !== "idle"} onclick={pageDown}>
        <MdIcon icon="chevron_left" />
      </Button>
    {/if}

    <canvas class="print-start-{normalizeLabelPrintDirection(labelProps).printDirection}" bind:this={previewCanvas}></canvas>

    {#if pagesTotal > 1}
      <Button class="w-full text-4xl" disabled={printState !== "idle"} onclick={pageUp}>
        <MdIcon icon="chevron_right" />
      </Button>
    {/if}
  </div>

  <div class="text-center">
    {#if pagesTotal > 1}<div>Page {page + 1} / {pagesTotal}</div>{/if}

    {#if printState === "sending"}
      <div>Sending...</div>
    {/if}
    {#if printState === "printing"}
      <div>
        Printing...
        <div class="h-2 overflow-hidden rounded-full bg-hover" role="progressbar">
          <div class="h-full bg-accent text-[10px] text-white" style="width: {printProgress}%">{printProgress}%</div>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-danger-text" role="alert">{error}</div>
    {/if}
  </div>

  {#snippet footer()}
    <InputGroup>
      <InputAddon>{$tr("preview.postprocess")}</InputAddon>

      <SelectField
        class="min-h-8 text-[13px]"
        bind:value={postProcessType}
        onchange={() => updateSavedProp("postProcess", postProcessType, true)}>
        <option value="threshold">{$tr("preview.postprocess.threshold")}</option>
        <option value="dither">{$tr("preview.postprocess.atkinson")}</option>
        <option value="bayer2">{$tr("preview.postprocess.bayer")} 2x2</option>
        <option value="bayer4">{$tr("preview.postprocess.bayer")} 4x4</option>
        <option value="bayer8">{$tr("preview.postprocess.bayer")} 8x8</option>
        <option value="floyd_steinberg">{$tr("preview.postprocess.floyd_steinberg")}</option>
        <option value="jjn">{$tr("preview.postprocess.jjn")}</option>
        <option value="stucki">{$tr("preview.postprocess.stucki")}</option>
      </SelectField>

      <ParamLockButton
        propName="postProcess"
        value={postProcessType}
        savedValue={savedProps.postProcess}
        onClick={toggleSavedProp} />

      <Button
        size="sm"
        pill={false}
        variant={postProcessInvert ? "secondary" : "ghost"}
        onclick={() => {
          postProcessInvert = !postProcessInvert;
          updatePreview();
        }}>
        <MdIcon icon="invert_colors" />
      </Button>

      <Button
        size="sm"
        pill={false}
        variant={postProcessMirror ? "secondary" : "ghost"}
        onclick={() => {
          postProcessMirror = !postProcessMirror;
          updatePreview();
        }}>
        <MdIcon icon="flip" />
      </Button>
    </InputGroup>

    {#if !(postProcessType && ["bayer2", "bayer4", "bayer8"].includes(postProcessType))}
      <InputGroup>
        <InputAddon>{$tr("preview.threshold")}</InputAddon>

        <input
          type="range"
          id="threshold"
          class="min-h-8 flex-1 accent-accent"
          min="1"
          max="255"
          bind:value={thresholdValue}
          onchange={() => updateSavedProp("threshold", thresholdValue, true)} />
        <InputAddon>{thresholdValue}</InputAddon>

        <ParamLockButton
          propName="threshold"
          value={thresholdValue}
          savedValue={savedProps.threshold}
          onClick={toggleSavedProp} />
      </InputGroup>
    {/if}

    {#if postProcessType === "floyd_steinberg" || postProcessType === "jjn" || postProcessType === "stucki" || postProcessType === "dither"}
      <InputGroup>
        <InputAddon>{$tr("preview.strength")}</InputAddon>

        <input
          type="range"
          id="strength"
          class="min-h-8 flex-1 accent-accent"
          min="0"
          max="1.5"
          step="0.1"
          bind:value={strengthValue}
          onchange={() => updateSavedProp("strength", strengthValue, true)} />
        <InputAddon>{strengthValue.toFixed(1)}</InputAddon>

        <ParamLockButton
          propName="strength"
          value={strengthValue}
          savedValue={savedProps.strength}
          onClick={toggleSavedProp} />

        <Button
          size="sm"
          pill={false}
          variant={serpentineValue ? "secondary" : "ghost"}
          title={$tr("preview.serpentine")}
          onclick={() => {
            serpentineValue = !serpentineValue;
            updateSavedProp("serpentine", serpentineValue, true);
          }}>
          <MdIcon icon="swap_vert" />
        </Button>
      </InputGroup>
    {/if}

    <InputGroup>
      <InputAddon>{$tr("preview.copies")}</InputAddon>
      <TextField
        type="number"
        min="1"
        class="min-h-8 text-[13px]"
        bind:value={quantity}
        disabled={copiesVary}
        onchange={onCopiesChanged} />
      <ParamLockButton
        propName="quantity"
        value={quantity}
        savedValue={savedProps.quantity}
        onClick={toggleSavedProp} />
    </InputGroup>

    {#if csvEnabled}
      <Button
        disabled={printState !== "idle" || csvTable.rows.length === 0}
        onclick={() => {
          advancedOpen = true;
        }}>
        {$tr("preview.advanced")}
      </Button>
    {/if}

    <InputGroup>
      <InputAddon>{$tr("preview.density")}</InputAddon>
      <TextField
        type="number"
        class="min-h-8 text-[13px]"
        min={$printerMeta?.densityMin ?? 1}
        max={$printerMeta?.densityMax ?? 20}
        bind:value={density}
        onchange={() => updateSavedProp("density", density)} />
      <ParamLockButton propName="density" value={density} savedValue={savedProps.density} onClick={toggleSavedProp} />
    </InputGroup>

    {#if printTaskName === "D110M_V4"}
      <InputGroup>
        <InputAddon>{$tr("preview.speed")}</InputAddon>
        <SelectField class="min-h-8 text-[13px]" bind:value={speed} onchange={() => updateSavedProp("speed", speed, true)}>
          <option value={0}>{$tr("preview.speed.0")}</option>
          <option value={1}>{$tr("preview.speed.1")}</option>
        </SelectField>

        <ParamLockButton propName="speed" value={speed} savedValue={savedProps.speed} onClick={toggleSavedProp} />
      </InputGroup>
    {/if}

    <InputGroup>
      <InputAddon>{$tr("preview.label_type")}</InputAddon>
      <SelectField class="min-h-8 text-[13px]" bind:value={labelType} onchange={() => updateSavedProp("labelType", labelType)}>
        {#each Object.values(LabelType) as lt (lt)}
          {#if typeof lt !== "string"}
            <option value={lt}>
              {#if $printerMeta?.paperTypes.includes(lt)}✔{/if}
              {$tr(labelTypeTranslationKey(LabelType[lt]))}
            </option>
          {/if}
        {/each}
      </SelectField>

      <ParamLockButton
        propName="labelType"
        value={labelType}
        savedValue={savedProps.labelType}
        onClick={toggleSavedProp} />
    </InputGroup>

    <InputGroup>
      <InputAddon>{$tr("preview.print_task")}</InputAddon>
      <SelectField
        class="min-h-8 text-[13px]"
        bind:value={printTaskName}
        onchange={() => updateSavedProp("printTaskName", printTaskName)}>
        {#each printTaskNames as name (name)}
          <option value={name}>
            {#if detectedPrintTaskName === name}✔{/if}
            {name}
          </option>
        {/each}
      </SelectField>

      <ParamLockButton
        propName="printTaskName"
        value={printTaskName}
        savedValue={savedProps.printTaskName}
        onClick={toggleSavedProp} />
    </InputGroup>

    <InputGroup>
      <InputAddon>{$tr("preview.offset")}</InputAddon>
      {#if offsetWarning}
        <InputAddon class="text-amber-600" title={offsetWarning}><MdIcon icon="warning" /></InputAddon>
      {/if}
      <InputAddon><MdIcon icon="unfold_more" class="r-90" /></InputAddon>
      <TextField
        class="min-h-8 text-[13px]"
        type="number"
        bind:value={offset.x}
        onchange={() => updateSavedProp("offset", offset, true)} />
      <InputAddon><MdIcon icon="unfold_more" /></InputAddon>
      <TextField
        class="min-h-8 text-[13px]"
        type="number"
        bind:value={offset.y}
        onchange={() => updateSavedProp("offset", offset, true)} />
      <SelectField
        class="min-h-8 text-[13px]"
        bind:value={offset.offsetType}
        onchange={() => updateSavedProp("offset", offset, true)}>
        <option value="inner">{$tr("preview.offset.inner")}</option>
        <option value="outer">{$tr("preview.offset.outer")}</option>
      </SelectField>

      <ParamLockButton propName="offset" value={offset} savedValue={savedProps.offset} onClick={toggleSavedProp} />
    </InputGroup>

    <Button onclick={() => modalRef.hide()}>{$tr("preview.close")}</Button>

    {#if printState !== "idle"}
      <Button variant="primary" disabled={$disconnected} onclick={endPrint}>
        {$tr("preview.print.cancel")}
      </Button>
    {/if}

    <Button title={$tr("preview.print.system")} onclick={onPrintOnSystemPrinter}>
      <MdIcon icon="print" />
    </Button>

    <Button variant="primary" disabled={$disconnected || printState !== "idle"} onclick={onPrint}>
      {#if $disconnected}
        {$tr("preview.not_connected")}
      {:else}
        <MdIcon icon="print" /> {$tr("preview.print")}
      {/if}
    </Button>
  {/snippet}
</AppModal>

{#if advancedOpen}
  <AdvancedPrintModal
    bind:show={advancedOpen}
    table={csvTable}
    selected={advancedSelected}
    quantities={advancedQuantities}
    mode={advancedMode}
    column={advancedColumn}
    sameQuantity={quantity}
    onCancel={closeAdvancedPrint}
    onConfirm={applyAdvancedPlan} />
{/if}

<style>
  canvas {
    image-rendering: pixelated;
    border: 1px solid #6d6d6d;
    max-width: 100%;
  }
  canvas.print-start-left {
    border-left: 2px solid #ff4646;
  }
  canvas.print-start-top {
    border-top: 2px solid #ff4646;
  }
</style>
