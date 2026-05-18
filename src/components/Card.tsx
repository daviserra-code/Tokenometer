import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  noPadding = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={clsx(
        "rounded-xl border border-border-subtle bg-surface shadow-card",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle/70 px-5 py-4">
          <div>
            {title && (
              <h3 className="font-display text-body-lg font-semibold text-on-surface">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-[12px] text-text-muted">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={clsx(!noPadding && "p-card-padding", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-section-gap flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-h1 text-on-surface">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl font-sans text-body-md text-text-muted">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
