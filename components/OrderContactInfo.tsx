import { Mail, Phone, User } from "lucide-react";

interface OrderContactInfoProps {
  customerName?: string;
  email?: string;
  phone?: string;
}

export function OrderContactInfo({ customerName, email, phone }: OrderContactInfoProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <h4 className="font-semibold text-gray-900 text-sm">Información de Contacto</h4>
      
      <div className="space-y-2">
        {customerName && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-gray-700">{customerName}</span>
          </div>
        )}
        
        {email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-gray-700 break-all">{email}</span>
          </div>
        )}
        
        {phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-green-700 font-medium">{phone}</span>
          </div>
        )}
      </div>
      
      {!phone && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded p-2 border border-amber-200">
          ⚠️ Sin número de teléfono registrado. Los pedidos nuevos incluyen teléfono para mejor comunicación.
        </div>
      )}
    </div>
  );
}