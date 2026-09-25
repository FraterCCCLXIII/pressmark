<script lang="ts">
  import { csvData } from "$/stores";
  import { Toasts } from "$/utils/toasts";
  import { tr } from "$/utils/i18n";
  import {
    csvFileTitle,
    parseCsvTable,
    serializeCsvTable,
    type CsvImportResult,
    type CsvTable,
  } from "$/utils/csv_source";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import CsvImportModal from "$/components/designer-controls/CsvImportModal.svelte";

  interface Props {
    enabled: boolean;
    onImported?: () => void;
    onCleared?: () => void;
  }

  let { enabled = $bindable(), onImported, onCleared }: Props = $props();

  let fileInput: HTMLInputElement | undefined = $state();
  let showTable = $state(false);
  let pendingTable = $state<CsvTable>({ columns: [], rows: [] });
  let pendingName = $state("");
  let pendingSource = $state("");
  let pendingSelected = $state<number[]>([]);
  let pendingPrintNames = $state(false);

  const openPicker = () => {
    fileInput?.click();
  };

  const openCurrentTable = () => {
    const source = $csvData.sourceData ?? $csvData.data;
    const parsed = parseCsvTable(source);
    if (parsed.columns.length === 0 || parsed.rows.length === 0) {
      openPicker();
      return;
    }
    pendingName = $csvData.name ?? "";
    pendingSource = source;
    pendingTable = parsed;
    pendingSelected =
      $csvData.selected?.filter((index) => index >= 0 && index < parsed.rows.length) ??
      parsed.rows.map((_, index) => index);
    pendingPrintNames = !!$csvData.printColumnNames;
    showTable = true;
  };

  const onFileChosen = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsvTable(text);
      if (parsed.columns.length === 0 || parsed.rows.length === 0) {
        Toasts.error($tr("params.csv.empty"));
        return;
      }
      pendingName = csvFileTitle(file.name);
      pendingSource = text;
      pendingTable = parsed;
      pendingSelected = parsed.rows.map((_, index) => index);
      pendingPrintNames = !!$csvData.printColumnNames;
      showTable = true;
    } catch (error) {
      Toasts.error(error instanceof Error ? error.message : $tr("params.csv.invalid"));
    }
  };

  const closeTable = () => {
    showTable = false;
  };

  const confirmTable = (result: CsvImportResult) => {
    const rows = result.selected
      .map((index) => result.table.rows[index])
      .filter((row): row is NonNullable<typeof row> => !!row);
    const sourceData = serializeCsvTable(result.table.columns, result.table.rows);
    $csvData = {
      data: serializeCsvTable(result.table.columns, rows),
      sourceData,
      name: pendingName,
      selected: result.selected,
      printColumnNames: result.printColumnNames,
    };
    pendingTable = result.table;
    pendingSource = sourceData;
    pendingSelected = result.selected;
    pendingPrintNames = result.printColumnNames;
    enabled = true;
    showTable = false;
    onImported?.();
  };

  const clearSource = () => {
    enabled = false;
    $csvData = { data: "" };
    pendingTable = { columns: [], rows: [] };
    pendingName = "";
    pendingSource = "";
    pendingSelected = [];
    pendingPrintNames = false;
    showTable = false;
    onCleared?.();
  };
</script>

<input
  bind:this={fileInput}
  class="csv-file-input"
  type="file"
  accept=".csv,text/csv"
  onchange={(event) => void onFileChosen(event)} />

<button type="button" class="csv-source-btn" onclick={openCurrentTable}>
  <MdIcon icon="dataset" />
  {$tr("editor.data_source")}
</button>
{#if enabled}
  <button type="button" class="csv-source-btn csv-source-btn--icon" title={$tr("params.csv.cancel")} onclick={clearSource}>
    <MdIcon icon="close" />
  </button>
{/if}

<CsvImportModal
  bind:show={showTable}
  table={pendingTable}
  selected={pendingSelected}
  printColumnNames={pendingPrintNames}
  onCancel={closeTable}
  onConfirm={confirmTable}
  onRemove={clearSource} />

<style>
  .csv-file-input {
    display: none;
  }

  .csv-source-btn {
    appearance: none;
    border: 1px solid #e4e4e4;
    border-radius: 999px;
    background: #fff;
    box-shadow: var(--ws-shadow);
    color: var(--ws-text);
    min-height: 36px;
    padding: 0 16px;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .csv-source-btn:hover {
    background: var(--ws-hover);
  }

  .csv-source-btn--icon {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
</style>
