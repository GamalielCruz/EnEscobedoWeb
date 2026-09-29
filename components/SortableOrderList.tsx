"use client";

import Image from "next/image";
import { Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";

const DRAG_EFFECT = {
  scale: 1.015,
  boxShadow: "0 18px 45px rgba(15, 23, 42, 0.16)",
};

export type SortableOrderItem = {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
};

type SortableOrderListProps = {
  items: SortableOrderItem[];
  order: string[];
  onReorder: (order: string[]) => void;
};

type SortableOrderRowProps = {
  item: SortableOrderItem;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
};

function SortableOrderRow({ item, index, total, onMove }: SortableOrderRowProps) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={item.id}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={DRAG_EFFECT}
      className="flex items-center gap-3 rounded-xl border border-black/8 bg-white p-3 shadow-sm"
    >
      <button
        type="button"
        aria-label={"Arrastrar " + item.label}
        onPointerDown={(event) => dragControls.start(event)}
        className="touch-none cursor-grab rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <span className="w-7 text-center text-sm font-semibold tabular-nums text-gray-500">
        {index + 1}
      </span>

      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="48px"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-950">{item.label}</p>
        <p className="truncate text-xs text-gray-500">
          {item.description ? item.description + " - " : ""}
          Posicion {index + 1} de {total}
        </p>
      </div>

      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={"Mover " + item.label + " hacia arriba"}
          disabled={index === 0}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={"Mover " + item.label + " hacia abajo"}
          disabled={index === total - 1}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>
    </Reorder.Item>
  );
}

export function SortableOrderList({
  items,
  order,
  onReorder,
}: SortableOrderListProps) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = order
    .map((id) => itemsById.get(id))
    .filter((item): item is SortableOrderItem => Boolean(item));

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onReorder(next);
  };

  return (
    <Reorder.Group axis="y" values={order} onReorder={onReorder} className="space-y-2">
      {orderedItems.map((item, index) => (
        <SortableOrderRow
          key={item.id}
          item={item}
          index={index}
          total={orderedItems.length}
          onMove={(direction) => move(index, direction)}
        />
      ))}
    </Reorder.Group>
  );
}
