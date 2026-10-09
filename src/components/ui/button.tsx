import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-aqua font-semibold text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)] hover:shadow-[var(--neon)] hover:brightness-110 hover:-translate-y-px active:translate-y-0 active:shadow-[var(--shadow-btn-active)]",
        green:
          "bg-aqua font-semibold text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)] hover:shadow-[var(--neon)] hover:brightness-110 hover:-translate-y-px active:translate-y-0 active:shadow-[var(--shadow-btn-active)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--shadow-btn)] hover:bg-destructive/90 hover:-translate-y-px active:translate-y-0 active:shadow-[var(--shadow-btn-active)]",
        outline:
          "border border-card-border bg-card/40 backdrop-blur shadow-[var(--shadow-soft)] hover:bg-accent hover:text-accent-foreground hover:-translate-y-px active:translate-y-0",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[var(--shadow-soft)] hover:bg-secondary/80 hover:-translate-y-px active:translate-y-0",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
