"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, MapPin } from "lucide-react";

interface SimpleAddressInputProps {
  onAddressSubmit: (address: {
    fullAddress: string;
    components: {
      street?: string;
      city?: string;
      state?: string;
      country?: string;
    };
  }) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

export default function SimpleAddressInput({
  onAddressSubmit,
  placeholder = "Ej: Calle Hidalgo 15, Pedro Escobedo, Querétaro",
  label = "Dirección completa",
  disabled = false,
}: SimpleAddressInputProps) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!address.trim()) return;
    
    setLoading(true);
    
    try {
      // Parsear la dirección de forma simple
      const parts = address.split(',').map(part => part.trim());
      
      const addressData = {
        fullAddress: address,
        components: {
          street: parts[0] || '',
          city: parts[1] || 'Pedro Escobedo',
          state: parts[2] || 'Querétaro',
          country: 'México'
        }
      };
      
      console.log('📍 Dirección ingresada manualmente:', addressData);
      onAddressSubmit(addressData);
      
    } catch (error) {
      console.error('Error procesando dirección:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="simple-address-input">{label}</Label>
        <div className="flex gap-2">
          <Input
            id="simple-address-input"
            type="text"
            placeholder={placeholder}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={disabled || loading}
            className="flex-1"
          />
          <Button 
            type="submit" 
            disabled={!address.trim() || disabled || loading}
            size="default"
          >
            {loading ? (
              <Search className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Ingresa tu dirección completa y presiona el botón para buscar tiendas cercanas
        </p>
      </div>

    </form>
  );
}