import React from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  error: string | null;
}

export function ConnectionStatus({ isConnected, error }: ConnectionStatusProps) {
  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span className="text-xs hidden sm:inline">{error}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${isConnected ? 'text-green-500' : 'text-muted-foreground'}`}>
      {isConnected ? (
        <>
          <Wifi className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">Connected</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">Connecting...</span>
        </>
      )}
    </div>
  );
}
