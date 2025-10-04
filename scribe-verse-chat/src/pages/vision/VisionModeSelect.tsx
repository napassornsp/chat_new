import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation, useNavigate } from "react-router-dom";

type Mode = { value: string; label: string; path: string };

const MODES: Mode[] = [
  { value: "flower",  label: "Flower Detection",      path: "/vision/flower" },
  { value: "food",    label: "Food Classification",   path: "/vision/food" },
  { value: "pet-cls", label: "Pet Classification",    path: "/vision/pet-classification" },
  { value: "veh-cls", label: "Vehicle Classification",path: "/vision/vehicle-classification" },
  { value: "pet-det", label: "Pet Detection",         path: "/vision/pet-detection" },
  { value: "veh-det", label: "Vehicle Detection",     path: "/vision/vehicle-detection" },
  { value: "person",  label: "Person Detection",      path: "/vision/person-detection" },
];

export default function VisionModeSelect({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // pick the item whose path matches current route
  const current = MODES.find(m => pathname.startsWith(m.path))?.value ?? "flower";

  return (
    <Select value={current} onValueChange={(v) => {
      const m = MODES.find(x => x.value === v);
      if (m) navigate(m.path);
    }}>
      <SelectTrigger className={className ?? "w-56 h-9 text-sm"}>
        <SelectValue placeholder="Select Vision Mode" />
      </SelectTrigger>
      <SelectContent>
        {MODES.map(m => (
          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
