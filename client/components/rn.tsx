import { Text as _Text, TextInput as _TextInput } from 'react-native';
import type { TextProps, TextInputProps } from 'react-native';

export function Text(props: TextProps) {
  return <_Text allowFontScaling={false} maxFontSizeMultiplier={1} {...props} />;
}
Text.displayName = 'Text';

export function TextInput(props: TextInputProps) {
  return <_TextInput allowFontScaling={false} maxFontSizeMultiplier={1} {...props} />;
}
TextInput.displayName = 'TextInput';
