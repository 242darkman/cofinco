import { toast as sonnerToast } from "sonner"

type ToastProps = {
  title?: string
  description?: string
  variant?: "default" | "destructive" | "success" | "warning"
}

export function useToast() {
  return {
    toast: ({ title, description, variant }: ToastProps) => {
      if (variant === "destructive") {
        sonnerToast.error(title, { description })
      } else if (variant === "success") {
        sonnerToast.success(title, { description })
      } else if (variant === "warning") {
        sonnerToast.warning(title, { description })
      } else {
        sonnerToast(title, { description })
      }
    },
    dismiss: (id?: string | number) => sonnerToast.dismiss(id)
  }
}
