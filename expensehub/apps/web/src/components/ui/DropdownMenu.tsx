// Styled Radix dropdown (keyboard navigation, focus management and ARIA come from Radix).
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = 'end',
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-56 overflow-hidden rounded-card border border-border bg-surface p-1.5 text-ink shadow-raised',
          'origin-(--radix-dropdown-menu-content-transform-origin) motion-safe:animate-pop',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const itemClasses =
  'relative flex cursor-default select-none items-center gap-2.5 rounded-input px-2.5 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted';

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(itemClasses, className)} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClasses, 'pe-8', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute end-2.5">
        <Check aria-hidden className="text-brand!" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn(
        'px-2.5 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />;
}
