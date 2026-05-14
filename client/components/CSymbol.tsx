import React from 'react';
import { Image } from 'react-native';

interface Props {
  size?: number;
}

export default function CSymbol({ size = 78 }: Props) {
  return (
    <Image
      source={require('../assets/logo-c.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
