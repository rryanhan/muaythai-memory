import { Star, Target } from "@phosphor-icons/react";
import type { BuiltInStatusFilter } from "./tag-filter-helpers";

type SavedListTokenProps = {
  option: BuiltInStatusFilter;
  selected: boolean;
  onToggle: (slug: string) => void;
};

// One token keeps Saved List labels and icon geometry aligned across forms and filters.
export function SavedListToken({ option, selected, onToggle }: SavedListTokenProps) {
  const Icon = option.icon === "target" ? Target : Star;

  return (
    <button type="button" data-selected={selected} onClick={() => onToggle(option.slug)}>
      <Icon aria-hidden="true" className="saved-list-icon" size={15} weight="bold" />
      {option.label}
    </button>
  );
}
