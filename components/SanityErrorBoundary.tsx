"use client";

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class SanityErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Verificar si el error está relacionado con Sanity
    const isSanityError = error.message?.includes('sanity') || 
                         error.stack?.includes('sanity') ||
                         error.message?.includes('kgklfrat.api.sanity.io');
    
    if (isSanityError) {
      console.warn('Sanity error caught by boundary:', error);
      return { hasError: true, error };
    }
    
    // Si no es un error de Sanity, no lo manejamos aquí
    throw error;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('SanityErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Renderizar fallback o nada en caso de error de Sanity
      return this.props.fallback || null;
    }

    return this.props.children;
  }
}