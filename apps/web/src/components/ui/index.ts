/**
 * UI Component Library - MicroFlex Platform
 * Barrel export for all reusable UI components
 */

// Basic Components
export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { default as IconButton } from './IconButton';
export type { IconButtonProps, IconButtonVariant, IconButtonSize } from './IconButton';

export { default as Card } from './Card';
export type { CardProps } from './Card';

export { default as StatCard } from './StatCard';
export type { StatCardProps, StatCardColor } from './StatCard';

export { default as Badge } from './Badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './Badge';

// Table Components
export { default as ResponsiveTable } from './ResponsiveTable';
export type { ResponsiveTableProps, TableColumn } from './ResponsiveTable';

// Form Components
export { default as FormField } from './FormField';
export type { FormFieldProps } from './FormField';

export { default as Input } from './Input';
export type { InputProps } from './Input';

export { default as Switch } from './Switch';

export { default as SelectField } from './SelectField';
export type { SelectFieldProps, SelectOption } from './SelectField';

export { default as TextareaField } from './TextareaField';
export type { TextareaFieldProps } from './TextareaField';

export { default as SearchInput } from './SearchInput';
export type { SearchInputProps } from './SearchInput';

export { default as FilterBar } from './FilterBar';

export { default as SearchableSelect } from './SearchableSelect';
export type { SearchableSelectOption } from './SearchableSelect';

// Modal & Dialog Components
export { default as Modal } from './Modal';
export type { ModalProps, ModalSize, ModalVariant } from './Modal';

export { default as ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps, ConfirmDialogVariant } from './ConfirmDialog';

// Navigation Components
export { default as TabGroup } from './TabGroup';
export type { TabGroupProps, Tab, TabVariant, TabSize } from './TabGroup';

// Feedback Components
export { default as EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateAction } from './EmptyState';

export { default as ProgressBar } from './ProgressBar';
export type { ProgressBarProps, ProgressBarColor, ProgressBarSize } from './ProgressBar';

// Loading Components
export { default as LoadingScreen } from './LoadingScreen';
export { default as LoadingSpinner } from './LoadingSpinner';
export { Skeleton, SkeletonTransactionList, SkeletonBankCard } from './Skeleton';
export { Spinner } from './Spinner';
export { ClearingRing } from './ClearingRing';
export { TopProgressBar } from './TopProgressBar';

// Layout Components
export { default as PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';
export { default as SelectableCard } from './SelectableCard';
export { Pagination } from './Pagination';

// Theme Components
export { default as ThemeToggle } from './ThemeToggle';
export type { ThemeToggleProps } from './ThemeToggle';

// Tooltip
export { default as Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';

// Accordion
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';

// Feature Header (with descriptions)
export { FeatureHeader, FEATURE_DESCRIPTIONS, getFeatureDescription } from './FeatureHeader';
export type { FeatureKey } from './FeatureHeader';
