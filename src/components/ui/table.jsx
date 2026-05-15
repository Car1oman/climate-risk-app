import * as React from "react"

import { cn } from "@/lib/utils"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const TableImpl = ({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props} />
  </div>
)
const Table = React.forwardRef(TableImpl)
Table.displayName = "Table"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const TableHeaderImpl = ({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
)
const TableHeader = React.forwardRef(TableHeaderImpl)
TableHeader.displayName = "TableHeader"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const TableBodyImpl = ({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props} />
)
const TableBody = React.forwardRef(TableBodyImpl)
TableBody.displayName = "TableBody"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const TableFooterImpl = ({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props} />
)
const TableFooter = React.forwardRef(TableFooterImpl)
TableFooter.displayName = "TableFooter"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const TableRowImpl = ({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props} />
)
const TableRow = React.forwardRef(TableRowImpl)
TableRow.displayName = "TableRow"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const TableHeadImpl = ({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
)
const TableHead = React.forwardRef(TableHeadImpl)
TableHead.displayName = "TableHead"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const TableCellImpl = ({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
)
const TableCell = React.forwardRef(TableCellImpl)
TableCell.displayName = "TableCell"

/** @type {React.ForwardRefRenderFunction<any, any>} */
const TableCaptionImpl = ({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props} />
)
const TableCaption = React.forwardRef(TableCaptionImpl)
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
