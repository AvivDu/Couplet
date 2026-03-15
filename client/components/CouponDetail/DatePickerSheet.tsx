import { Modal, TouchableOpacity, View, Text, FlatList, StyleSheet } from 'react-native';

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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>{title}</Text>
          <FlatList
            data={items}
            keyExtractor={item => item.value}
            style={styles.pickerList}
            renderItem={({ item }) => {
              const selected = selectedValue === item.value;
              return (
                <TouchableOpacity
                  style={[styles.pickerItem, selected && styles.pickerItemSelected]}
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                >
                  <Text style={[styles.pickerItemText, selected && styles.pickerItemTextSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#F5F0E6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C4B8A0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A2332',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerList: { flexGrow: 0 },
  pickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  pickerItemSelected: {
    backgroundColor: 'rgba(232,96,76,0.12)',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#1A2332',
    textAlign: 'center',
  },
  pickerItemTextSelected: {
    color: '#E8604C',
    fontWeight: '700',
  },
});
