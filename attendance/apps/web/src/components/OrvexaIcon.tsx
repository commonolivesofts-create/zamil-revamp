// TypeScript port of client/src/components/icons/OrvexaIcon.jsx: renders Lucide 0.468 icon data
// (window.lucide, loaded by index.html) declaratively; never calls lucide.createIcons().
import { createElement, type ReactNode, type SVGProps } from 'react';

const camelCase = (key: string) =>
  key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function renderNode(definition: LucideNode, index: number): ReactNode {
  const [tag, attributes = {}, children = []] = definition;
  const props = Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key === 'class' ? 'className' : camelCase(key),
      value,
    ]),
  );
  return createElement(tag, { ...props, key: `${tag}-${index}` }, ...children.map(renderNode));
}

export interface OrvexaIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: string;
  size?: number;
}

export function OrvexaIcon({ name, size = 24, className, ...props }: OrvexaIconProps) {
  const key = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const icons = typeof window === 'undefined' ? undefined : window.lucide?.icons;
  const definition = icons?.[key] ?? icons?.Circle;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {definition?.[2]?.map(renderNode)}
    </svg>
  );
}
