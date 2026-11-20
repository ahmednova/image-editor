import { useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Slider } from "@/client/components/ui/slider";
import type { Adjustment } from "./pixels";

type Kind = Adjustment["kind"];

interface Param {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  unit?: string;
}

export const ADJUSTMENTS: { kind: Kind; label: string; params: Param[]; filter?: boolean }[] = [
  {
    kind: "brightnessContrast",
    label: "Brightness/Contrast",
    params: [
      { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1, initial: 0 },
      { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, initial: 0 },
    ],
  },
  {
    kind: "hueSaturation",
    label: "Hue/Saturation",
    params: [
      { key: "hue", label: "Hue", min: -180, max: 180, step: 1, initial: 0, unit: "°" },
      { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, initial: 0 },
      { key: "lightness", label: "Lightness", min: -100, max: 100, step: 1, initial: 0 },
    ],
  },
  {
    kind: "levels",
    label: "Levels",
    params: [
      { key: "black", label: "Black point", min: 0, max: 253, step: 1, initial: 0 },
      { key: "white", label: "White point", min: 2, max: 255, step: 1, initial: 255 },
      { key: "gamma", label: "Gamma", min: 0.1, max: 5, step: 0.05, initial: 1 },
    ],
  },
  { kind: "invert", label: "Invert", params: [] },
  { kind: "grayscale", label: "Grayscale", params: [] },
  {
    kind: "gaussianBlur",
    label: "Gaussian blur",
    filter: true,
    params: [{ key: "radius", label: "Radius", min: 0.5, max: 50, step: 0.5, initial: 2, unit: "px" }],
  },
  {
    kind: "sharpen",
    label: "Sharpen",
    filter: true,
    params: [{ key: "amount", label: "Amount", min: 1, max: 100, step: 1, initial: 50, unit: "%" }],
  },
];

export function initialAdjustment(kind: Kind): Adjustment {
  const spec = ADJUSTMENTS.find((a) => a.kind === kind)!;
  return { kind, ...Object.fromEntries(spec.params.map((p) => [p.key, p.initial])) } as Adjustment;
}

export function AdjustPanel({
  value,
  onChange,
  onApply,
  onCancel,
}: {
  value: Adjustment;
  onChange: (value: Adjustment) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const spec = ADJUSTMENTS.find((a) => a.kind === value.kind)!;
  const values = value as unknown as Record<string, number>;
  return (
    <Card data-testid="adjust-dialog" size="sm" role="dialog" aria-label={spec.label}>
      <CardHeader>
        <CardTitle>{spec.label}</CardTitle>
      </CardHeader>
      {spec.params.length ? (
        <CardContent className="grid gap-4">
          {spec.params.map((param) => (
            <ParamField
              key={param.key}
              param={param}
              value={values[param.key]!}
              onChange={(next) => onChange({ ...value, [param.key]: next } as Adjustment)}
            />
          ))}
        </CardContent>
      ) : null}
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" onClick={onCancel} data-testid="adjust-cancel">Cancel</Button>
        <Button onClick={onApply} data-testid="adjust-apply">Apply</Button>
      </CardFooter>
    </Card>
  );
}

function ParamField({ param, value, onChange }: { param: Param; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const id = `adjust-${param.key}`;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>
          {param.label}
          {param.unit ? <span className="text-muted-foreground"> ({param.unit})</span> : null}
        </Label>
        <Input
          id={id}
          data-testid={id}
          type="number"
          className="h-8 w-20"
          min={param.min}
          max={param.max}
          step={param.step}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const next = Number(event.target.value);
            if (event.target.value !== "" && Number.isFinite(next))
              onChange(Math.min(param.max, Math.max(param.min, next)));
          }}
        />
      </div>
      <Slider
        aria-label={param.label}
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0]! : (next as number))}
      />
    </div>
  );
}
