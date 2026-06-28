"use client";

import { ImageIcon, Loader2, Plus, Settings, Tag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { CategoryOption, ProductFormState } from "./dashboard.types";

type ProductEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formState: ProductFormState;
  setFormState: React.Dispatch<React.SetStateAction<ProductFormState>>;
  availableCategories: CategoryOption[];
  editingProductId: string | null;
  submitting: boolean;
  uploadingImage: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function ProductEditorDialog({
  open,
  onOpenChange,
  formState,
  setFormState,
  availableCategories,
  editingProductId,
  submitting,
  uploadingImage,
  onSubmit,
  onImageUpload,
}: ProductEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingProductId ? "Editar producto" : "Agregar producto"}</DialogTitle>
          <DialogDescription>
            {editingProductId
              ? "Edita la informacion del producto y envia los cambios para aprobacion."
              : "Completa la informacion para enviar un nuevo producto a revision."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basico</TabsTrigger>
              <TabsTrigger value="media">Imagen y categorias</TabsTrigger>
              <TabsTrigger value="options">Opciones</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 pt-4">
              <div>
                <Label htmlFor="product-name">Nombre del producto *</Label>
                <Input
                  id="product-name"
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Ej: Pizza especial"
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="product-price">Precio *</Label>
                  <Input
                    id="product-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formState.price}
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, price: event.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="product-stock">Inventario</Label>
                  <Input
                    id="product-stock"
                    type="number"
                    min="0"
                    value={formState.stock}
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, stock: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="product-description">Descripcion</Label>
                <Textarea
                  id="product-description"
                  rows={5}
                  className="resize-none"
                  value={formState.description}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Describe el producto para el cliente"
                />
              </div>
            </TabsContent>

            <TabsContent value="media" className="space-y-4 pt-4">
              <div>
                <Label className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Imagen del producto
                </Label>
                <div className="mt-2 space-y-3">
                  {formState.image ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-green-700">Imagen cargada</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setFormState((current) => ({ ...current, image: null }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Asset ID: {formState.image.asset._ref}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
                      <ImageIcon className="mx-auto mb-2 h-10 w-10 text-gray-400" />
                      <Label htmlFor="product-image-upload" className="cursor-pointer text-[#ff8800] hover:underline">
                        {uploadingImage ? "Subiendo..." : "Seleccionar imagen"}
                      </Label>
                      <input
                        id="product-image-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={onImageUpload}
                        disabled={uploadingImage}
                      />
                      {uploadingImage ? <Loader2 className="mx-auto mt-3 h-5 w-5 animate-spin text-[#ff8800]" /> : null}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Categorias
                </Label>

                {availableCategories.length > 0 ? (
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3">
                    {availableCategories.map((category) => (
                      <div key={category._id} className="flex items-center gap-2">
                        <Checkbox
                          id={`category-${category._id}`}
                          checked={formState.categories.includes(category._id)}
                          onCheckedChange={(checked) => {
                            setFormState((current) => ({
                              ...current,
                              categories: checked
                                ? [...current.categories, category._id]
                                : current.categories.filter((value) => value !== category._id),
                            }));
                          }}
                        />
                        <Label htmlFor={`category-${category._id}`} className="font-normal">
                          {category.title}
                        </Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No hay categorias disponibles.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="options" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Personalizacion
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormState((current) => ({
                      ...current,
                      optionGroups: [
                        ...current.optionGroups,
                        {
                          _key: `group-${Date.now()}`,
                          title: "",
                          description: "",
                          required: false,
                          selectionType: "single",
                          options: [],
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Grupo
                </Button>
              </div>

              {formState.optionGroups.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                  No hay grupos de opciones. Ejemplo: tamano, extras o ingredientes.
                </div>
              ) : (
                <div className="space-y-4">
                  {formState.optionGroups.map((group, groupIndex) => (
                    <Card key={group._key} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-gray-900">Grupo {groupIndex + 1}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setFormState((current) => ({
                                ...current,
                                optionGroups: current.optionGroups.filter((_, index) => index !== groupIndex),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <Label>Titulo</Label>
                            <Input
                              value={group.title}
                              onChange={(event) =>
                                setFormState((current) => ({
                                  ...current,
                                  optionGroups: current.optionGroups.map((item, index) =>
                                    index === groupIndex ? { ...item, title: event.target.value } : item
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Descripcion</Label>
                            <Input
                              value={group.description || ""}
                              onChange={(event) =>
                                setFormState((current) => ({
                                  ...current,
                                  optionGroups: current.optionGroups.map((item, index) =>
                                    index === groupIndex
                                      ? { ...item, description: event.target.value }
                                      : item
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`required-${group._key}`}
                              checked={group.required}
                              onCheckedChange={(checked) =>
                                setFormState((current) => ({
                                  ...current,
                                  optionGroups: current.optionGroups.map((item, index) =>
                                    index === groupIndex ? { ...item, required: Boolean(checked) } : item
                                  ),
                                }))
                              }
                            />
                            <Label htmlFor={`required-${group._key}`}>Obligatorio</Label>
                          </div>
                          <div>
                            <Label>Tipo de seleccion</Label>
                            <Select
                              value={group.selectionType}
                              onValueChange={(value: "single" | "multiple") =>
                                setFormState((current) => ({
                                  ...current,
                                  optionGroups: current.optionGroups.map((item, index) =>
                                    index === groupIndex ? { ...item, selectionType: value } : item
                                  ),
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="single">Una opcion</SelectItem>
                                <SelectItem value="multiple">Multiples</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Opciones</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setFormState((current) => ({
                                  ...current,
                                  optionGroups: current.optionGroups.map((item, index) =>
                                    index === groupIndex
                                      ? {
                                          ...item,
                                          options: [
                                            ...item.options,
                                            {
                                              _key: `option-${Date.now()}`,
                                              label: "",
                                              description: "",
                                              priceDelta: 0,
                                              isDefault: false,
                                            },
                                          ],
                                        }
                                      : item
                                  ),
                                }))
                              }
                            >
                              <Plus className="mr-1 h-4 w-4" />
                              Opcion
                            </Button>
                          </div>

                          {group.options.length === 0 ? (
                            <p className="text-sm text-gray-500">Sin opciones agregadas.</p>
                          ) : (
                            <div className="space-y-2">
                              {group.options.map((option, optionIndex) => (
                                <div key={option._key} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <p className="text-sm font-medium text-gray-800">
                                      Opcion {optionIndex + 1}
                                    </p>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setFormState((current) => ({
                                          ...current,
                                          optionGroups: current.optionGroups.map((item, index) =>
                                            index === groupIndex
                                              ? {
                                                  ...item,
                                                  options: item.options.filter((_, innerIndex) => innerIndex !== optionIndex),
                                                }
                                              : item
                                          ),
                                        }))
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>

                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                      <Label>Etiqueta</Label>
                                      <Input
                                        value={option.label}
                                        onChange={(event) =>
                                          setFormState((current) => ({
                                            ...current,
                                            optionGroups: current.optionGroups.map((item, index) =>
                                              index === groupIndex
                                                ? {
                                                    ...item,
                                                    options: item.options.map((entry, innerIndex) =>
                                                      innerIndex === optionIndex
                                                        ? { ...entry, label: event.target.value }
                                                        : entry
                                                    ),
                                                  }
                                                : item
                                            ),
                                          }))
                                        }
                                      />
                                    </div>
                                    <div>
                                      <Label>Costo adicional</Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={option.priceDelta}
                                        onChange={(event) =>
                                          setFormState((current) => ({
                                            ...current,
                                            optionGroups: current.optionGroups.map((item, index) =>
                                              index === groupIndex
                                                ? {
                                                    ...item,
                                                    options: item.options.map((entry, innerIndex) =>
                                                      innerIndex === optionIndex
                                                        ? {
                                                            ...entry,
                                                            priceDelta: Number(event.target.value) || 0,
                                                          }
                                                        : entry
                                                    ),
                                                  }
                                                : item
                                            ),
                                          }))
                                        }
                                      />
                                    </div>
                                  </div>

                                  <div className="mt-3 flex items-center gap-2">
                                    <Checkbox
                                      id={`default-${option._key}`}
                                      checked={option.isDefault}
                                      onCheckedChange={(checked) =>
                                        setFormState((current) => ({
                                          ...current,
                                          optionGroups: current.optionGroups.map((item, index) =>
                                            index === groupIndex
                                              ? {
                                                  ...item,
                                                  options: item.options.map((entry, innerIndex) =>
                                                    innerIndex === optionIndex
                                                      ? { ...entry, isDefault: Boolean(checked) }
                                                      : entry
                                                  ),
                                                }
                                              : item
                                          ),
                                        }))
                                      }
                                    />
                                    <Label htmlFor={`default-${option._key}`}>Seleccionada por defecto</Label>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-[#ff8800] text-gray-900 hover:bg-[#ff8800]/90" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingProductId ? (
                "Guardar cambios"
              ) : (
                "Enviar producto"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
