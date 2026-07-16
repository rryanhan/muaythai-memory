"use client";

import { useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { DayPicker } from "@daypicker/react";
import { Drawer } from "vaul";
import journalStyles from "./Journal.module.css";
import styles from "./JournalPickers.module.css";

type JournalDatePickerProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function JournalDatePicker({ value, disabled, onChange }: JournalDatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = startOfLocalDay(new Date());
  const selected = parseLocalDate(value);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="bottom" modal dismissible>
      <Drawer.Trigger asChild>
        <button className={styles.fieldTrigger} type="button" disabled={disabled}>
          <span>{formatDisplayDate(selected)}</span>
          <CalendarBlank size={19} aria-hidden="true" />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className={journalStyles.sheetOverlay} />
        <Drawer.Content className={styles.pickerSheet} aria-label="Choose training date">
          <Drawer.Handle className="sheet-handle" />
          <header className={styles.pickerHeader}>
            <div>
              <Drawer.Title>Training Date</Drawer.Title>
              <Drawer.Description>Choose when this training happened.</Drawer.Description>
            </div>
            <Drawer.Close asChild>
              <button type="button">Close</button>
            </Drawer.Close>
          </header>
          <DayPicker
            className={styles.calendar}
            mode="single"
            selected={selected}
            defaultMonth={selected}
            endMonth={today}
            disabled={{ after: today }}
            onSelect={(date) => {
              if (!date) return;
              onChange(formatLocalDate(date));
              setOpen(false);
            }}
          />
          <button
            className={styles.todayAction}
            type="button"
            onClick={() => {
              onChange(formatLocalDate(today));
              setOpen(false);
            }}
          >
            Today
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return startOfLocalDay(new Date());
  return new Date(year, month - 1, day);
}

export function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
