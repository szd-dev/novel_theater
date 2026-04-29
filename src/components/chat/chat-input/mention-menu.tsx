"use client";

import { forwardRef } from "react";
import type {
  BeautifulMentionsMenuProps,
  BeautifulMentionsMenuItemProps,
} from "lexical-beautiful-mentions";
import { cn } from "@/lib/utils";

export function MentionMenu({ loading, children, ...props }: BeautifulMentionsMenuProps) {
  return (
    <ul
      className={cn(
        "absolute bottom-0 min-w-[8rem] max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      )}
      {...props}
    >
      {loading && (
        <li className="px-2 py-1.5 text-sm text-muted-foreground">
          加载中...
        </li>
      )}
      {children}
    </ul>
  );
}

export const MentionMenuItem = forwardRef<
  HTMLLIElement,
  BeautifulMentionsMenuItemProps
>(({ selected, item, ...props }, ref) => {
  const l0 = item.data?.l0;
  const l0Text = typeof l0 === "string" ? l0 : undefined;

  return (
    <li
      ref={ref}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
        selected && "bg-accent text-accent-foreground"
      )}
      {...props}
    >
      <div className="flex flex-col">
        <span>{item.value}</span>
        {l0Text && (
          <span className="text-xs text-muted-foreground line-clamp-1">
            {l0Text}
          </span>
        )}
      </div>
    </li>
  );
});

MentionMenuItem.displayName = "MentionMenuItem";
