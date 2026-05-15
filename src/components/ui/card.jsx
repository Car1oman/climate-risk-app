import * as React from "react"

import { cn } from "@/lib/utils"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const CardImpl = ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-xl border bg-card text-card-foreground shadow", className)}
    {...props} />
)
const Card = React.forwardRef(CardImpl)
Card.displayName = "Card"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const CardHeaderImpl = ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props} />
)
const CardHeader = React.forwardRef(CardHeaderImpl)
CardHeader.displayName = "CardHeader"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const CardTitleImpl = ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props} />
)
const CardTitle = React.forwardRef(CardTitleImpl)
CardTitle.displayName = "CardTitle"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const CardDescriptionImpl = ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
)
const CardDescription = React.forwardRef(CardDescriptionImpl)
CardDescription.displayName = "CardDescription"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const CardContentImpl = ({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
)
const CardContent = React.forwardRef(CardContentImpl)
CardContent.displayName = "CardContent"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const CardFooterImpl = ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props} />
)
const CardFooter = React.forwardRef(CardFooterImpl)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
