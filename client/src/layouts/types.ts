import type { ReactNode } from 'react';

/** Contract every layout shell implements. Pages only know this API, so
 * offering users alternative layouts later means adding a shell component
 * and registering it — pages stay untouched. */
export interface ShellProps {
  title: ReactNode;
  /** Back target: a path, or '' for history-back. Omit to hide the button. */
  back?: string;
  /** Page-level actions rendered in the top bar (e.g. "+ Expense"). */
  actions?: ReactNode;
  children: ReactNode;
}

export type LayoutId = 'rail';
