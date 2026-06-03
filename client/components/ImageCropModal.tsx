import React, { useRef, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Image,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Text } from './rn';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MIN_DIM = 50;
const HANDLE = 28;

interface Box { left: number; top: number; right: number; bottom: number; }
interface ImgRect { x: number; y: number; w: number; h: number; }
interface NatSize { w: number; h: number; }

interface Props {
  uri: string;
  onCrop: (croppedUri: string) => void;
  onCancel: () => void;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function ImageCropModal({ uri, onCrop, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [natSize, setNatSize] = useState<NatSize | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [imgRect, setImgRect] = useState<ImgRect | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [saving, setSaving] = useState(false);

  const boxRef = useRef<Box | null>(null);
  const imgRectRef = useRef<ImgRect | null>(null);

  useEffect(() => {
    Image.getSize(uri, (w, h) => setNatSize({ w, h }));
  }, [uri]);

  useEffect(() => {
    if (!natSize || !containerSize.w || !containerSize.h) return;
    const { w: cw, h: ch } = containerSize;
    const { w: nw, h: nh } = natSize;
    const imgAr = nw / nh;
    const conAr = cw / ch;
    let displayW: number, displayH: number, ox: number, oy: number;
    if (imgAr > conAr) {
      displayW = cw; displayH = cw / imgAr;
      ox = 0; oy = (ch - displayH) / 2;
    } else {
      displayH = ch; displayW = ch * imgAr;
      ox = (cw - displayW) / 2; oy = 0;
    }
    const rect: ImgRect = { x: ox, y: oy, w: displayW, h: displayH };
    imgRectRef.current = rect;
    setImgRect(rect);
    const pad = Math.min(displayW, displayH) * 0.1;
    const initial: Box = {
      left: ox + pad, top: oy + pad,
      right: ox + displayW - pad, bottom: oy + displayH - pad,
    };
    boxRef.current = initial;
    setBox(initial);
  }, [natSize, containerSize]);

  function makeCornerResponder(corner: 'tl' | 'tr' | 'bl' | 'br') {
    const startBox = { current: null as Box | null };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startBox.current = boxRef.current ? { ...boxRef.current } : null;
      },
      onPanResponderMove: (_, { dx, dy }) => {
        if (!startBox.current || !imgRectRef.current) return;
        const s = startBox.current;
        const r = imgRectRef.current;
        let { left, top, right, bottom } = s;
        if (corner === 'tl') {
          left = clamp(s.left + dx, r.x, s.right - MIN_DIM);
          top = clamp(s.top + dy, r.y, s.bottom - MIN_DIM);
          right = s.right; bottom = s.bottom;
        } else if (corner === 'tr') {
          right = clamp(s.right + dx, s.left + MIN_DIM, r.x + r.w);
          top = clamp(s.top + dy, r.y, s.bottom - MIN_DIM);
          left = s.left; bottom = s.bottom;
        } else if (corner === 'bl') {
          left = clamp(s.left + dx, r.x, s.right - MIN_DIM);
          bottom = clamp(s.bottom + dy, s.top + MIN_DIM, r.y + r.h);
          right = s.right; top = s.top;
        } else {
          right = clamp(s.right + dx, s.left + MIN_DIM, r.x + r.w);
          bottom = clamp(s.bottom + dy, s.top + MIN_DIM, r.y + r.h);
          left = s.left; top = s.top;
        }
        const nb: Box = { left, top, right, bottom };
        boxRef.current = nb;
        setBox(nb);
      },
    });
  }

  function makeMoveResponder() {
    const startBox = { current: null as Box | null };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startBox.current = boxRef.current ? { ...boxRef.current } : null;
      },
      onPanResponderMove: (_, { dx, dy }) => {
        if (!startBox.current || !imgRectRef.current) return;
        const s = startBox.current;
        const r = imgRectRef.current;
        const bw = s.right - s.left;
        const bh = s.bottom - s.top;
        const left = clamp(s.left + dx, r.x, r.x + r.w - bw);
        const top = clamp(s.top + dy, r.y, r.y + r.h - bh);
        const nb: Box = { left, top, right: left + bw, bottom: top + bh };
        boxRef.current = nb;
        setBox(nb);
      },
    });
  }

  const tlRef = useRef(makeCornerResponder('tl')).current;
  const trRef = useRef(makeCornerResponder('tr')).current;
  const blRef = useRef(makeCornerResponder('bl')).current;
  const brRef = useRef(makeCornerResponder('br')).current;
  const moveRef = useRef(makeMoveResponder()).current;

  async function handleDone() {
    if (!box || !imgRect || !natSize) return;
    setSaving(true);
    try {
      const scaleX = natSize.w / imgRect.w;
      const scaleY = natSize.h / imgRect.h;
      const originX = Math.round(Math.max(0, (box.left - imgRect.x) * scaleX));
      const originY = Math.round(Math.max(0, (box.top - imgRect.y) * scaleY));
      const width = Math.round(Math.min((box.right - box.left) * scaleX, natSize.w - originX));
      const height = Math.round(Math.min((box.bottom - box.top) * scaleY, natSize.h - originY));
      const ref = await ImageManipulator.manipulate(uri)
        .crop({ originX, originY, width, height })
        .renderAsync();
      const saved = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      onCrop(saved.uri);
    } finally {
      setSaving(false);
    }
  }

  const cropW = box ? box.right - box.left : 0;
  const cropH = box ? box.bottom - box.top : 0;

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Adjust Crop</Text>
          <TouchableOpacity onPress={handleDone} style={styles.headerBtn} disabled={saving || !box}>
            {saving
              ? <ActivityIndicator color="#E8604C" size="small" />
              : <Text style={[styles.headerBtnText, styles.doneText]}>Done</Text>}
          </TouchableOpacity>
        </View>

        <View
          style={styles.imageArea}
          onLayout={e => {
            const { width: w, height: h } = e.nativeEvent.layout;
            setContainerSize({ w, h });
          }}
        >
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />

          {box && imgRect && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              {/* dark overlay — 4 sides */}
              <View style={[styles.dark, { top: 0, left: 0, right: 0, height: box.top }]} pointerEvents="none" />
              <View style={[styles.dark, { top: box.bottom, left: 0, right: 0, bottom: 0 }]} pointerEvents="none" />
              <View style={[styles.dark, { top: box.top, left: 0, width: box.left, height: cropH }]} pointerEvents="none" />
              <View style={[styles.dark, { top: box.top, left: box.right, right: 0, height: cropH }]} pointerEvents="none" />

              {/* rule-of-thirds grid */}
              <View pointerEvents="none" style={[styles.grid, { left: box.left, top: box.top, width: cropW, height: cropH }]}>
                <View style={[styles.gridLine, styles.gridV, { left: cropW / 3 }]} />
                <View style={[styles.gridLine, styles.gridV, { left: (cropW * 2) / 3 }]} />
                <View style={[styles.gridLine, styles.gridH, { top: cropH / 3 }]} />
                <View style={[styles.gridLine, styles.gridH, { top: (cropH * 2) / 3 }]} />
                <View style={styles.cropBorder} />
              </View>

              {/* center drag area */}
              <View
                style={[styles.centerDrag, {
                  left: box.left + HANDLE,
                  top: box.top + HANDLE,
                  width: Math.max(0, cropW - HANDLE * 2),
                  height: Math.max(0, cropH - HANDLE * 2),
                }]}
                {...moveRef.panHandlers}
              />

              {/* corner handles */}
              <View style={[styles.handle, styles.handleTL, { left: box.left - HANDLE / 2, top: box.top - HANDLE / 2 }]} {...tlRef.panHandlers} />
              <View style={[styles.handle, styles.handleTR, { left: box.right - HANDLE / 2, top: box.top - HANDLE / 2 }]} {...trRef.panHandlers} />
              <View style={[styles.handle, styles.handleBL, { left: box.left - HANDLE / 2, top: box.bottom - HANDLE / 2 }]} {...blRef.panHandlers} />
              <View style={[styles.handle, styles.handleBR, { left: box.right - HANDLE / 2, top: box.bottom - HANDLE / 2 }]} {...brRef.panHandlers} />
            </View>
          )}

          {!box && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}
        </View>

        <View style={[styles.hint, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.hintText}>Drag corners to resize · Drag inside to move</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: { minWidth: 60 },
  headerBtnText: { color: '#aaa', fontSize: 16 },
  doneText: { color: '#E8604C', fontWeight: '700' },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  imageArea: {
    flex: 1,
    backgroundColor: '#111',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  dark: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  grid: {
    position: 'absolute',
    overflow: 'hidden',
  },
  cropBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridV: { width: 1, top: 0, bottom: 0 },
  gridH: { height: 1, left: 0, right: 0 },
  centerDrag: { position: 'absolute' },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    backgroundColor: '#fff',
  },
  handleTL: { borderTopLeftRadius: 4 },
  handleTR: { borderTopRightRadius: 4 },
  handleBL: { borderBottomLeftRadius: 4 },
  handleBR: { borderBottomRightRadius: 4 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  hintText: {
    color: '#666',
    fontSize: 13,
  },
});
