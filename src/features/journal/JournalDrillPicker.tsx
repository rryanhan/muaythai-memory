"use client";

import { useMemo, useState } from "react";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { Check } from "@phosphor-icons/react/Check";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/Plus";
import { Drawer } from "vaul";
import type { DrillSummary } from "@/data";
import journalStyles from "./Journal.module.css";
import styles from "./JournalPickers.module.css";

type JournalDrillPickerProps = {
  drills: DrillSummary[];
  value: string;
  disabled?: boolean;
  loading?: boolean;
  onChange: (drillId: string) => void;
  onCreateDrill?: () => void;
};

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function JournalDrillPicker({
  drills,
  value,
  disabled,
  loading,
  onChange,
  onCreateDrill,
}: JournalDrillPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = drills.find((drill) => drill.id === value);
  const visibleDrills = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...drills]
      .sort((left, right) => collator.compare(left.title, right.title))
      .filter((drill) => !query || drill.title.toLocaleLowerCase().includes(query));
  }, [drills, search]);

  function close() {
    setOpen(false);
    setSearch("");
  }

  return (
    <Drawer.Root open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setSearch("");
    }} direction="bottom" modal dismissible>
      <Drawer.Trigger asChild>
        <button className={styles.fieldTrigger} type="button" disabled={disabled || loading}>
          <span>{loading ? "Loading drills" : selected?.title ?? "No linked drill"}</span>
          <CaretDown size={18} aria-hidden="true" />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className={journalStyles.sheetOverlay} />
        <Drawer.Content className={styles.pickerSheet} aria-label="Choose related drill">
          <Drawer.Handle className="sheet-handle" />
          <header className={styles.pickerHeader}>
            <div>
              <Drawer.Title>Related Drill</Drawer.Title>
              <Drawer.Description>Link this entry to one of your drills.</Drawer.Description>
            </div>
            <Drawer.Close asChild>
              <button type="button">Close</button>
            </Drawer.Close>
          </header>

          <label className={styles.pickerSearch}>
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Search drills"
              autoComplete="off"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          {onCreateDrill && (
            <button
              className={styles.createDrillAction}
              type="button"
              onClick={() => {
                close();
                onCreateDrill();
              }}
            >
              <Plus size={18} weight="bold" aria-hidden="true" />
              Create New Drill
            </button>
          )}

          <div className={styles.drillPickerList}>
            {!search.trim() && (
              <button
                type="button"
                data-selected={!value}
                onClick={() => {
                  onChange("");
                  close();
                }}
              >
                <span>No linked drill</span>
                {!value && <Check size={17} weight="bold" aria-hidden="true" />}
              </button>
            )}
            {visibleDrills.map((drill) => (
              <button
                key={drill.id}
                type="button"
                data-selected={drill.id === value}
                onClick={() => {
                  onChange(drill.id);
                  close();
                }}
              >
                <span>{drill.title}</span>
                {drill.id === value && <Check size={17} weight="bold" aria-hidden="true" />}
              </button>
            ))}
            {visibleDrills.length === 0 && <p>No drills match “{search.trim()}”.</p>}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
