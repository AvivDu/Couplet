import { FlatList } from 'react-native';
import Sheet from '../ui/Sheet';
import OptionRow from '../ui/OptionRow';

interface PickerItem {
  label: string;
  value: string;
}

interface DatePickerSheetProps {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export default function DatePickerSheet({
  visible,
  title,
  items,
  selectedValue,
  onSelect,
  onClose,
}: DatePickerSheetProps) {
  return (
    <Sheet title={title} open={visible} onClose={onClose}>
      <FlatList
        data={items}
        keyExtractor={item => item.value}
        style={{ maxHeight: 320 }}
        renderItem={({ item, index }) => (
          <OptionRow
            label={item.label}
            selected={selectedValue === item.value}
            divider={index < items.length - 1}
            onPress={() => {
              onSelect(item.value);
              onClose();
            }}
          />
        )}
      />
    </Sheet>
  );
}
