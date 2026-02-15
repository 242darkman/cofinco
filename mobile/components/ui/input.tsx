import { forwardRef } from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import type { FieldError } from 'react-hook-form';

interface InputProps extends TextInputProps {
  label?: string;
  error?: FieldError;
  helperText?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    return (
      <View className="mb-4">
        {label && (
          <Text className="text-text-secondary text-sm font-medium mb-1.5">
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          className={`bg-input-bg border ${
            error ? 'border-danger' : 'border-input-border'
          } rounded-xl px-4 py-3 text-input-text text-base ${className}`}
          placeholderTextColor="#94a3b8"
          accessibilityLabel={label}
          accessibilityHint={helperText}
          {...props}
        />
        {error && (
          <Text className="text-danger text-xs mt-1">{error.message}</Text>
        )}
        {helperText && !error && (
          <Text className="text-text-muted text-xs mt-1">{helperText}</Text>
        )}
      </View>
    );
  }
);

Input.displayName = 'Input';
