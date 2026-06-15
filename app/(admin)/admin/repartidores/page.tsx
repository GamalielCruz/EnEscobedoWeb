import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDriversPage() {
  return (
    <div className="px-4 sm:px-0">
      <Card>
        <CardHeader>
          <CardTitle>Repartidores</CardTitle>
          <CardDescription>
            Esta seccion queda preparada para la siguiente fase del panel admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-gray-600">
          Aqui agregaremos la gestion de repartidores mas adelante.
        </CardContent>
      </Card>
    </div>
  );
}
