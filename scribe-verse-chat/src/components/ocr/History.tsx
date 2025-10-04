// src/components/ocr/OCRHistory.tsx
import { useEffect, useMemo, useState } from "react";
import { FileText, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type OCRItem = { id: string; name: string; tag?: string };
type Props = { initial?: OCRItem[]; storageKey?: string };

// Turn on once to visually confirm the dots hit area.
const DEBUG = false;

export default function OCRHistory({ initial, storageKey = "ocr_history" }: Props) {
  const load = (): OCRItem[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return initial ?? [];
  };

  const [items, setItems] = useState<OCRItem[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, storageKey]);

  const rename = async (id: string, newName: string) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, name: newName } : x)));
    alert("Renamed."); // swap for your toast if desired
  };

  const remove = async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    alert("Deleted."); // swap for your toast if desired
  };

  if (!items.length) {
    return <div className="text-sm text-muted-foreground">No OCR history yet.</div>;
  }

  // allow popovers to render outside (no clipping)
  return (
    <div className="space-y-2 overflow-visible">
      {items.map((item) => (
        <Row key={item.id} item={item} onRename={rename} onDelete={remove} />
      ))}
    </div>
  );
}

/* ---------------- Row (name | tag | ... absolute at far right) ---------------- */
function Row({
  item,
  onRename,
  onDelete,
}: {
  item: OCRItem;
  onRename: (id: string, newName: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [openRename, setOpenRename] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState(item.name);

  const TagPill = useMemo(
    () =>
      item.tag ? (
        <Badge variant="secondary" className="shrink-0">
          {item.tag}
        </Badge>
      ) : null,
    [item.tag]
  );

  return (
    // Reserve space for the dots (pr-12), ensure positioning & no clipping
    <div className="relative flex items-center gap-2 py-1 pr-12 overflow-visible">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

      {/* Name (truncates) */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" title={item.name}>
          {item.name}
        </div>
      </div>

      {/* Tag sits near the right, before the dots */}
      {TagPill}

      {/* Absolute dots at extreme right; always visible & clickable */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="More actions"
            className={[
              "absolute right-2 top-1/2 -translate-y-1/2",
              "h-7 w-7 grid place-items-center rounded-md",
              "hover:bg-muted",
              "shrink-0 z-50 pointer-events-auto",
              DEBUG ? "ring-2 ring-blue-400" : "",
            ].join(" ")}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-44 rounded-xl border bg-white/95 backdrop-blur shadow-lg p-1 z-[60]"
        >
          <DropdownMenuItem
            className="rounded-lg text-[15px] py-2"
            onClick={() => setOpenRename(true)}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="rounded-lg text-[15px] py-2 text-red-600 focus:text-red-600"
            onClick={async () => {
              try {
                setBusy(true);
                await onDelete(item.id);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog */}
      <Dialog open={openRename} onOpenChange={setOpenRename}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                void (async () => {
                  try {
                    setBusy(true);
                    await onRename(item.id, newName.trim());
                    setOpenRename(false);
                  } finally {
                    setBusy(false);
                  }
                })();
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenRename(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newName.trim() || busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  await onRename(item.id, newName.trim());
                  setOpenRename(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
