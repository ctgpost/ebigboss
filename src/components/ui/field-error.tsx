import { cn } from "@/lib/utils";

interface FieldErrorProps {
  message?: string;
  className?: string;
}

/**
 * Inline form field error message — shown directly under the input.
 * Renders nothing if no message is provided.
 */
export function FieldError({ message, className }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn("text-xs font-medium text-destructive mt-1 flex items-start gap-1", className)}
    >
      <span aria-hidden="true">⚠️</span>
      <span>{message}</span>
    </p>
  );
}
