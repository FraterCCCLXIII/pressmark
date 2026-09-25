<script lang="ts">
  import AppModal from "$/components/basic/AppModal.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Button } from "$/components/ui";
  import { tr as translate } from "$/utils/i18n";
  import {
    cloneCsvTable,
    emptyCsvRow,
    rowMatchesQuery,
    uniqueColumnName,
    type CsvImportResult,
    type CsvRow,
    type CsvTable,
  } from "$/utils/csv_source";

  interface Props {
    show: boolean;
    table: CsvTable;
    selected: number[];
    printColumnNames: boolean;
    onCancel: () => void;
    onConfirm: (result: CsvImportResult) => void;
    onRemove?: () => void;
  }

  let { show = $bindable(), table, selected, printColumnNames, onCancel, onConfirm, onRemove }: Props = $props();

  let query = $state("");
  let selectedIds = $state<Set<number>>(new Set());
  let printNames = $state(false);
  let draft = $state<CsvTable>({ columns: [], rows: [] });
  let confirmRemove = $state(false);

  $effect(() => {
    if (show) {
      draft = cloneCsvTable(table);
      selectedIds = new Set(selected.filter((index) => index >= 0 && index < table.rows.length));
      printNames = printColumnNames;
      query = "";
      confirmRemove = false;
    }
  });

  const visibleRows = $derived(
    draft.rows
      .map((row, index) => ({ row, index }))
      .filter((item) => rowMatchesQuery(item.row, draft.columns, query)),
  );
  const selectedCount = $derived(selectedIds.size);
  const allVisibleSelected = $derived(
    visibleRows.length > 0 && visibleRows.every((item) => selectedIds.has(item.index)),
  );

  const toggleAllVisible = () => {
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      for (const item of visibleRows) {
        next.delete(item.index);
      }
    } else {
      for (const item of visibleRows) {
        next.add(item.index);
      }
    }
    selectedIds = next;
  };

  const toggleRow = (index: number) => {
    const next = new Set(selectedIds);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    selectedIds = next;
  };

  const setCell = (index: number, column: string, value: string) => {
    const rows = draft.rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [column]: value } : row,
    );
    draft = { ...draft, rows };
  };

  const renameColumn = (columnIndex: number, value: string) => {
    const previous = draft.columns[columnIndex];
    if (previous == null) {
      return;
    }
    const nextName = uniqueColumnName(draft.columns, value, columnIndex);
    if (nextName === previous) {
      return;
    }
    const columns = draft.columns.map((column, index) => (index === columnIndex ? nextName : column));
    const rows = draft.rows.map((row) => {
      const next: CsvRow = {};
      for (const [index, column] of columns.entries()) {
        next[column] = index === columnIndex ? (row[previous] ?? "") : (row[column] ?? "");
      }
      return next;
    });
    draft = { columns, rows };
  };

  const addRow = () => {
    query = "";
    const index = draft.rows.length;
    draft = { ...draft, rows: [...draft.rows, emptyCsvRow(draft.columns)] };
    selectedIds = new Set(selectedIds).add(index);
  };

  const removeRow = (index: number) => {
    draft = { ...draft, rows: draft.rows.filter((_, rowIndex) => rowIndex !== index) };
    selectedIds = new Set(
      [...selectedIds]
        .filter((selectedIndex) => selectedIndex !== index)
        .map((selectedIndex) => (selectedIndex > index ? selectedIndex - 1 : selectedIndex)),
    );
  };

  const onCellKeydown = (event: KeyboardEvent, index: number, columnIndex: number) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    const next = document.querySelector<HTMLInputElement>(
      `[data-csv-cell="${index + 1}:${columnIndex}"]`,
    );
    next?.focus();
    next?.select();
  };

  const confirm = () => {
    const ordered = draft.rows.map((_, index) => index).filter((index) => selectedIds.has(index));
    onConfirm({
      selected: ordered,
      printColumnNames: printNames,
      table: cloneCsvTable(draft),
    });
  };

  const requestRemove = () => {
    confirmRemove = true;
  };

  const cancelRemove = () => {
    confirmRemove = false;
  };

  const removeSource = () => {
    confirmRemove = false;
    onRemove?.();
  };
</script>

{#if show}
  <AppModal
    bind:show
    title={$translate("params.csv.select_title")}
    size="xl"
    scroll={false}
    onClose={() => {
      if (confirmRemove) {
        confirmRemove = false;
        return false;
      }
      onCancel();
    }}>
    <div class="csv-import">
      <div class="csv-import__toolbar">
        <p>
          {$translate("params.csv.select_title")}
          <span>({$translate("params.csv.selected")} {selectedCount}/{draft.rows.length})</span>
        </p>
        <label class="ws-check">
          <input type="checkbox" bind:checked={printNames} />
          <span>{$translate("params.csv.print_column_names")}</span>
        </label>
        <Button onclick={addRow}>
          <MdIcon icon="add" />
          {$translate("params.csv.add_row")}
        </Button>
        <label class="csv-import__search">
          <MdIcon icon="search" />
          <input type="search" bind:value={query} placeholder={$translate("params.csv.search")} />
        </label>
      </div>

      <div class="csv-import__table-wrap">
        <table class="csv-import__table">
          <thead>
            <tr>
              <th class="csv-import__check">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={visibleRows.length === 0}
                  onchange={toggleAllVisible}
                  aria-label={$translate("params.csv.select_all")} />
              </th>
              {#each draft.columns as column, columnIndex (columnIndex)}
                <th>
                  <input
                    class="csv-import__input csv-import__input--head"
                    type="text"
                    value={column}
                    aria-label={$translate("params.csv.column_name")}
                    onchange={(event) => renameColumn(columnIndex, (event.currentTarget as HTMLInputElement).value)} />
                </th>
              {/each}
              <th class="csv-import__action"></th>
            </tr>
          </thead>
          <tbody>
            {#each visibleRows as item (item.index)}
              <tr class:is-selected={selectedIds.has(item.index)}>
                <td class="csv-import__check">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.index)}
                    onchange={() => toggleRow(item.index)}
                    aria-label={item.row[draft.columns[0]] ?? `${item.index + 1}`} />
                </td>
                {#each draft.columns as column, columnIndex (column)}
                  <td>
                    <input
                      class="csv-import__input"
                      type="text"
                      data-csv-cell={`${item.index}:${columnIndex}`}
                      value={item.row[column] ?? ""}
                      aria-label={`${column} ${item.index + 1}`}
                      oninput={(event) => setCell(item.index, column, (event.currentTarget as HTMLInputElement).value)}
                      onkeydown={(event) => onCellKeydown(event, item.index, columnIndex)} />
                  </td>
                {/each}
                <td class="csv-import__action">
                  <button
                    type="button"
                    class="csv-import__icon-btn"
                    onclick={() => removeRow(item.index)}
                    aria-label={$translate("params.csv.delete_row")}>
                    <MdIcon icon="delete" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#snippet footer()}
      <div class="csv-import__footer">
        {#if onRemove}
          <Button variant="danger" onclick={requestRemove} aria-label={$translate("params.csv.remove")}>
            <MdIcon icon="delete" />
            {$translate("params.csv.remove")}
          </Button>
        {/if}
        <div class="csv-import__footer-end">
          <Button onclick={onCancel}>{$translate("params.csv.cancel")}</Button>
          <Button variant="primary" disabled={selectedCount === 0} onclick={confirm}>
            {$translate("params.csv.confirm")}
          </Button>
        </div>
      </div>
    {/snippet}
  </AppModal>
{/if}

{#if confirmRemove}
  <AppModal
    bind:show={confirmRemove}
    title={$translate("params.csv.remove.title")}
    stack
    onClose={cancelRemove}>
    <p class="csv-import__confirm">{$translate("params.csv.remove.help")}</p>
    {#snippet footer()}
      <div class="csv-import__footer">
        <div class="csv-import__footer-end">
          <Button onclick={cancelRemove}>{$translate("params.csv.cancel")}</Button>
          <Button variant="danger" onclick={removeSource}>{$translate("params.csv.remove.confirm")}</Button>
        </div>
      </div>
    {/snippet}
  </AppModal>
{/if}

<style>
  .csv-import {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: min(60vh, 520px);
  }

  .csv-import__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 16px;
  }

  .csv-import__toolbar p {
    margin: 0;
    margin-right: auto;
    font-size: 14px;
    color: var(--ws-text);
  }

  .csv-import__toolbar p span {
    color: var(--ws-muted);
  }

  .csv-import__search {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--ws-line-strong);
    border-radius: 999px;
    background: var(--ws-surface);
  }

  .csv-import__search input {
    border: 0;
    outline: none;
    background: transparent;
    min-width: 140px;
    font-size: 13px;
  }

  .csv-import__table-wrap {
    overflow: auto;
    border: 1px solid var(--ws-line);
    border-radius: 12px;
    max-height: min(56vh, 480px);
  }

  .csv-import__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .csv-import__table th,
  .csv-import__table td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--ws-line);
    text-align: left;
    white-space: nowrap;
  }

  .csv-import__table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--ws-canvas);
    font-weight: 600;
  }

  .csv-import__table tbody tr:last-child td {
    border-bottom: 0;
  }

  .csv-import__table tbody tr.is-selected td {
    background: var(--ws-surface);
  }

  .csv-import__check {
    width: 42px;
  }

  .csv-import__action {
    width: 40px;
    text-align: center;
  }

  .csv-import__input {
    width: 100%;
    min-width: 88px;
    min-height: 32px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--ws-text);
    font: inherit;
  }

  .csv-import__input--head {
    font-weight: 600;
  }

  .csv-import__input:hover,
  .csv-import__input:focus {
    border-color: var(--ws-line-strong);
    background: var(--ws-surface);
    outline: none;
  }

  .csv-import__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ws-muted);
  }

  .csv-import__icon-btn:hover,
  .csv-import__icon-btn:focus {
    background: var(--ws-hover);
    color: var(--ws-text);
  }

  .csv-import__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .csv-import__footer-end {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-left: auto;
  }

  .csv-import__confirm {
    margin: 0;
    color: var(--ws-text);
    font-size: 14px;
    line-height: 1.45;
  }
</style>
