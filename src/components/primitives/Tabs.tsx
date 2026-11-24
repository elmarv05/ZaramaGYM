import * as React from 'react';
import { createContext, useCallback, useContext, useState } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

interface TabsSyncContextValue {
  currentValue: string | undefined;
  selectTab: (nextValue: string) => void;
}

const TabsSyncContext = createContext<TabsSyncContextValue | null>(null);

export const tabsListVariants = cva(
  'inline-flex w-fit max-w-full items-center overflow-x-auto overscroll-x-contain',
  {
    variants: {
      variant: {
        default:
          'bg-canvas-subtle/95 p-1 rounded-xl border border-border/85 gap-1 shadow-2xs',
        pills: 'bg-canvas-subtle p-1 rounded-xl border border-border gap-1',
        underline: 'flex w-full border-b border-border gap-4 pb-0',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export const tabsTriggerVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 font-semibold transition-[background-color,color,box-shadow,border-color] duration-150 select-none cursor-pointer focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'text-xs sm:text-[13px] px-3.5 py-1.5 rounded-lg text-txt-secondary hover:text-txt-primary border border-transparent data-[state=active]:bg-surface data-[state=active]:text-txt-primary data-[state=active]:border-border/80 data-[state=active]:shadow-xs dark:data-[state=active]:shadow-[0_1px_3px_0_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.025)]',
        pills:
          'text-xs sm:text-[13px] px-3.5 py-1.5 rounded-lg text-txt-secondary hover:text-txt-primary border border-transparent data-[state=active]:bg-surface data-[state=active]:text-txt-primary data-[state=active]:border-border/80 data-[state=active]:shadow-xs',
        underline:
          'text-xs sm:text-sm px-1 pb-2.5 pt-1 text-txt-muted hover:text-txt-primary data-[state=active]:text-txt-primary after:content-[""] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-transparent data-[state=active]:after:border-brand',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root>;

export function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState<string | undefined>(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : uncontrolledValue;

  const handleValueChange = useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [isControlled, onValueChange]
  );

  const selectTab = useCallback(
    (nextValue: string) => {
      if (nextValue === currentValue) return;
      handleValueChange(nextValue);
    },
    [currentValue, handleValueChange]
  );

  return (
    <TabsSyncContext.Provider value={{ currentValue, selectTab }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        value={isControlled ? value : uncontrolledValue}
        onValueChange={handleValueChange}
        className={cn('flex flex-col gap-4', className)}
        {...props}
      />
    </TabsSyncContext.Provider>
  );
}

export interface TabsListProps
  extends React.ComponentProps<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

export function TabsList({ className, variant = 'default', ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

export interface TabsTriggerProps
  extends React.ComponentProps<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

export function TabsTrigger({
  className,
  variant = 'default',
  value,
  disabled,
  onClick,
  ...props
}: TabsTriggerProps) {
  const syncCtx = useContext(TabsSyncContext);

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={variant}
      value={value}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled && syncCtx) {
          // Garantiza activación ante clics sintéticos o de tecnología de asistencia sin mousedown previo
          syncCtx.selectTab(value);
        }
      }}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-md',
        className
      )}
      {...props}
    />
  );
}
