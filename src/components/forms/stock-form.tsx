"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createItemAction, stockMoveAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function StockForm({ items }: { items: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await stockMoveAction({
        itemId: String(form.get("itemId")),
        type: String(form.get("type")),
        quantity: Number(form.get("quantity")),
        reason: String(form.get("reason")),
        override: form.get("override") === "on",
      });
      if (!result.ok) setError(result.error);
      else router.push(`/inventory/${form.get("itemId")}`);
    }}>
      <Field label="Item"><Select name="itemId">{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="Movement"><Select name="type"><option value="stock_in">Stock in</option><option value="stock_out">Stock out</option><option value="damage">Damage</option><option value="loss">Loss</option><option value="adjustment">Adjustment (increase)</option></Select></Field>
      <Field label="Quantity"><Input name="quantity" type="number" min={1} required /></Field>
      <Field label="Reason"><Textarea name="reason" required /></Field>
      <label className="text-sm"><input className="mr-2" type="checkbox" name="override" /> Authorised override if stock would go short</label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Record movement</Button>
    </form>
  );
}

export function NewItemForm({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await createItemAction({
        name: String(form.get("name")),
        sku: String(form.get("sku")),
        categoryId: String(form.get("categoryId")),
        assetType: String(form.get("assetType")) as "durable",
        quantity: Number(form.get("quantity")),
        reorderLevel: Number(form.get("reorderLevel")),
        unitCostShillings: Number(form.get("cost") || 0),
        location: String(form.get("location") || ""),
      });
      if (!result.ok || !result.data?.id) setError(result.ok ? "Could not save the item." : result.error);
      else router.push(`/inventory/${result.data.id}`);
    }}>
      <Field label="Name"><Input name="name" required /></Field>
      <Field label="SKU"><Input name="sku" required /></Field>
      <Field label="Category"><Select name="categoryId">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
      <Field label="Type"><Select name="assetType"><option value="durable">Durable</option><option value="consumable">Consumable</option></Select></Field>
      <Field label="Opening quantity"><Input name="quantity" type="number" defaultValue={0} /></Field>
      <Field label="Reorder level"><Input name="reorderLevel" type="number" defaultValue={0} /></Field>
      <Field label="Unit cost (KSh)"><Input name="cost" type="number" /></Field>
      <Field label="Location"><Input name="location" /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Add item</Button>
    </form>
  );
}
