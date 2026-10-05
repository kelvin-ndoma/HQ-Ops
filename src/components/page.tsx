export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="font-display text-[1.7rem] leading-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card px-4 py-8">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function DataRows({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; header: string }[];
  rows: { id: string; href?: string; cells: Record<string, React.ReactNode> }[];
  empty: React.ReactNode;
}) {
  if (rows.length === 0) return empty;
  return (
    <>
      <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/80 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-3 py-2 font-medium">{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border hover:bg-muted/40">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2.5 align-top">
                    {column.key === columns[0].key && row.href ? <a className="font-medium underline-offset-2 hover:underline" href={row.href}>{row.cells[column.key]}</a> : row.cells[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <a key={row.id} href={row.href || "#"} className="block rounded-md border border-border bg-card p-3">
            <div className="font-medium">{row.cells[columns[0].key]}</div>
            <dl className="mt-2 space-y-1">
              {columns.slice(1).map((column) => (
                <div key={column.key} className="flex justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">{column.header}</dt>
                  <dd className="text-right">{row.cells[column.key]}</dd>
                </div>
              ))}
            </dl>
          </a>
        ))}
      </div>
    </>
  );
}
