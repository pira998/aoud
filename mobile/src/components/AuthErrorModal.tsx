interface AuthErrorModalProps {
  error: string | null;
  onRetry: () => void;
  onSettings: () => void;
}

export function AuthErrorModal({ error, onRetry, onSettings }: AuthErrorModalProps) {
  if (!error) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg p-6 max-w-md">
        <h2 className="text-lg font-semibold mb-2">Authentication Failed</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <p className="text-sm text-muted-foreground mb-4">
          Please scan the QR code again from your terminal to get a valid authentication token.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onSettings}
            className="flex-1 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Settings
          </button>
          <button
            onClick={onRetry}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
